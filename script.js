(() => {
  const DATA = window.GAME_DATA;
  const ITEMS = DATA.items;
  const MONSTERS = DATA.monsters;
  const normalMonsters = MONSTERS.filter(m => !m.elite).sort((a, b) => a.level - b.level);

  /* ---------------- 物品实例 ----------------
     堆叠键 = `物品ID#强化等级#祝福等级`，完全相同的才堆叠：
     长剑(77#0#0) 与 长剑+1(77#1#0) 是两格，不能合并。 */
  const itemKey = (id, enhance = 0, bless = 0) => `${id}#${enhance}#${bless}`;
  const parseKey = key => {
    const parts = String(key == null ? "" : key).split("#");
    return {
      id: parts[0],
      enhance: Math.max(0, toInt(parts[1], 0)),
      bless: Math.max(0, toInt(parts[2], 0)),
    };
  };
  const keyItem = key => ITEMS[parseKey(key).id] || null;
  // 变身卡 / 娃娃卡：按品质用固定卡面（蓝=稀有、红=英雄/史诗、紫=传说）
  const CARD_ICONS = {
    transform: { 3: "2676", 4: "2672", 5: "2673" },
    doll: { 3: "2677", 4: "2674", 5: "2675" },
  };
  function iconSrc(item) {
    if (!item) return "";
    const isCard = /^\[(变身卡|魔法娃娃卡)\]/.test(item.name || "");
    const override = isCard && CARD_ICONS[item.slot] && CARD_ICONS[item.slot][item.quality];
    return `icons/${override || item.id}.png`;
  }
  // 显示用后缀：+3 / ✦（已祝福）
  // 完整显示名：+N 装备名 / 祝福的 装备名 / 祝福的 +N 装备名
  function itemLabel(key) {
    const { id, enhance, bless } = parseKey(key);
    const it = ITEMS[id];
    if (!it) return String(key);
    const plus = enhance > 0 ? `+${enhance} ` : "";
    return (bless ? "祝福的 " : "") + plus + it.name;
  }

  const keySuffix = key => {
    const { enhance, bless } = parseKey(key);
    return (enhance > 0 ? `+${enhance}` : "") + (bless ? "★" : "");
  };
  // 图标角标：强化值蓝色、祝福星星金色
  function enhLabelHtml(key) {
    const { enhance, bless } = parseKey(key);
    const parts = [];
    if (enhance > 0) parts.push(`<i class="enh-plus">+${enhance}</i>`);
    if (bless) parts.push(`<i class="enh-bless">★</i>`);
    return parts.join("");
  }
  // 强化等级是否有效（数据里最高 +14）
  const enchantLevelOf = (id, enhance) => {
    if (!enhance) return null;
    const e = (DATA.equipEnchant || {})[String(id)];
    const lv = e && e.levels ? e.levels[String(enhance)] : null;
    return lv || null;
  };

  /* ---------------- 地区索引 ----------------
     战斗不再由玩家选具体怪物，而是选地区，每场从该地区随机刷一只。
     地区名形如 "亚丁大陆-10.黑暗森林内部"，"-" 前是大类标题。 */
  const ELITE_RATE = 0.01;    // 普通怪替换为精英的概率

  const areaMap = new Map();
  for (const m of normalMonsters) {
    if (!areaMap.has(m.area)) areaMap.set(m.area, []);
    areaMap.get(m.area).push(m);
  }

  const splitAreaName = name => {
    // 次元钥匙：单独作为「次元钥匙」大类放在最后，地区显示名用「血盟突袭」
    if (name === "次元钥匙") {
      return { cat: "次元钥匙", label: "血盟突袭", family: "血盟突袭" };
    }
    const i = name.indexOf("-");
    const cat = i < 0 ? "其他地区" : name.slice(0, i);
    const raw = i < 0 ? name : name.slice(i + 1);
    // 去掉 "10.黑暗森林内部" 这种序号
    const label = raw.replace(/^\d+\.\s*/, "");
    // 家族 = 名字里第一个 "-" 之前的部分，用来把「古鲁丁地监-1楼/2楼」贴在一起。
    // 纯楼层名（如「1楼(歪曲)」「2楼」）没有 "-"，按所在大类归族，这样整座塔的楼层能连起来。
    const pureFloor = /^[一二三四五六七八九十\d]+\s*楼/.test(label);
    const family = pureFloor ? cat : label.split("-")[0].trim();
    return { cat, label, family };
  };

  // 解析名字里的楼层/序号，同时支持 "1 楼" 与 "一楼"
  const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const parseOrder = label => {
    let m = label.match(/\d+/);
    if (m) return { num: Number(m[0]), rest: label.replace(m[0], "") };
    m = label.match(/[一二三四五六七八九十]+/);
    if (m) {
      const s = m[0];
      let n;
      if (s === "十") n = 10;
      else if (s.startsWith("十")) n = 10 + (CN_NUM[s[1]] || 0);
      else if (s.endsWith("十")) n = (CN_NUM[s[0]] || 0) * 10;
      else n = CN_NUM[s[0]] || 0;
      return { num: n, rest: label.replace(s, "") };
    }
    return { num: -1, rest: label };
  };

  const areaInfo = [...areaMap.entries()].map(([name, list]) => {
    // 展示用的等级范围只统计小怪（不含首领），首领等级通常远高于小怪
    const mobs = list.filter(m => !m.boss);
    const levelPool = (mobs.length ? mobs : list).map(m => m.level);
    return {
      name,
      ...splitAreaName(name),
      minLevel: Math.min(...list.map(m => m.level)),
      maxLevel: Math.max(...list.map(m => m.level)),
      mobMin: Math.min(...levelPool),
      mobMax: Math.max(...levelPool),
      // 该地区所有本体怪的平均等级，用于大类排序
      avgLevel: list.reduce((s, m) => s + m.level, 0) / list.length,
      count: list.length,
    };
  });

  // 大类按组内最低等级排序；同家族的地区贴在一起，家族位置由等级最低的成员决定
  const areaGroups = (() => {
    const byCat = new Map();
    for (const a of areaInfo) {
      if (!byCat.has(a.cat)) byCat.set(a.cat, []);
      byCat.get(a.cat).push(a);
    }
    const groups = [];
    for (const [cat, list] of byCat) {
      // 地区按「最大等级」从低到高排序（不看最低等级），同级再按名字
      list.sort((x, y) => x.mobMax - y.mobMax || x.name.localeCompare(y.name, "zh"));

      const fams = new Map();
      for (const a of list) {
        if (!fams.has(a.family)) fams.set(a.family, []);
        fams.get(a.family).push(a);
      }
      // 组内按序号升序（1楼/一楼 都认）
      for (const members of fams.values()) {
        if (members.length < 2) continue;
        if (!members.some(m => parseOrder(m.label).num >= 0)) continue;
        members.sort((x, y) => {
          const a = parseOrder(x.label);
          const b = parseOrder(y.label);
          return a.num - b.num || a.rest.localeCompare(b.rest, "zh");
        });
      }

      const seen = new Set();
      const ordered = [];
      for (const a of list) {
        if (seen.has(a.family)) continue;
        seen.add(a.family);
        for (const b of fams.get(a.family)) ordered.push(b);
      }
      const totalCount = list.reduce((s, x) => s + x.count, 0);
      groups.push({
        cat,
        list: ordered,
        minLevel: Math.min(...list.map(x => x.minLevel)),
        // 大类的平均等级：按地区怪数加权，等价于该大类所有怪的等级平均
        avgLevel: list.reduce((s, x) => s + x.avgLevel * x.count, 0) / totalCount,
      });
    }
    // 平均等级低的大类在前；「世界副本」固定排在「次元钥匙」前（其余按等级）
    const catRank = cat => (cat === "次元钥匙" ? 2 : cat === "世界副本" ? 1 : 0);
    groups.sort((x, y) => {
      const sx = catRank(x.cat);
      const sy = catRank(y.cat);
      return sx - sy || x.avgLevel - y.avgLevel || x.cat.localeCompare(y.cat, "zh");
    });
    return groups;
  })();

  // 默认地区仍按「最低等级 → 名字」挑，避免二级目录改成最大等级排序后改变新号开局地点
  const DEFAULT_AREA = areaGroups[0].list
    .slice()
    .sort((a, b) => a.minLevel - b.minLevel || a.name.localeCompare(b.name, "zh"))[0].name;

  // 地区解锁门槛：玩家等级比该地区「最低怪等级」低 10 级以上时锁住，
  // 即 level >= minLevel - 10 才能进（相差 10 级以内仍可进入）
  const AREA_LOCK_GAP = 10;
  const areaUnlocked = (playerLevel, minLevel) => playerLevel >= minLevel - AREA_LOCK_GAP;

  // 品质色：1 普通 / 2 高级 / 3 稀有 / 4 英雄 / 5 传说 / 6 神话（金色）
  const QCOLOR = { 1: "#cfd3da", 2: "#63c46c", 3: "#4aa3c7", 4: "#e05a5a", 5: "#c061d8", 6: "#ff9d2e" };
  const QUALITY_NAMES = { 1: "普通", 2: "高级", 3: "稀有", 4: "英雄", 5: "传说", 6: "神话" };
  const SAVE_KEY = "lineagem_idle_save_v1";
  const OFFLINE_CAP = 24 * 3600;
  const GAP_SETTLE_MS = 60 * 1000;   // 两次 tick 间隔超过 1 分钟，视为后台/节流，补结算
  const MAX_SIM = 100000;   // 24 小时上限下，按最快 4 秒/只（1 回合战斗 + 3 秒重生）约 21,600 只，留余量

  /* ---------------- 等级与经验 ----------------
     升级经验 = 斐波那契数列 F(等级)
     怪物经验 X(L) = F(L) * 10 / T(L)，T(L) 是分段曲线
     于是杀 T(L)/10 只同等级怪升一级（Lv15 → 30 只，Lv50 → 630 只，Lv80 → 16650 只） */
  const START_LEVEL = 15;
  const MAX_LEVEL = 100;
  // 玩家裸身基础值
  const BASE_MAX_HP = 310;
  const BASE_ATK = 20;
  const BASE_MP = 50;
  // 怪物基础暴击（与玩家裸身一致：5% / 150%）
  const MONSTER_BASE_CRIT = 5;
  const MONSTER_BASE_CRIT_DMG = 150;

  const fibCache = [0, 1, 1];
  function fib(n) {
    if (n < 1) return 1;
    while (fibCache.length <= n) {
      fibCache.push(fibCache[fibCache.length - 1] + fibCache[fibCache.length - 2]);
    }
    return fibCache[n];
  }

  // 升到下一级所需经验
  const expToNext = level => fib(level);

  // 第三段在 L=79 的取值，也是第四段的基准（161160）
  const T_AT_79 = 6300 + 5340 * 29;

  // 怪物经验公式里的 T(L)
  // 前两段与 50-79 段保证「段内中位耗时」命中 10 分钟 / 1 小时 / 约 1 天；
  // 80 级起改为每级 ×1.5，升级难度陡然加大（Lv80→81 就已经是上一级的 1.5 倍）
  function expCurve(level) {
    const L = Math.max(1, Math.round(level));
    if (L <= 30) return 300 + 40 * (L - 15);
    if (L <= 50) return 900 + 270 * (L - 30);
    if (L < 80) return 6300 + 5340 * (L - 50);
    return T_AT_79 * Math.pow(1.5, L - 79);
  }

  // 怪物经验 X(L) = F(L) * 10 / T(L)
  function monsterExp(level) {
    const L = Math.max(1, Math.round(level));
    return (fib(L) * 10) / expCurve(L);
  }

  // 实际结算用的经验：打比自己等级高的怪只按「自己等级」的怪结算，
  // 避免越级刷经验（例如 Lv40 打 Lv50 的怪，仍然只拿 Lv40 的份）
  function expFor(monsterLevel) {
    return monsterExp(Math.min(monsterLevel, state.player.level));
  }

  const state = {
    player: {
      // base 是「裸身」属性，装备加成不写进来；maxHp/atk/def 是含装备的最终值。
      // 存档只存 base + equipment，读档后重新汇总，避免装备加成被存两遍。
      base: { maxHp: BASE_MAX_HP, atk: BASE_ATK, def: 0 },
      maxHp: BASE_MAX_HP, hp: BASE_MAX_HP, atk: BASE_ATK, def: 0,
      maxMp: BASE_MP, mp: BASE_MP, gold: 0, level: START_LEVEL, exp: 0,
      // 由装备汇总而来：5 项主属性参与暴击/命中/魔抗/幸运等换算
      stats: {
        str: 0, int: 0, dex: 0, wis: 0, con: 0, luk: 0,
        hit: 0, magicHit: 0, crit: 0, dodge: 0, mr: 0, dr: 0, dmgAdd: 0,
        mp: 0, mpRegen: 0, hpRegen: 0,
      },
      permanent: {},           // 万能药等永久属性（key → 值），读档后重新汇总
    },
    area: DEFAULT_AREA,        // 当前挂机地区
    monster: null,
    monsterHp: 0,
    bag: new Map(),            // 背包：玩家点「收获」后收下的道具
    harvest: new Map(),        // 收获区：挂机掉落的暂存（和背包是两个箱子）
    harvestGold: 0,            // 收获区里待入账的金币
    // 消耗品（type 4）：itemId -> { until, attrs, name }，不同 id 各自独立、可叠加
    consumables: new Map(),
    autoUse: new Set(),        // 勾选了「自动使用」的消耗品 id
    useCounts: new Map(),      // 特殊道具（万能药等）已使用次数：itemId -> n
    dominateCooldowns: new Map(), // 支配符冷却：itemId -> 到期时间戳(ms)
    elapsedBase: 0,
    sessionStart: Date.now(),
    kills: 0,                  // 累计击杀怪物数
    lootValue: 0,              // 累计掉落战利品价值（道具价值总和）
    autoSell: { white: false, green: false }, // 自动出售：白色 / 绿色装备
    shopStock: null,           // 铁匠铺库存：{ next, items:[{id, price, quality}] }
    death: null,               // null | "player" | "monster"，存档不保存
  };

  const DEATH_MS = 3000;       // 死亡到复活（进度环转满一圈）
  const MAX_LOGS = 60;         // 战斗记录保留条数
  let deathTimer = null;

  // 后台/节流补偿：hiddenAt 记录进入后台的时刻，lastTickAt 用于检测 tick 间隙
  let hiddenAt = document.hidden ? Date.now() : 0;
  let lastTickAt = Date.now();

  const $ = id => document.getElementById(id);
  const els = {
    area: $("areaTitle"),
    pFill2: $("playerHpFill2"), pHpText2: $("playerHpText2"), pMpText2: $("playerMpText2"), pAtk: $("playerAtk"), pDef: $("playerDef"),
    pMpFill: $("playerMpFill"), pMpStat: $("playerMpStat"),
    playerTitle: $("playerTitle"), playerLv: $("playerLv"), expPct: $("playerExpPct"), expFill: $("playerExpFill"),
    itemModal: $("itemModal"), itemCard: $("itemCard"), itemClose: $("itemClose"),
    sellModal: $("sellModal"), sellName: $("sellName"), sellCount: $("sellCount"),
    sellMinus: $("sellMinus"), sellPlus: $("sellPlus"), sellMax: $("sellMax"),
    sellGain: $("sellGain"), sellCancel: $("sellCancel"), sellConfirm: $("sellConfirm"),
    itemIcon: $("itemIcon"), itemName: $("itemName"), itemType: $("itemType"),
    itemHold: $("itemHold"), itemValue: $("itemValue"),
    itemAttrs: $("itemAttrs"), itemSet: $("itemSet"), itemDesc: $("itemDesc"), itemActions: $("itemActions"),
    itemSource: $("itemSource"), itemSafe: $("itemSafe"), itemRecipes: $("itemRecipes"),
    enhanceModal: $("enhanceModal"), enhanceClose: $("enhanceClose"),
    enhIcon: $("enhIcon"), enhIconBadge: $("enhIconBadge"), enhName: $("enhName"), enhBefore: $("enhBefore"), enhAfter: $("enhAfter"),
    enhCompare: $("enhCompare"), enhAfterTitle: $("enhAfterTitle"),
    enhScrolls: $("enhScrolls"), enhDo: $("enhDo"),
    confirmModal: $("confirmModal"), confirmText: $("confirmText"),
    choiceModal: $("choiceModal"), choiceClose: $("choiceClose"), choiceTitle: $("choiceTitle"),
    choiceHint: $("choiceHint"), choiceList: $("choiceList"),
    choiceQty: $("choiceQty"), choiceMinus: $("choiceMinus"), choiceCount: $("choiceCount"),
    choicePlus: $("choicePlus"), choiceMax: $("choiceMax"), choiceConfirm: $("choiceConfirm"),
    rewardModal: $("rewardModal"), rewardClose: $("rewardClose"), rewardTitle: $("rewardTitle"),
    rewardList: $("rewardList"), rewardOk: $("rewardOk"),
    confirmOk: $("confirmOk"), confirmCancel: $("confirmCancel"),
    sourceModal: $("sourceModal"), sourceList: $("sourceList"), sourceTitle: $("sourceTitle"),
    gold: $("goldText"),
    playerTitle: $("playerTitle"), playerLv: $("playerLv"), expPct: $("playerExpPct"), expFill: $("playerExpFill"),
    playerHpStat: $("playerHpStat"), equipBtn: $("equipBtn"), statsBtn: $("statsBtn"),
    playerView: $("playerView"), equipView: $("equipView"), equipGrid: $("equipGrid"), equipBack: $("equipBack"),
    equipSummary: $("equipSummary"),
    statsView: $("statsView"), statsBack: $("statsBack"), statsList: $("statsList"), statTip: $("statTip"),
    statsPrev: $("statsPrev"), statsNext: $("statsNext"), statsPage: $("statsPage"),
    bagPanel: $("bagPanel"), bagTabs: $("bagTabs"), bagGrid: $("bagGrid"),
    bagWindow: $("bagWindow"),
    bagClose: $("bagClose"), bagSort: $("bagSort"), bagPanelGold: $("bagPanelGold"),
    bagBtn: $("bagBtn"),
    shopBtn: $("shopBtn"), shopPanel: $("shopPanel"), shopClose: $("shopClose"),
    shopTabs: $("shopTabs"), shopGrid: $("shopGrid"), shopEmpty: $("shopEmpty"), shopGold: $("shopGold"),
    shopBanner: $("shopBanner"), shopBannerText: $("shopBannerText"), shopRefresh: $("shopRefresh"),
    alchemyPanel: $("alchemyPanel"), alchemyGrid: $("alchemyGrid"), alchemyStart: $("alchemyStart"),
    alchemyPreview: $("alchemyPreview"), alchemyKinds: $("alchemyKinds"), alchemyResult: $("alchemyResult"),
    alchemyPreviewModal: $("alchemyPreviewModal"), alchemyPreviewClose: $("alchemyPreviewClose"),
    alchemyPreviewTabs: $("alchemyPreviewTabs"), alchemyPreviewBody: $("alchemyPreviewBody"),
    craftBtn: $("craftBtn"), craftPanel: $("craftPanel"), craftClose: $("craftClose"),
    craftTabs: $("craftTabs"), craftGroups: $("craftGroups"), craftMain: $("craftMain"),
    craftList: $("craftList"), craftDetail: $("craftDetail"), craftBack: $("craftBack"),
    craftEmpty: $("craftEmpty"), craftContent: $("craftContent"),
    craftIcon: $("craftIcon"), craftName: $("craftName"), craftType: $("craftType"),
    craftRate: $("craftRate"), craftMats: $("craftMats"), craftGold: $("craftGold"),
    craftDo: $("craftDo"), craftHint: $("craftHint"), craftWallet: $("craftWallet"),
    craftQty: $("craftQty"), craftQtyMinus: $("craftQtyMinus"),
    craftQtyPlus: $("craftQtyPlus"), craftQtyMax: $("craftQtyMax"),
    activeBuffs: $("activeBuffs"),
    mName: $("monsterName"), mAvatar: $("monsterAvatar"), mAvatarName: $("monsterAvatarName"),
    pAvatar: $("playerAvatar"), pAvatarName: $("playerAvatarName"),
    mFill: $("monsterHpFill"), mHpText: $("monsterHpText"),
    statLevel: $("statLevel"), statAtk: $("statAtk"), statDef: $("statDef"), statHp: $("statHp"),
    dropPreview: $("dropPreview"),
    timer: $("timer"), bag: $("bag"), bagValue: $("bagValue"), sellBtn: $("sellBtn"),
    autoSellWhite: $("autoSellWhite"), autoSellGreen: $("autoSellGreen"),
    autoSellBtn: $("autoSellBtn"), autoSellModal: $("autoSellModal"), autoSellClose: $("autoSellClose"),
    areaBtn: $("areaBtn"), areaPicker: $("areaPicker"), areaPickerInner: $("areaPickerInner"),
    bestiaryBtn: $("bestiaryBtn"), bestiaryPanel: $("bestiaryPanel"), bestiaryClose: $("bestiaryClose"), bestiaryBody: $("bestiaryBody"),
    bestiaryCats: $("bestiaryCats"), bestiaryAreas: $("bestiaryAreas"), bestiaryMobs: $("bestiaryMobs"),
    manualTabs: $("manualTabs"), manualHero: $("manualHero"), manualContent: $("manualContent"),
    adventureBtn: $("adventureBtn"), adventurePanel: $("adventurePanel"), adventureClose: $("adventureClose"), adventureBody: $("adventureBody"),
    pFloat: $("playerFloat"), mFloat: $("monsterFloat"),
    toast: $("toast"), logList: $("logList"),
    skillBtn: $("skillBtn"), skillPanel: $("skillPanel"), skillClose: $("skillClose"),
    skillGrid: $("skillGrid"), skillTabs: $("skillTabs"),
    skillActiveCount: $("skillActiveCount"), skillPassiveCount: $("skillPassiveCount"),
    skillModal: $("skillModal"), skillModalClose: $("skillModalClose"),
    smIcon: $("smIcon"), smName: $("smName"), smLv: $("smLv"), smType: $("smType"), smMp: $("smMp"), smCarry: $("smCarry"),
    smDesc: $("smDesc"), smLevels: $("smLevels"), smMatIcon: $("smMatIcon"), smMatCount: $("smMatCount"),
    smGoldCost: $("smGoldCost"), smGoldRow: $("smGoldRow"), smUpgrade: $("smUpgrade"),
  };

  const fmt = n => Math.round(n).toLocaleString("en-US");
  // HP / MP 相关数值：完整显示，不加千分位逗号（金币/伤害等仍用 fmt）
  const fmtHpMp = n => String(Math.max(0, Math.round(Number(n) || 0)));

  /* ---------------- 伤害公式 ----------------
     减伤按「受击者的防御等级」走一条饱和曲线：
       reduce(def) = BASE + (1 - BASE) * (1 - 1 / (1 + (def / A)^P))
     实测（按当前数据表）：
       防御 0~5    → 减伤 10.0% ~ 18.8%   （低等级区域）
       防御 26~608 → 减伤 32.8% ~ 77.4%   （中等级区域）
       防御 147~1万→ 减伤 57.5% ~ 95.7%   （高等级区域）
       防御 5.6万  → 减伤 98.7%
     伤害 = floor(atk * (1 - reduce))，最低 1 点（避免双方永远打不动）。 */
  const REDUCE_BASE = 0.10;
  const REDUCE_A = 125;
  const REDUCE_P = 0.69;

  function damageReduce(def) {
    const d = Number(def) || 0;
    // 负防御：每点让减伤率下降 1%（最低降到 -100%，即最多增伤 100%）
    if (d < 0) return Math.max(-1, REDUCE_BASE + d / 100);
    const g = 1 - 1 / (1 + Math.pow(d / REDUCE_A, REDUCE_P));
    return REDUCE_BASE + (1 - REDUCE_BASE) * g;
  }

  // 基础伤害：只算「攻击力 × 防御百分比减免」，不含固定减伤 / 增伤。
  // 固定减伤（dr）与伤害增加（dmgAdd）在暴击倍率之后再加，避免被暴击放大。
  function baseDamage(atk, def) {
    const raw = (Number(atk) || 0) * (1 - damageReduce(def));
    return Math.max(1, Math.floor(raw));
  }

  // 暴击率：基础 5% + 力量 + 装备暴击；保留超过 100 / 低于 0 的原始值
  // 力量吃 buff（可为负），负力量会直接扣暴击率
  function critRate() {
    const s = state.player.stats || {};
    return 5 + (s.str || 0) + buffSum("player", "str") + (s.crit || 0);
  }

  // 暴击伤害：150% + 力量，最低 100%
  // 暴击伤害：150% + 力量，再乘暴击伤害加成（装备/消耗品 + buff 的 critDmg%），最低 100%
  function critDamagePct() {
    const s = state.player.stats || {};
    const base = Math.max(100, 150 + (s.str || 0) + buffSum("player", "str"));
    const extra = (s.critDmg || 0) + buffSumPct("player", "critDmg");
    return Math.max(100, base * (1 + extra / 100));
  }

  // 离线期望：暴击率截到 0–100 后，按暴击倍率折算期望伤害
  function expectedCritMultiplier() {
    const chance = Math.max(0, Math.min(100, critRate())) / 100;
    return 1 + chance * (critDamagePct() / 100 - 1);
  }

  // 魔抗抵抗负面效果：同等级 5x 点 = 100%；每少 x/20 点，中招率 +1%
  function magicResistChance(monsterLevel) {
    const lv = Math.max(1, Number(monsterLevel) || 1);
    const mr = (state.player.stats && state.player.stats.mr) || 0;
    return Math.max(0, Math.min(100, (20 * mr) / lv));
  }

  /* ---------------- 命中与闪避 ----------------
     先算攻方的基础命中（等级优势可以超过 100%，不做中间截断），
     再减去守方的装备闪避率，最后才做 0~100% 截断：
       基础命中 = 85% + 3% × (攻方等级 − 守方等级) + 攻方装备命中 / 100
       装备闪避 = 85% × (1 − 1/(1 + (闪避值/37)^1.55))      ← 渐近 85%，永不达到
       最终命中 = clamp(基础命中 − 装备闪避, 0, 100%)
     例：怪高玩家 10 级 → 基础命中 115%，玩家闪避 23.64% → 命中 91.36%。
     等级差足够大时（≥29 级）基础命中 ≤ 0，仍然可以得到 100% 闪避，
     但单靠装备永远到不了。命中点（hit）1 点 = +1%，与闪避值的曲线口径不同。 */
  const BASE_HIT = 0.85;
  const HIT_PER_LEVEL = 0.03;
  const DODGE_MAX = 0.85;
  const DODGE_A = 37;
  const DODGE_P = 1.55;

  function gearDodge(value) {
    const v = Number(value) || 0;
    // 负闪避：每点让对方的命中率 +1%（即自身更易被命中）
    if (v < 0) return v / 100;
    if (v <= 0) return 0;
    return DODGE_MAX * (1 - 1 / (1 + Math.pow(v / DODGE_A, DODGE_P)));
  }

  // 返回命中概率（0~1）。atkHit 是装备命中点，1 点 = +1%
  function hitChance(atkLevel, defLevel, atkHit = 0, defDodgeValue = 0) {
    const base = BASE_HIT + HIT_PER_LEVEL * (atkLevel - defLevel) + (Number(atkHit) || 0) / 100;
    const hit = base - gearDodge(defDodgeValue);
    return Math.max(0, Math.min(1, hit));
  }

  /* ---------------- 全流程整数化 ----------------
     生命、攻击、防御、伤害、金币一律整数，显示与内部永远一致。
     权重修正（mod）允许小数，不参与取整。            */
  const toInt = (v, fallback = 0) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? n : fallback;
  };

  for (const it of Object.values(ITEMS)) {
    it.value = Math.max(0, toInt(it.value, 0));
  }
  for (const m of MONSTERS) {
    m.level = toInt(m.level, 1);
    m.hp = Math.max(1, toInt(m.hp, 1));
    m.atk = Math.max(0, toInt(m.atk, 0));
    m.def = Math.max(0, toInt(m.def, 0));
  }

  /* ---------------- 存档 ---------------- */
  function snapshot() {
    return {
      // v3：物品实例化（强化/祝福单独堆叠）
      v: 3,
      player: {
        // base 是裸身属性；maxHp/atk/def 同时保留最终值，方便旧读档回退
        base: { ...state.player.base },
        maxHp: state.player.maxHp,
        atk: state.player.atk,
        def: state.player.def,
        maxMp: state.player.maxMp,
        mp: state.player.mp,
        gold: state.player.gold,
        level: state.player.level,
        exp: state.player.exp,
        permanent: { ...state.player.permanent },
      },
      equipment: { ...equipment },
      skills: {
        learned: [...skillState.learned],
        enabled: [...skillState.enabled],
        levels: { ...skillState.levels },
      },
      area: state.area,
      bag: [...state.bag],
      harvest: [...state.harvest],
      harvestGold: state.harvestGold,
      kills: state.kills,
      lootValue: state.lootValue,
      autoSell: { ...state.autoSell },
      // 消耗品 buff（剩余时间 + 自动使用勾选）
      consumables: [...state.consumables].map(([id, c]) => [id, { until: c.until, name: c.name, attrs: c.attrs }]),
      autoUse: [...state.autoUse],
      useCounts: [...state.useCounts],
      dominateCooldowns: [...state.dominateCooldowns],
      shopStock: state.shopStock,
      elapsed: elapsedSeconds(),
      // 最后一次真正战斗/进入后台的时间，离线结算用它而不是 savedAt，
      // 避免后台每 10 秒自动存档把「离线起点」推后、吞掉后台时长。
      activeAt: lastTickAt,
      savedAt: Date.now(),
    };
  }

  function saveState() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot()));
    } catch (e) { /* 存储不可用时静默忽略 */ }
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // 只认 v3（物品实例化：强化/祝福单独堆叠），旧档直接作废
      return data && data.v === 3 ? data : null;
    } catch (e) { return null; }
  }

  function applySave(saved) {
    const p = saved.player || {};
    // 读档时统一规范化，避免手改存档带进小数或异常值。
    // 新存档带 base（裸身属性），旧存档没有，就把旧的最终值当作裸身值。
    const b = p.base && typeof p.base === "object" ? p.base : p;
    state.player.base.maxHp = Math.max(100, toInt(b.maxHp, BASE_MAX_HP));
    state.player.base.atk = Math.max(0, toInt(b.atk, BASE_ATK));
    state.player.base.def = Math.max(0, toInt(b.def, 0));
    state.player.gold = Math.max(0, toInt(p.gold, 0));

    // 万能药等永久属性：只接受已知属性 key，数值取整
    const perm = {};
    for (const [k, v] of Object.entries(p.permanent || {})) {
      const n = toInt(v, 0);
      if (n !== 0 && GEAR_KEYS.includes(k)) perm[k] = n;
    }
    state.player.permanent = perm;

    // 等级与经验：老存档没有这两个字段，按初始等级处理
    state.player.level = Math.min(MAX_LEVEL, Math.max(1, toInt(p.level, START_LEVEL)));
    const need = expToNext(state.player.level);
    const exp = Number(p.exp);
    state.player.exp = Number.isFinite(exp) && exp > 0 ? Math.min(exp, need) : 0;

    // 存档里的地区可能已不存在；存在就保留（传送卷轴可能把玩家送到未解锁地区）
    // 次元钥匙不是可挂机地区，旧存档/异常数据里出现时忽略
    const savedArea = areaInfo.find(a => a.name === saved.area && a.name !== "次元钥匙");
    if (savedArea) {
      state.area = savedArea.name;
    } else {
      // 退到当前等级能进的、等级最高的地区
      const usable = areaInfo.filter(a => areaUnlocked(state.player.level, a.minLevel));
      usable.sort((a, b) => b.minLevel - a.minLevel || a.name.localeCompare(b.name, "zh"));
      state.area = usable.length ? usable[0].name : DEFAULT_AREA;
    }
    const bag = new Map();
    for (const [key, n] of saved.bag || []) {
      const k = String(key);
      if (!keyItem(k)) continue;
      const count = Math.max(0, toInt(n, 0));
      if (count > 0) bag.set(k, count);
    }
    state.bag = bag;

    // 收获区（挂机暂存）：键同样是「物品ID#强化#祝福」
    const harvest = new Map();
    for (const [key, n] of saved.harvest || []) {
      const k = String(key);
      if (!keyItem(k)) continue;
      const count = Math.max(0, toInt(n, 0));
      if (count > 0) harvest.set(k, count);
    }
    state.harvest = harvest;
    state.harvestGold = Math.max(0, toInt(saved.harvestGold, 0));
    state.kills = Math.max(0, toInt(saved.kills, 0));
    state.lootValue = Math.max(0, toInt(saved.lootValue, 0));
    const autoSell = saved.autoSell || {};
    state.autoSell = { white: !!autoSell.white, green: !!autoSell.green };
    // 商店库存：结构不对（旧版铁匠铺单店格式也算不对）就当作没有，下次打开重新生成
    const ss = saved.shopStock;
    state.shopStock = (ss && typeof ss === "object" && (ss.blacksmith || ss.blackmarket)) ? ss : null;

    // 消耗品 buff：只恢复未过期且道具存在的条目；勾选了自动使用的过期条目保留「枯竭」状态
    const autoSet = new Set((saved.autoUse || []).map(String));
    state.consumables = new Map();
    for (const [id, c] of saved.consumables || []) {
      const item = ITEMS[String(id)];
      if (!item || item.type !== 4 || !c || !Array.isArray(c.attrs)) continue;
      if (Number(c.until) <= Date.now()) {
        if (autoSet.has(String(id))) {
          state.consumables.set(String(id), { until: 0, name: c.name || item.name, attrs: c.attrs, exhausted: true });
        }
        continue;
      }
      state.consumables.set(String(id), { until: Number(c.until), name: c.name || item.name, attrs: c.attrs });
    }
    state.autoUse = new Set([...autoSet].filter(id => ITEMS[id] && ITEMS[id].type === 4));

    // 特殊道具已成功次数：键为「道具ID:属性key」（万能药每种属性独立计算成功率）
    const uc = new Map();
    for (const [key, n] of saved.useCounts || []) {
      const k = String(key);
      const itemId = k.split(":")[0];
      const v = toInt(n, 0);
      if (v > 0 && ITEMS[itemId]) uc.set(k, v);
    }
    state.useCounts = uc;

    // 支配符冷却：只保留有效道具、尚未到期的条目
    const dc = new Map();
    for (const [id, until] of saved.dominateCooldowns || []) {
      const k = String(id);
      const t = toInt(until, 0);
      const it = ITEMS[k];
      if (it && it.use && it.use.kind === "dominateBoss" && t > Date.now()) dc.set(k, t);
    }
    state.dominateCooldowns = dc;

    // 装备：只接受「道具存在 + 类型是装备 + 部位匹配」的条目，脏数据直接跳过。
    // 装备栏存的是完整实例键（含强化/祝福），卸下时才回到背包。
    for (const k of Object.keys(equipment)) delete equipment[k];
    const eq = saved.equipment && typeof saved.equipment === "object" ? saved.equipment : {};
    for (const slot of EQUIP_SLOTS) {
      const key = eq[slot.key] == null ? null : String(eq[slot.key]);
      const item = key ? keyItem(key) : null;
      if (item && item.type === 3 && item.slot === slot.key) equipment[slot.key] = key;
    }

    // 双手武器与副手互斥：读档时若武器是双手，副手自动卸回背包
    const savedWeapon = equipment["weapon"] ? keyItem(equipment["weapon"]) : null;
    if (savedWeapon && savedWeapon.twoHanded && equipment["offhand"]) {
      const offKey = equipment["offhand"];
      state.bag.set(offKey, (state.bag.get(offKey) || 0) + 1);
      delete equipment["offhand"];
    }

    // 技能：旧版本曾默认「全部学会」，那种存档视为未学习，避免玩家没学也能携带
    if (saved.skills && typeof saved.skills === "object") {
      let learned = (saved.skills.learned || []).map(String);
      if (learned.length >= SKILLS.length) learned = [];
      skillState.learned = new Set(learned);
      skillState.enabled = new Set(
        (saved.skills.enabled || []).map(String).filter(id => skillState.learned.has(id))
      );
      skillState.levels = { ...(saved.skills.levels || {}) };
    }

    // base 与装备都就位后再汇总，最后把血量和法力补满
    recalcStats();
    state.player.hp = state.player.maxHp;
    state.player.mp = state.player.maxMp;

    state.elapsedBase = Math.max(0, Number(saved.elapsed) || 0);
    state.sessionStart = Date.now();
  }

  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  /* ---------------- 刷怪 ---------------- */
  // 按权重抽一只：普通怪权重 1，稀有怪 0.01（即刷新率只有普通怪的 1%）
  function pickWeighted(pool) {
    let total = 0;
    const w = pool.map(m => {
      const v = 1;
      total += v;
      return v;
    });
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= w[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // 抽一只并判 5% 精英；稀有怪没有精英副本，不会被替换
  // BOSS 刷新概率 = 普通怪的 1/1000
  // 基础金币掉落：每只怪必掉，随等级增长（30 级几十 / 60 级两三百 / 80+ 接近 1000），带 ±15% 浮动
  function goldFor(level) {
    const lv = Math.max(1, toInt(level, 1));
    let base;
    if (lv <= 30) base = 10 + lv * 1.5;
    else if (lv <= 60) base = 55 + (lv - 30) * 6.8;
    else base = 259 + (lv - 60) * 35;
    const jitter = 0.85 + Math.random() * 0.3;
    return Math.max(1, Math.round(base * jitter));
  }

  const BOSS_SPAWN_RATE = 0.001;   // 每只首领各自的遇敌概率
  function spawnFor(pool) {
    const bossPool = pool.filter(m => m.boss && !m.elite);
    // 地区内每只首领各 0.1%：N 只首领 → 遇到首领的总概率 N × 0.1%
    if (bossPool.length && Math.random() < BOSS_SPAWN_RATE * bossPool.length) {
      return pickWeighted(bossPool);
    }
    const normalPool = pool.filter(m => !m.boss);
    const m = pickWeighted(normalPool.length ? normalPool : pool);
    const luck = (state.player.stats && state.player.stats.luk) || 0;
    const eliteChance = Math.max(0, Math.min(1, ELITE_RATE + 0.005 * luck));
    if (!m.boss && Math.random() < eliteChance) {
      const elite = MONSTERS.find(x => x.id === m.id && x.elite);
      if (elite) return elite;
    }
    return m;
  }

  /* ---------------- 离线收益 ----------------
     addElapsed=false 用于「页面一直在、只是后台被节流」的补结算：
     这时挂机计时已经按真实时间走过了，不能再往 elapsedBase 上加一遍。 */
  function settleOffline(savedAt, areaName, addElapsed = true) {
    const sec = Math.min((Date.now() - savedAt) / 1000, OFFLINE_CAP);
    if (!Number.isFinite(sec) || sec < 60) return 0;

    const pool = areaMap.get(areaName) || normalMonsters;

    // 离线按期望值结算：普攻 × 命中率 × 暴击期望 + 技能的每回合期望伤害（技能不暴击不闪避）
    // 怪物闪避/命中基础为 0，但吃 buff，所以这里也走 effHit / effDodge
    // 装备「贯通效果」无视目标闪避
    const playerHitRate = m => hitChance(state.player.level, m.level, effHit("player"),
      Math.max(0, effDodge("monster") - passiveIgnoreDodge()));
    // 首领攻击命中：等级差只奖励不惩罚（玩家等级更高时不扣命中）
    const monsterHitRate = m => hitChance(m.boss ? Math.max(m.level, state.player.level) : m.level, state.player.level, effHit("monster"), effDodge("player"));
    // 玩家技能对这只怪的抵抗率（离线里没有 state.monster，按单只怪算）
    const resistVs = m => {
      const area = m.area || "";
      const baseMr = (area.startsWith("亚丁大陆") || area.startsWith("说话之岛")) ? m.level : m.level * 2;
      const mr = Math.max(0, baseMr - 10 * effMagicHit("player"));
      return Math.max(0, Math.min(100, (20 * mr) / Math.max(1, state.player.level)));
    };
    // 装备「攻击时」触发的每回合期望额外伤害（含魔抗抵抗）
    const equipAttackDps = m => {
      let bonus = 0;
      const hitPct = 1 - resistVs(m) / 100;
      for (const t of playerEquipTriggers()) {
        if (t.cfg.trigger !== "attack") continue;
        const chance = (t.chance == null ? 100 : Number(t.chance)) / 100;
        let dmg = 0;
        for (const e of t.cfg.effects || []) {
          if (e.type !== "damage") continue;
          const raw = e.mult ? state.player.atk * e.mult : (e.base || 0);
          dmg += (Math.max(1, Math.floor(raw)) + (state.player.stats.dmgAdd || 0)) * playerDmgOut();
        }
        if (dmg > 0) bonus += dmg * chance * hitPct;
      }
      return bonus;
    };
    // 怪物技能的晕眩 / 沉默，对玩家每回合输出与控制的影响（含玩家魔抗抵抗）
    const ccCache = new Map();
    const ccOf = m => {
      if (ccCache.has(m.id)) return ccCache.get(m.id);
      let stun = 0, silence = 0;
      const resistPct = Math.max(0, Math.min(100, (20 * effMr("player")) / Math.max(1, m.level)));
      for (const sid of (m.skills || [])) {
        const s = SKILL_BY_ID.get(String(sid));
        const eff = (s && s.levels && s.levels[4]) || null;
        const st = eff && eff.status;
        if (!st || !st.name) continue;
        const chance = (eff.chance == null ? 100 : eff.chance) / 100;
        let perRound = 0;
        if (s.kind === "攻击时") perRound = chance;
        else if (s.kind === "每N回合") perRound = chance / Math.max(1, toInt(s.interval, 1));
        else if (s.kind === "战斗开始时") perRound = 0.1;
        perRound *= (1 - resistPct / 100);
        if (st.name === "晕眩") stun += perRound;
        else if (st.name === "沉默") silence += perRound;
      }
      const out = { stun: Math.min(1, stun), silence: Math.min(1, silence) };
      ccCache.set(m.id, out);
      return out;
    };
    // 技能期望伤害：受沉默与 MP 预算约束（一场按 10 回合摊，含每回合 MP 回复）
    const playerSkillDps = cc => {
      const silence = cc ? cc.silence : 0;
      const mpRegen = state.player.stats.mpRegen || 0;
      const mpPerRound = (state.player.maxMp || 0) / 10 + mpRegen;
      let bonus = 0;
      for (const s of activeSkills("player")) {
        const eff = skillEffect("player", s);
        if (!eff || !eff.damage) continue;
        const raw = eff.damage.mult
          ? state.player.atk * eff.damage.mult
          : (eff.damage.base || 0) + (eff.damage.int || 0) * state.player.stats.int;
        const dmg = (Math.max(1, Math.floor(raw)) + (state.player.stats.dmgAdd || 0)) * playerDmgOut();
        const chance = (eff.chance != null ? eff.chance : 100) / 100;
        let perRound = 0;
        if (s.kind === "攻击时") perRound = chance;
        else if (s.kind === "每N回合") perRound = chance / Math.max(1, toInt(s.interval, 1));
        else if (s.kind === "战斗开始时") perRound = 0.1;   // 每场一次，按 10 回合一场粗算
        perRound *= (1 - silence);
        if (s.mp > 0) perRound = Math.min(perRound, mpPerRound / s.mp);
        bonus += dmg * perRound;
      }
      return bonus;
    };
    const perHitOf = m => {
      const cc = ccOf(m);
      const base = (baseDamage(state.player.atk, m.def) * expectedCritMultiplier()
        + (state.player.stats.dmgAdd || 0)) * playerDmgOut();
      // 晕眩：该回合跳过行动，等效输出打折
      return (base * playerHitRate(m) + playerSkillDps(cc) + equipAttackDps(m)) * (1 - cc.stun);
    };
    const killTimeOf = m => {
      const hit = perHitOf(m);
      if (hit <= 0) return Infinity;
      // 与在线一致：首领每回合回血（傲慢/信念/世界副本 0.5 系数，其余 0.25；表里有 regen 优先）
      if (m.boss) {
        const regenRate = /^(傲慢之塔|信念之塔|世界副本)/.test(m.area || "") ? 0.5 : 0.25;
        const bossRegen = (m.regen != null) ? Number(m.regen) : Math.round(m.level * regenRate);
        const net = hit - Math.max(1, bossRegen);
        return net > 0 ? Math.ceil(m.hp / net) : Infinity;
      }
      return Math.ceil(m.hp / hit);
    };
    // 怪物技能（满级）的每回合期望伤害，粗略计入
    const monsterSkillDps = m => {
      let bonus = 0;
      for (const id of (m.skills || [])) {
        const s = SKILL_BY_ID.get(String(id));
        if (!s) continue;
        const eff = (s.levels && s.levels[4]) || null;
        if (!eff || !eff.damage) continue;
        const raw = eff.damage.mult
          ? m.atk * eff.damage.mult
          : (eff.damage.base || 0) + (eff.damage.int || 0) * Math.floor(m.level / 4);
        const dmg = Math.max(1, Math.floor(raw) - (state.player.stats.dr || 0)) * playerDmgIn();
        const chance = (eff.chance != null ? eff.chance : 100) / 100;
        let perRound = 0;
        if (s.kind === "攻击时") perRound = chance;
        else if (s.kind === "每N回合") perRound = chance / Math.max(1, toInt(s.interval, 1));
        else if (s.kind === "战斗开始时") perRound = 0.1;
        bonus += dmg * perRound;
      }
      return bonus;
    };
    // 装备「HP 吸收」：按实际伤害的百分比回血（折算成每回合回血）
    const equipDrainHp = m => {
      let pct = 0;
      for (const t of playerEquipTriggers()) {
        if (t.cfg.trigger !== "passive") continue;
        for (const e of t.cfg.effects || []) {
          if (e.type === "drain" && e.hp) pct += Number(e.hp) || 0;
        }
      }
      return pct > 0 ? perHitOf(m) * pct / 100 : 0;
    };
    const deathTimeOf = m => {
      const hit = Math.max(1, baseDamage(m.atk, state.player.def) - (state.player.stats.dr || 0)) * playerDmgIn()
        + monsterSkillDps(m);
      // 先挨打再回复：单次命中就能打死时，回复来不及生效
      if (hit >= state.player.maxHp) {
        const rate = monsterHitRate(m);
        return rate > 0 ? Math.ceil(1 / rate) : Infinity;
      }
      const net = hit * monsterHitRate(m) - (state.player.stats.hpRegen || 0) - equipDrainHp(m);
      return net > 0 ? Math.ceil(state.player.maxHp / net) : Infinity;
    };

    let remain = sec;
    let kills = 0;
    let gained = 0;
    let goldGained = 0;
    let deaths = 0;
    let guard = 0;
    const lvBefore = state.player.level;

    while (remain > 0 && kills < MAX_SIM && guard++ < MAX_SIM * 4) {
      // 与在线完全一致：抽到什么打什么，不挑怪
      const mon = spawnFor(pool);
      const killTime = killTimeOf(mon);
      const deathTime = deathTimeOf(mon);

      if (Number.isFinite(killTime) && killTime < deathTime) {
        // 打得死：按击杀耗时推进
        if (killTime > remain) break;
        remain -= killTime;
        kills++;
        state.kills += 1;
        // 与在线一致：首领掉 3 次，普通/精英掉 1 次
        const rolls = mon.boss ? 3 : 1;
        for (let ri = 0; ri < rolls; ri++) {
          const drop = rollDrop(mon);
          if (drop) {
            const n = dropCountOf(mon, drop);
            gainDrop(drop, n);
            gained += n;
          }
        }
        // 首领额外掉落，与在线一致
        if (mon.boss) {
          const extra = rollBossExtraDrop(mon);
          if (extra) {
            const n = dropCountOf(mon, extra);
            gainDrop(extra, n);
            gained += n;
          }
        }
        const goldMul = mon.boss ? 20 : (mon.elite ? 3 : 1);
        const gold = goldFor(mon.level) * goldMul;
        state.harvestGold += gold;
        state.lootValue += gold;
        goldGained += gold;
        // 与在线一致：升级后立即重算属性，后面的战斗按新面板结算
        if (addExp(expFor(mon.level)) > 0) recalcStats();
        // 怪物死亡后要等 3 秒才刷新下一只，与在线 enterDeath 的 DEATH_MS 保持一致
        remain -= DEATH_MS / 1000;
      } else if (Number.isFinite(deathTime)) {
        // 打不过：被这只怪打死，照常消耗时间，没有收获
        if (deathTime > remain) break;
        remain -= deathTime;
        deaths++;
        // 勇者阵亡后同样要等 3 秒复活
        remain -= DEATH_MS / 1000;
      } else {
        // 双方都打不动对方（破不了防、也打不死人），无法结算
        break;
      }
    }

    if (addElapsed) state.elapsedBase += sec;
    // 离线升级后按新等级重新汇总属性（HP / 攻击 / 防御等级 / 主属性成长）
    recalcStats();
    // 离线期间 MP 也按每秒回复（没有技能消耗时通常已经是满的）
    if (state.player.stats.mpRegen > 0) {
      state.player.mp = Math.min(state.player.maxMp, state.player.mp + state.player.stats.mpRegen * sec);
    }
    renderBag();
    renderPlayer();
    renderTimer();

    if (kills > 0 || deaths > 0) {
      const detail = [`在「${areaName}」击败 <b>${fmt(kills)}</b> 只怪物，获得 <b>${fmt(gained)}</b> 件道具、金币 <b>${fmt(goldGained)}</b>`];
      if (deaths > 0) detail.push(`阵亡 <b>${fmt(deaths)}</b> 次`);
      if (state.player.level > lvBefore) detail.push(`等级提升至 <b>Lv${state.player.level}</b>`);
      showToast(`离线 ${formatDuration(sec)}，` + detail.join('，'));
    } else {
      showToast(`离线 ${formatDuration(sec)}，但在「${areaName}」没有战斗结算`);
    }
    return sec;
  }

  // 从后台回到前台：按真实隐藏时长补一次离线结算。
  // 计时器已经包含了这段真实时间，所以 addElapsed=false，避免挂机时长翻倍。
  function resumeFromHidden() {
    if (!hiddenAt) {
      lastTickAt = Date.now();
      return;
    }
    const start = hiddenAt;
    hiddenAt = 0;
    const now = Date.now();
    const hiddenSec = Math.max(0, (now - start) / 1000);
    const settled = settleOffline(start, state.area, false);

    // 超过 24 小时上限时，计时器已经多算了超出部分，把它扣回来
    if (hiddenSec > OFFLINE_CAP && settled > 0) {
      state.sessionStart += (hiddenSec - OFFLINE_CAP) * 1000;
    }

    lastTickAt = Date.now();
    if (settled > 0) {
      startBattle();   // 后台前那只怪已经不该继续打了，重开一场
      renderTimer();
      saveState();
    }
  }

  function formatDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} 小时 ${m} 分`;
    return `${m} 分钟`;
  }

  function showToast(html) {
    els.toast.innerHTML = html;
    els.toast.classList.add("show");
    clearTimeout(els.toast._t);
    els.toast._t = setTimeout(() => els.toast.classList.remove("show"), 3000);
  }

  /* ---------------- 计时 ---------------- */
  function elapsedSeconds() {
    return state.elapsedBase + (Date.now() - state.sessionStart) / 1000;
  }

  function renderTimer() {
    const s = Math.floor(elapsedSeconds());
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    els.timer.textContent = `${hh}:${mm}:${ss}`;
  }

  /* ---------------- 战斗 ---------------- */
  // 头像上的名字：精英 / 首领换行显示前缀
  const avatarLabel = m => (m.elite ? "[精英]\n" : m.boss ? "[首领]\n" : "") + m.name;
  // 战斗记录里的名字：单行
  const logLabel = m => (m.elite ? "[精英] " : m.boss ? "[首领] " : "") + m.name;
  // 右侧面板的名字前缀
  const namePrefix = m => (m.elite ? "[精英] " : m.boss ? "[首领] " : "");

  function startBattle() {
    clearTimeout(deathTimer);
    deathTimer = null;
    state.death = null;
    lastTickAt = Date.now();

    // 每场战斗从当前地区随机刷一只
    const pool = areaMap.get(state.area) || normalMonsters;
    let monster = null;
    if (state.pendingBoss) {
      monster = DATA.monsters.find(m => String(m.id) === String(state.pendingBoss));
      state.pendingBoss = null;
    }
    monster = monster || spawnFor(pool);
    state.monster = monster;
    state.monsterHp = monster.hp;
    state.player.hp = state.player.maxHp;
    state.player.mp = state.player.maxMp;
    resetBattleSkills();
    renderMonster();
    renderPlayer();
    renderArea();
    renderDeath();
    // 战斗开始时技能：玩家先，再怪物
    triggerBattleStart();
    clampBattleHp();
    renderBars();
  }

  /* ---------------- 死亡与复活 ---------------- */
  function enterDeath(side) {
    state.death = side;
    // 击杀/阵亡日志：X 被击败了（X = 勇者或怪物名）；怪物死亡绿色、勇者死亡红色
    const deadName = side === "player" ? "勇者" : (state.monster ? state.monster.name : "怪物");
    pushLog(side === "player" ? "kill player-dead" : "kill", `${esc(deadName)}被击败了`);
    renderDeath();
    clearTimeout(deathTimer);
    deathTimer = setTimeout(() => {
      deathTimer = null;
      state.death = null;
      startBattle();
    }, DEATH_MS);
  }

  function renderDeath() {
    const pDead = state.death === "player";
    const mDead = state.death === "monster";

    // 先摘掉再挂上，保证进度环动画每次都从头播放
    els.pAvatar.classList.remove("dead");
    els.mAvatar.classList.remove("dead");
    if (pDead || mDead) void els.mAvatar.offsetWidth;

    if (pDead) els.pAvatar.classList.add("dead");
    if (mDead) els.mAvatar.classList.add("dead");

    els.pAvatarName.textContent = pDead ? "[已死亡] 勇者" : "勇者";
    if (state.monster) {
      els.mAvatarName.textContent = mDead ? "[已死亡] " + state.monster.name : avatarLabel(state.monster);
    }
  }

  /* ---------------- 战斗记录 ---------------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function pushLog(cls, html) {
    const list = els.logList;
    if (!list) return;

    // 追加前先判断用户是不是停在底部：只有停在底部才继续跟随
    const gap = list.scrollHeight - list.scrollTop - (list.clientHeight || 0);
    const follow = gap <= 8;

    const el = document.createElement("div");
    el.className = "log-line " + cls;
    el.innerHTML = html;
    list.appendChild(el);

    if (follow) {
      // 跟随最新：按正常上限裁剪，并滚到底
      while (list.children.length > MAX_LOGS) {
        list.removeChild(list.firstChild);
      }
      list.scrollTop = list.scrollHeight;
    } else {
      // 用户正在翻历史：先不裁剪，否则顶部删行会让内容整体上移、正在看的行跑掉。
      // 只保留一个硬上限，防止一直不滚回底部时无限增长。
      while (list.children.length > MAX_LOGS * 3) {
        list.removeChild(list.firstChild);
      }
    }
  }

  function logDamage(dir, from, to, dmg, crit = false) {
    const cls = dir + (dmg <= 0 ? " zero" : "") + (crit ? " crit" : "");
    pushLog(cls, `${esc(from)}对${esc(to)}造成了<b class="num">${fmt(dmg)}</b>点伤害${crit ? "（暴击）" : ""}`);
  }

  function logMiss(dir, attacker, defender) {
    pushLog(dir + " miss", `${esc(defender)}闪避了${esc(attacker)}的攻击`);
  }

  function logDrop(monName, itemId, count = 1) {
    const it = ITEMS[itemId];
    if (!it) return;
    const color = QCOLOR[it.quality] || "#fff";
    const suffix = count > 1 ? ` ×${count}` : "";
    pushLog(
      "drop",
      `${esc(monName)} 掉落了<b class="num item" style="color:${color}">${esc(it.name)}${suffix}</b>`
    );
  }

  /* ---------------- 技能战斗 ---------------- */
  // 同回合多技能按类型优先级：生命低于 > 法力低于 > Buff > 每N回合 > 战斗开始时 > 受击时 > 攻击时
  const SKILL_PRIORITY = {
    "生命低于": 1, "法力低于": 2, "每N回合": 4,
    "战斗开始时": 5, "受击时": 6, "攻击时": 7,
  };

  function newSideState() {
    return { buffs: [], statuses: [], used: new Set(), round: 0 };
  }

  const battleState = { player: newSideState(), monster: newSideState() };

  function resetBattleSkills() {
    battleState.player = newSideState();
    battleState.monster = newSideState();
  }

  function actorLabel(side) {
    return side === "player" ? "勇者" : logLabel(state.monster);
  }

  // 按类型优先级排序；同优先级内部随机顺序（每次触发时重新洗牌）
  function sortByPriority(list) {
    const sorted = list.slice().sort((a, b) => (SKILL_PRIORITY[a.kind] || 9) - (SKILL_PRIORITY[b.kind] || 9));
    let i = 0;
    while (i < sorted.length) {
      const prio = SKILL_PRIORITY[sorted[i].kind] || 9;
      let j = i;
      while (j + 1 < sorted.length && (SKILL_PRIORITY[sorted[j + 1].kind] || 9) === prio) j++;
      if (j > i) {
        for (let k = j; k > i; k--) {
          const r = i + Math.floor(Math.random() * (k - i + 1));
          [sorted[k], sorted[r]] = [sorted[r], sorted[k]];
        }
      }
      i = j + 1;
    }
    return sorted;
  }

  function activeSkills(side) {
    if (side === "player") {
      const out = [];
      for (const id of skillState.enabled) {
        const s = SKILL_BY_ID.get(String(id));
        if (s && skillState.learned.has(String(s.id))) out.push(s);
      }
      return sortByPriority(out);
    }
    const m = state.monster;
    if (!m || !Array.isArray(m.skills)) return [];
    return sortByPriority(m.skills.map(id => SKILL_BY_ID.get(String(id))).filter(Boolean));
  }

  function skillLevelOf(side, skill) {
    return side === "player" ? skillLevel(String(skill.id)) : 5;
  }

  function skillEffect(side, skill) {
    const lv = skillLevelOf(side, skill);
    return (skill.levels && skill.levels[lv - 1]) || null;
  }

  function skillMpCost(side, skill) {
    if (side !== "player") return 0;
    const base = Math.max(0, toInt(skill.mp, 0));
    // 魔法大师等：mpCost 百分比降低
    const cut = buffSumPct("player", "mpCost");
    return Math.max(0, Math.round(base * (1 - cut / 100)));
  }

  function buffSum(side, key) {
    let n = 0;
    for (const b of battleState[side].buffs) n += (b.stats && b.stats[key]) || 0;
    return n;
  }

  const hasStatus = (side, name) => battleState[side].statuses.some(s => s.name === name);
  const isStunned = side => hasStatus(side, "晕眩");
  const isSilenced = side => hasStatus(side, "沉默");

  function addBuff(side, skill, stats, dur, atRoundStart, pctStats, sets) {
    const sid = String(skill.id);
    const list = battleState[side].buffs;
    // 金龙之力：玩家免疫属性降低（负面 buff 的负值部分直接过滤掉）
    const immuneStatDown = side === "player" && playerEquipTriggers().some(t =>
      (t.cfg.effects || []).some(e => e.type === "immuneStatDown"));
    if (immuneStatDown && stats) {
      stats = Object.fromEntries(Object.entries(stats).filter(([, v]) => Number(v) >= 0));
    }
    // 回合开始时加的 buff 当回合结束就算一回合；攻击/受击后加的从下回合结束才算
    const addedRound = battleState[side].round - (atRoundStart ? 1 : 0);
    const ex = list.find(b => b.skillId === sid);
    if (ex) {                      // 同技能不叠加，只刷新持续时间
      ex.dur = Math.max(ex.dur, dur);
      ex.addedRound = addedRound;
      return;
    }
    list.push({
      skillId: sid, stats: { ...stats }, pctStats: { ...(pctStats || {}) },
      sets: { ...(sets || {}) },
      dur, name: skill.name, addedRound,
    });
  }

  function addStatus(side, skill, name, dur, atRoundStart) {
    const sid = String(skill.id);
    const list = battleState[side].statuses;
    const addedRound = battleState[side].round - (atRoundStart ? 1 : 0);
    const ex = list.find(s => s.skillId === sid && s.name === name);
    if (ex) {
      ex.dur = Math.max(ex.dur, dur);
      ex.addedRound = addedRound;
      return;
    }
    list.push({ skillId: sid, name, dur, addedRound });
  }

  // 当回合刚加的 buff / 状态不递减，从下个回合结束才开始算一回合
  function decaySide(side) {
    const st = battleState[side];
    for (const b of st.buffs) if (b.dur > 0 && st.round > b.addedRound) b.dur--;
    st.buffs = st.buffs.filter(b => b.dur !== 0);
    for (const s of st.statuses) if (s.dur > 0 && st.round > s.addedRound) s.dur--;
    st.statuses = st.statuses.filter(s => s.dur !== 0);
  }

  // 有效属性（基础 + 临时 buff + 百分比加成）
  const monsterInt = m => Math.floor((m ? m.level : 0) / 4);
  // buff 里带的「直接设值」（如魔抗归零）：找到第一个覆盖该属性的 buff
  function buffSetSum(side, key) {
    for (const b of battleState[side].buffs) {
      if (b.sets && Object.prototype.hasOwnProperty.call(b.sets, key)) return b.sets[key];
    }
    return null;
  }

  function buffSumPct(side, key) {
    let n = 0;
    for (const b of battleState[side].buffs) n += (b.pctStats && b.pctStats[key]) || 0;
    return n;
  }
  const applyPct = (base, pct) => base * (1 + (pct || 0) / 100);

  // 有效属性 = 基础 + buff + 百分比。
  // 怪物除智力外基础值都是 0，但同样吃 buff（可以加也可以减）。
  // 属性允许减到负数：负力量扣暴击率/暴击伤害、负闪避提高对方命中、负防御降低减伤，以此类推。
  // 怪物基础属性：目前只有 dr（特殊副本按等级×系数给），其余为 0
  const sideStat = (side, key) => {
    if (side === "player") return state.player.stats[key] || 0;
    const m = state.monster;
    const v = m ? m[key] : 0;
    return typeof v === "number" ? v : 0;
  };
  const buffedStat = (side, key) =>
    sideStat(side, key) + buffSum(side, key) + buffSumPct(side, key);

  const effAtk = side => applyPct(
    (side === "player" ? state.player.atk : state.monster.atk) + buffSum(side, "atk"),
    buffSumPct(side, "atk"));
  const effDef = side => applyPct(
    (side === "player" ? state.player.def : state.monster.def) + buffSum(side, "def"),
    buffSumPct(side, "def"));
  const effDr = side => buffedStat(side, "dr");
  const effMr = side => {
    const set = buffSetSum(side, "mr");
    return set != null ? set : buffedStat(side, "mr");
  };
  // 智力：玩家看面板，怪物基础 = floor(level/4)，同样吃 buff
  const effInt = side =>
    (side === "player" ? (state.player.stats.int || 0) : monsterInt(state.monster))
    + buffSum(side, "int") + buffSumPct(side, "int");
  const effStr = side => buffedStat(side, "str");
  const effDex = side => buffedStat(side, "dex");
  const effWis = side => buffedStat(side, "wis");
  const effCon = side => buffedStat(side, "con");
  const effLuk = side => buffedStat(side, "luk");
  // 最大 HP：1 点体质 buff = +50 HP（与面板口径一致），再乘 HP 百分比加成
  const effMaxHp = side => side === "player"
    ? applyPct(state.player.maxHp + buffSum("player", "hp") + 50 * buffSum("player", "con"),
        buffSumPct("player", "hp"))
    : state.monster.hp;
  const effMaxMp = () => applyPct(state.player.maxMp + buffSum("player", "mp"), buffSumPct("player", "mp"));
  const effHit = side => buffedStat(side, "hit");
  // 魔法命中：只作用于玩家释放的技能，1 点抵消目标 10 点魔抗
  const effMagicHit = side => buffedStat(side, "magicHit");
  // 伤害增加：玩家造成伤害时额外加固定值（不参与暴击倍率）
  const effDmgAdd = side => buffedStat(side, "dmgAdd");
  // 百分比增伤 / 减伤（装备品质加成）：造成伤害 ×(1 + 增伤%)，受到伤害 ×(1 - 减伤%)
  const playerDmgOut = () => 1 + ((state.player.stats && state.player.stats.dmgAddPct) || 0) / 100;
  const playerDmgIn = () => Math.max(0, 1 - Math.min(100, (state.player.stats && state.player.stats.drPct) || 0) / 100);
  const effDodge = side => buffedStat(side, "dodge");
  const effCrit = () => critRate() + buffSum("player", "crit") + buffSumPct("player", "crit");

  // 魔抗抵抗：目标按魔抗/施法者等级判定
  function resistChance(caster, target) {
    if (target === "player") {
      return Math.max(0, Math.min(100, (20 * effMr("player")) / Math.max(1, state.monster.level)));
    }
    // 怪物魔抗：亚丁大陆（含地监）/ 说话之岛 = 等级×1（抵抗率约 20%），其他 = 等级×2（约 40%）
    // 玩家的魔法命中按 1 点 = 10 魔抗抵扣，扣到 0 为止（即对低级怪可完全跳过抵抗）
    const m = state.monster;
    const lowMr = m.area.startsWith('亚丁大陆') || m.area.startsWith('说话之岛');
    const baseMr = lowMr ? m.level : m.level * 2;
    const mr = Math.max(0, baseMr - 10 * effMagicHit("player"));
    return Math.max(0, Math.min(100, (20 * mr) / Math.max(1, state.player.level)));
  }

  /* ---------------- 装备触发效果 ---------------- */
  const EQUIP_SKILLS = DATA.equipSkills || {};

  // 玩家身上所有装备触发效果（基础 + 当前强化档）
  function playerEquipTriggers() {
    const list = [];
    for (const slot of EQUIP_SLOTS) {
      const key = equipment[slot.key];
      if (!key) continue;
      const { id, enhance } = parseKey(key);
      const item = ITEMS[id];
      if (!item) continue;
      const push = (triggers) => {
        for (const t of triggers || []) {
          const cfg = EQUIP_SKILLS[t.name];
          if (!cfg) continue;
          list.push({
            name: t.name,
            chance: t.chance == null ? 100 : Number(t.chance),
            cfg,
            item,
          });
        }
      };
      push(item.triggers);
      const lv = enchantLevelOf(id, enhance);
      if (lv) push(lv.triggers);
    }
    return list;
  }

  // 被动类：无视闪避（贯通效果）
  function passiveIgnoreDodge() {
    let v = 0;
    for (const t of playerEquipTriggers()) {
      if (t.cfg.trigger !== "passive") continue;
      for (const e of t.cfg.effects || []) {
        if (e.type === "ignoreDodge") v += Number(e.value) || 0;
      }
    }
    return v;
  }

  // 执行一条装备触发效果（伤害 / 吸血吸蓝 / buff / 控制）
  function applyEquipTrigger(side, trig, dealtDamage = 0) {
    const foe = side === "player" ? "monster" : "player";
    const fakeSkill = { id: `eq:${trig.name}`, name: trig.name, quality: (trig.item && trig.item.quality) || 1 };
    const eqName = `<b class="q${fakeSkill.quality}">${esc(trig.item.name)}</b>`;
    const effects = trig.cfg.effects || [];

    // 整条触发只判定一次抵抗：有敌方效果才需要判定，抵抗则全部效果无效
    const hasEnemyEffect = effects.some(e =>
      e.type === "damage"
      || ((e.type === "buff" || e.type === "status") && e.target === "enemy"));
    if (hasEnemyEffect && Math.random() * 100 < resistChance(side, foe)) {
      pushLog("miss", `${esc(actorLabel(foe))}抵抗了${eqName}的${esc(trig.name)}`);
      return 0;
    }

    let thisDamage = 0;
    // 按约定顺序：状态 → 伤害/治疗 → 自身属性 → 敌方属性
    const statusParts = [];
    const damageParts = [];
    const selfParts = [];
    const foeParts = [];
    let foeNamed = false;

    // 单属性写具体，多属性写「属性提高/降低」，混合「属性变化」
    const describeStats = (stats) => {
      const upNames = [];
      const downNames = [];
      for (const [k, v] of Object.entries(stats || {})) {
        const label = GEAR_NAME[k] || k;
        if (Number(v) < 0) downNames.push(label);
        else upNames.push(label);
      }
      const total = upNames.length + downNames.length;
      if (total === 1) return `${downNames[0] || upNames[0]}${downNames.length ? "降低" : "提高"}`;
      if (total > 1) {
        return (downNames.length && upNames.length)
          ? "属性变化"
          : (downNames.length ? "属性降低" : "属性提高");
      }
      return "";
    };

    for (const eff of effects) {
      if (eff.type === "ignoreDodge") continue;   // 命中判定阶段已处理
      if (eff.type === "damage") {
        const raw = (eff.base || 0)
          + (eff.int || 0) * effInt(side)
          + (eff.str || 0) * effStr(side)
          + (eff.dex || 0) * effDex(side);
        let dmg = Math.max(1, Math.floor(raw) - effDr(foe)
          + (side === "player" ? effDmgAdd("player") : 0));
        dmg = Math.max(1, Math.floor(dmg * (side === "player" ? playerDmgOut() : playerDmgIn())));
        if (foe === "player") {
          state.player.hp = Math.max(0, state.player.hp - dmg);
          floatDamage(els.pFloat, dmg, false, false, true);
        } else {
          state.monsterHp = Math.max(0, state.monsterHp - dmg);
          floatDamage(els.mFloat, dmg, false, false, true);
        }
        thisDamage += dmg;
        const dmgText = `造成了<b class="num">${fmt(dmg)}</b>点伤害`;
        const hasPrefix = statusParts.length > 0 || damageParts.length > 0;
        damageParts.push(hasPrefix ? `并${dmgText}` : `对${esc(actorLabel(foe))}${dmgText}`);
        foeNamed = true;
      } else if (eff.type === "drain") {
        // 按本次造成的实际伤害折算（没有伤害时用本次普攻伤害）；纯吸血吸蓝不写日志
        const base = dealtDamage || thisDamage;
        if (base <= 0) continue;
        const pct = Number(eff.pct) || 0;
        const amount = Math.max(1, Math.round(base * pct / 100));
        if (eff.resource === "mp") {
          state.player.mp = Math.min(effMaxMp(), state.player.mp + amount);
        } else {
          state.player.hp = Math.min(effMaxHp("player"), state.player.hp + amount);
          floatHeal(els.pFloat, amount);
        }
      } else if (eff.type === "buff") {
        const target = eff.target === "enemy" ? foe : side;
        addBuff(target, fakeSkill, eff.stats || {}, eff.dur, false, null, eff.set);
        const setSeg = eff.set
          ? Object.keys(eff.set).map(k => `${GEAR_NAME[k] || k}归零`).join("、")
          : "";
        const seg = [describeStats(eff.stats), setSeg].filter(Boolean).join("、");
        if (seg) {
          if (target === foe) {
            foeParts.push(foeNamed ? seg : `${esc(actorLabel(foe))}的${seg}`);
            foeNamed = true;
          } else {
            selfParts.push(seg);
          }
        }
      } else if (eff.type === "heal") {
        const amount = Math.max(0, Math.floor((eff.base || 0) + (eff.int || 0) * effInt(side)));
        if (side === "player") {
          state.player.hp = Math.min(effMaxHp("player"), state.player.hp + amount);
          floatHeal(els.pFloat, amount);
        } else {
          state.monsterHp = Math.min(effMaxHp("monster"), state.monsterHp + amount);
        }
        parts.push(`回复了<b class="num">${fmtHpMp(amount)}</b>点生命`);
      } else if (eff.type === "status") {
        const target = eff.target === "enemy" ? foe : side;
        addStatus(target, fakeSkill, eff.name, eff.dur, false);
        statusParts.push(`${esc(actorLabel(target))}陷入${eff.name}`);
        if (target === foe) foeNamed = true;
      }
    }

    const parts = [...statusParts, ...damageParts, ...selfParts, ...foeParts];
    if (parts.length) {
      pushLog("skill", `${eqName}触发了${esc(trig.name)}，${parts.join("，")}`);
    }
    return thisDamage;
  }

  // 攻击时触发（按装备概率）
  function triggerEquipAttack(side, dealtDamage) {
    let extra = 0;
    for (const t of playerEquipTriggers()) {
      if (t.cfg.trigger !== "attack") continue;
      if (Math.random() * 100 >= t.chance) continue;
      extra += applyEquipTrigger(side, t, dealtDamage);
    }
    return extra;
  }

  // 战斗开始时 / 回合开始时触发（同样按装备概率掷骰；被动类不走这里）
  function triggerEquipWhen(side, when) {
    for (const t of playerEquipTriggers()) {
      if (t.cfg.trigger !== when) continue;
      if (Math.random() * 100 >= t.chance) continue;
      applyEquipTrigger(side, t, 0);
    }
  }

  // 被动吸血/吸蓝（按本次普攻实际伤害）
  function triggerEquipDrain(side, dealtDamage) {
    if (dealtDamage <= 0) return;
    for (const t of playerEquipTriggers()) {
      if (t.cfg.trigger !== "passive") continue;
      const hasDrain = (t.cfg.effects || []).some(e => e.type === "drain");
      if (!hasDrain) continue;
      applyEquipTrigger(side, { ...t, cfg: { trigger: t.cfg.trigger, effects: (t.cfg.effects || []).filter(e => e.type === "drain") } }, dealtDamage);
    }
  }

  // 受击时技能：伤害结算前判定「免疫本次伤害」（终极屏障）
  function tryImmuneOnHit(side) {
    for (const s of activeSkills(side).filter(x => x.kind === "受击时")) {
      const lv = skillLevelOf(side, s);
      const eff = (s.levels && s.levels[lv - 1]) || null;
      if (!eff || !eff.immune) continue;
      const chance = Number(eff.chance) || 0;
      if (Math.random() < chance) {
        pushLog("skill", `${esc(actorLabel(side))}使用了<b class="q${s.quality}">${esc(s.name)}</b>，免疫了本次伤害`);
        return true;
      }
    }
    return false;
  }

  function castSkill(side, skill, atRoundStart = false) {
    const eff = skillEffect(side, skill);
    if (!eff) return false;
    const foe = side === "player" ? "monster" : "player";
    const cost = skillMpCost(side, skill);
    if (cost > 0 && state.player.mp < cost) return false;

    const hasEnemyEffect = !!(eff.damage || eff.enemy || eff.status);
    const resisted = hasEnemyEffect && Math.random() * 100 < resistChance(side, foe);

    if (cost > 0) state.player.mp = Math.max(0, state.player.mp - cost);

    if (resisted) {
      // 抵抗日志与闪避日志同样式（灰色 .miss），不再用技能行的蓝色样式
      pushLog("miss", `${esc(actorLabel(foe))}抵抗了${esc(actorLabel(side))}的${esc(skill.name)}`);
      return true;
    }

    const parts = [];
    let damage = 0;
    // 是否已经在日志里点过敌人（状态/伤害），避免后文再重复「怪物」
    let foeNamed = false;

    if (eff.status) {
      addStatus(foe, skill, eff.status.name, eff.status.dur, atRoundStart);
      parts.push(`${esc(actorLabel(foe))}陷入${eff.status.name}`);
      foeNamed = true;
    }

    if (eff.damage) {
      let raw;
      if (eff.damage.mult) raw = effAtk(side) * eff.damage.mult;
      else raw = (eff.damage.base || 0)
        + (eff.damage.int || 0) * effInt(side)
        + (eff.damage.str || 0) * effStr(side)
        + (eff.damage.dex || 0) * effDex(side);
      damage = Math.max(1, Math.floor(raw) - effDr(foe) + (side === "player" ? effDmgAdd("player") : 0));
      damage = Math.max(1, Math.floor(damage * (side === "player" ? playerDmgOut() : playerDmgIn())));
      if (foe === "player") {
        state.player.hp = Math.max(0, state.player.hp - damage);
        floatDamage(els.pFloat, damage, false, false, true);
      } else {
        state.monsterHp = Math.max(0, state.monsterHp - damage);
        floatDamage(els.mFloat, damage, false, false, true);
      }
      const dmgText = `造成了<b class="num">${fmt(damage)}</b>点伤害`;
      // 前面已经有状态等描述时用「并造成了」，避免重复目标名
      if (parts.length) {
        parts.push(`并${dmgText}`);
      } else {
        parts.push(`对${esc(actorLabel(foe))}${dmgText}`);
        foeNamed = true;
      }
    }

    if (eff.heal) {
      const amount = eff.heal.pct
        ? Math.floor(effMaxHp(side) * eff.heal.pct / 100)
        : Math.floor((eff.heal.base || 0) + (eff.heal.int || 0) * effInt(side));
      if (eff.heal.mp) {
        state.player.mp = Math.min(effMaxMp(), state.player.mp + amount);
        floatHeal(els.pFloat, amount);
        parts.push(`回复了<b class="num">${fmtHpMp(amount)}</b>点法力`);
      } else if (side === "player") {
        state.player.hp = Math.min(effMaxHp("player"), state.player.hp + amount);
        floatHeal(els.pFloat, amount);
        parts.push(`回复了<b class="num">${fmtHpMp(amount)}</b>点生命`);
      } else {
        state.monsterHp = Math.min(effMaxHp("monster"), state.monsterHp + amount);
        parts.push(`回复了<b class="num">${fmtHpMp(amount)}</b>点生命`);
      }
      if (eff.heal.mpBase) {
        state.player.mp = Math.min(effMaxMp(), state.player.mp + eff.heal.mpBase);
        parts.push(`回复了<b class="num">${fmtHpMp(eff.heal.mpBase)}</b>点法力`);
      }
    }

    if (eff.self) {
      addBuff(side, skill, eff.self.stats, eff.self.dur, atRoundStart, eff.self.pctStats);
      const upNames = [];
      const downNames = [];
      for (const [k, v] of Object.entries(eff.self.stats || {})) {
        const label = GEAR_NAME[k] || k;
        if (Number(v) < 0) downNames.push(label);
        else upNames.push(label);
      }
      const total = upNames.length + downNames.length;
      let seg = "";
      if (total === 1) {
        seg = `${downNames[0] || upNames[0]}${downNames.length ? "降低" : "提高"}`;
      } else if (total > 1) {
        seg = (downNames.length && upNames.length)
          ? "属性变化"
          : (downNames.length ? "属性降低" : "属性提高");
      }
      parts.push(seg || "强化");
    }

    // 免疫类效果由受击前的 tryImmuneOnHit 处理（当次生效），这里不再挂标记

    // 魔镜：从「战斗开始时」触发的传说技能中随机复刻一个作为自身效果
    if (eff.randomLegend) {
      const pool = GAME_DATA.skills.filter(
        s => s.quality === 5 && s.kind === "战斗开始时" && s.id !== skill.id
          && Array.isArray(s.levels) && s.levels.length && s.levels[0]
      );
      if (pool.length) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        // 按魔镜自身的技能等级取对应等级效果
        const lv = skillLevelOf(side, skill);
        const sub = pick.levels[Math.min(Math.max(0, lv - 1), pick.levels.length - 1)] || pick.levels[0];
        if (sub.damage) {
          const raw = (sub.damage.base || 0)
            + (sub.damage.int || 0) * effInt(side)
            + (sub.damage.str || 0) * effStr(side)
            + (sub.damage.dex || 0) * effDex(side);
          let dmg = Math.max(1, Math.floor(raw) - effDr(foe)) + (side === "player" ? effDmgAdd("player") : 0);
          dmg = Math.max(1, Math.floor(dmg * (side === "player" ? playerDmgOut() : playerDmgIn())));
          if (foe === "monster") state.monsterHp = Math.max(0, state.monsterHp - dmg);
          else state.player.hp = Math.max(0, state.player.hp - dmg);
          parts.push(`魔镜复刻「${esc(pick.name)}」造成${fmt(dmg)}点伤害`);
        }
        if (sub.heal) {
          const amt = sub.heal.pct
            ? Math.floor(effMaxHp(side) * sub.heal.pct / 100)
            : Math.floor((sub.heal.base || 0) + (sub.heal.int || 0) * effInt(side));
          if (side === "player") state.player.hp = Math.min(effMaxHp("player"), state.player.hp + amt);
          else state.monsterHp = Math.min(effMaxHp("monster"), state.monsterHp + amt);
          parts.push(`魔镜复刻「${esc(pick.name)}」回复${fmtHpMp(amt)}点生命`);
        }
        if (sub.self) {
          addBuff(side, pick, sub.self.stats, sub.self.dur, atRoundStart, sub.self.pctStats);
          parts.push(`魔镜复刻「${esc(pick.name)}」强化自身`);
        }
        if (sub.enemy) {
          addBuff(foe, pick, sub.enemy.stats, sub.enemy.dur, atRoundStart, sub.enemy.pctStats);
          parts.push(`魔镜复刻「<b class="q${pick.quality}">${esc(pick.name)}</b>」削弱敌人`);
        }
        if (sub.status) {
          addStatus(foe, pick, sub.status.name, sub.status.dur, atRoundStart);
          parts.push(`魔镜复刻「<b class="q${pick.quality}">${esc(pick.name)}</b>」使敌人${sub.status.name}`);
        }
      }
    }

    if (eff.enemy) {
      addBuff(foe, skill, eff.enemy.stats, eff.enemy.dur, atRoundStart, eff.enemy.pctStats);
      const upNames = [];
      const downNames = [];
      for (const [k, v] of Object.entries(eff.enemy.stats || {})) {
        const label = GEAR_NAME[k] || k;
        if (Number(v) < 0) downNames.push(label);
        else upNames.push(label);
      }
      const total = upNames.length + downNames.length;
      let seg = "";
      if (total === 1) {
        seg = `${downNames[0] || upNames[0]}${downNames.length ? "降低" : "提高"}`;
      } else if (total > 1) {
        seg = (downNames.length && upNames.length)
          ? "属性变化"
          : (downNames.length ? "属性降低" : "属性提高");
      }
      if (seg) {
        parts.push(foeNamed ? seg : `${esc(actorLabel(foe))}的${seg}`);
        foeNamed = true;
      } else {
        parts.push(`${esc(actorLabel(foe))}被削弱`);
        foeNamed = true;
      }
    }

    // 技能自损（如会心一击：释放后扣自身 HP，不会把自己扣死）
    if (eff.selfCost && eff.selfCost.hp && side === "player") {
      const cost = Math.max(0, toInt(eff.selfCost.hp, 0));
      state.player.hp = Math.max(1, state.player.hp - cost);
      parts.push(`自身损失<b class="num">${fmtHpMp(cost)}</b>点生命`);
    }

    const head = `${esc(actorLabel(side))}使用了<b class="q${skill.quality}">${esc(skill.name)}</b>`;
    pushLog("skill", parts.length ? `${head}，${parts.join("，")}` : head);
    return true;
  }

  function triggerBattleStart() {
    for (const side of ["player", "monster"]) {   // 玩家先
      if (isStunned(side) || isSilenced(side)) continue;
      for (const s of activeSkills(side).filter(x => x.kind === "战斗开始时")) {
        castSkill(side, s, true);
      }
    }
    // 装备的「战斗开始时」触发效果（如起死回生术）
    triggerEquipWhen("player", "battleStart");
  }

  function triggerTurnStart() {
    for (const side of ["player", "monster"]) {
      const st = battleState[side];
      st.round++;
      if (isStunned(side) || isSilenced(side)) continue;
      for (const s of activeSkills(side).filter(x => x.kind === "每N回合")) {
        const eff = skillEffect(side, s);
        if (!eff) continue;
        const interval = Math.max(1, toInt(s.interval, 1));
        if (st.round % interval !== 0) continue;
        if (eff.chance != null && Math.random() * 100 >= eff.chance) continue;
        castSkill(side, s, true);
      }
      // 装备的「回合开始时」触发效果（如猛爆剧毒）
      if (side === "player") triggerEquipWhen("player", "roundStart");
    }
  }

  function triggerAttack(side) {
    if (isStunned(side) || isSilenced(side)) return;
    for (const s of activeSkills(side).filter(x => x.kind === "攻击时")) {
      const eff = skillEffect(side, s);
      if (!eff) continue;
      if (eff.chance != null && Math.random() * 100 >= eff.chance) continue;
      castSkill(side, s);
    }
  }

  function triggerHurt(side) {
    if (isSilenced(side)) return;
    for (const s of activeSkills(side).filter(x => x.kind === "受击时")) {
      const eff = skillEffect(side, s);
      if (!eff) continue;
      if (eff.chance != null && Math.random() * 100 >= eff.chance) continue;
      castSkill(side, s);
    }
  }

  // 生命/法力低于阈值：受伤后立即检查，每场最多一次
  function triggerThreshold(side) {
    if (side !== "player" || isStunned(side) || isSilenced(side)) return;
    for (const s of activeSkills(side).filter(x => x.kind === "生命低于" || x.kind === "法力低于")) {
      const sid = String(s.id);
      if (battleState.player.used.has(sid)) continue;
      const eff = skillEffect(side, s);
      if (!eff) continue;
      const th = toInt(s.threshold, 0);
      if (th <= 0) continue;
      const pct = s.kind === "生命低于"
        ? (state.player.hp / Math.max(1, effMaxHp("player"))) * 100
        : (state.player.mp / Math.max(1, effMaxMp())) * 100;
      if (pct > th) continue;
      battleState.player.used.add(sid);
      castSkill(side, s);
    }
  }

  // 被动技能加成（激活的被动，按当前等级）
  /* ---------------- 消耗品（type 4） ---------------- */
  // 当前生效的消耗品 buff（不同 id 独立叠加，同 id 只有一条，重复使用只刷新时间）
  function consumableBonus() {
    const total = {}, pct = {};
    for (const [id, c] of state.consumables) {
      if (!c || c.until <= Date.now()) continue;
      for (const a of c.attrs || []) {
        if (!a || !GEAR_KEYS.includes(a.key)) continue;
        if (a.pct) pct[a.key] = (pct[a.key] || 0) + toInt(a.value, 0);
        else total[a.key] = (total[a.key] || 0) + toInt(a.value, 0);
      }
    }
    return { total, pct };
  }

  // 按道具 ID 找一件可用实例（背包优先，其次收获区），返回 { map, key }
  function findConsumableKey(itemId) {
    const id = String(itemId);
    for (const [k, c] of state.bag) if (parseKey(k).id === id && c > 0) return { map: "bag", key: k };
    for (const [k, c] of state.harvest) if (parseKey(k).id === id && c > 0) return { map: "harvest", key: k };
    return null;
  }

  // 读档/启动时：勾了自动使用但当前没有生效 buff 的，从背包补吃一个（离线过期后回来立刻续上）
  function resumeAutoConsumables() {
    for (const id of [...state.autoUse]) {
      if (state.consumables.has(id)) continue;
      if (findBagItemKey(id)) useConsumable(id);
    }
  }

  // 挂机地点标题左上角：生效中的消耗品图标（自动使用带 E，右下角显示剩余数量）
  function renderActiveBuffs() {
    if (!els.activeBuffs) return;
    els.activeBuffs.innerHTML = "";
    const now = Date.now();
    for (const [id, c] of state.consumables) {
      if (!c) continue;
      const auto = state.autoUse.has(String(id));
      const left = countItem(id);
      const expired = !!c.exhausted || c.until <= Date.now();
      // 自动使用：过期或库存为 0 都按「枯竭」置灰保留；手动吃的过期就消失
      const exhausted = auto ? (expired || left <= 0) : expired;
      if (exhausted && !auto) continue;
      const item = ITEMS[id];
      if (!item) continue;
      const box = document.createElement("div");
      box.className = "active-buff" + (exhausted ? " off" : "");
      // 自动使用的显示剩余数量，手动吃的只显示图标（不再画 E）
      box.innerHTML =
        `<img src="${iconSrc(item)}" alt="">` +
        (auto ? `<span class="bn">${exhausted ? 0 : left}</span>` : "");
      box.title = exhausted
        ? `${item.name}（已用完，自动使用中）`
        : `${item.name}${auto ? "（自动使用中）" : ""}，剩余 ${left} 个`;
      box.style.cursor = "pointer";
      box.addEventListener("click", ev => {
        ev.stopPropagation();
        showItemDetail(itemKey(id, 0, 0));
      });
      els.activeBuffs.appendChild(box);
    }
  }

  // 使用一个消耗品：消耗 1 个，施加限时 buff（同 id 只刷新持续时间）
  function useConsumable(itemId) {
    const item = ITEMS[itemId];
    if (!item || item.type !== 4 || !item.use) return false;
    const found = findConsumableKey(itemId);
    if (!found) return false;
    const bagMap = found.map === "bag" ? state.bag : state.harvest;
    const count = bagMap.get(found.key) || 0;
    if (count <= 1) bagMap.delete(found.key);
    else bagMap.set(found.key, count - 1);
    state.consumables.set(String(itemId), {
      until: Date.now() + item.use.seconds * 1000,
      name: item.name,
      attrs: item.use.attrs,
    });
    recalcStats();
    renderBag();
    renderPlayer();
    renderStats();
    renderActiveBuffs();
    return true;
  }

  // 按道具 ID 找背包里的一件（自动使用只认背包，不碰收获区）
  function findBagItemKey(itemId) {
    const id = String(itemId);
    for (const [k, c] of state.bag) if (parseKey(k).id === id && c > 0) return k;
    return null;
  }

  // 每 tick：清掉到期 buff；勾了「自动使用」且**背包里还有**的，自动再吃一个（勾选保留）
  // 吃完没货时保留一条「枯竭」记录（左上角显示置灰图标 + 0），补货后自动续上
  function tickConsumables() {
    const now = Date.now();
    let changed = false;
    for (const [id, c] of [...state.consumables]) {
      if (c.exhausted) {
        // 已经吃光：补货了就从背包续上，否则继续保留置灰
        if (findBagItemKey(id)) {
          useConsumable(id);
          changed = true;
        }
        continue;
      }
      if (c.until > now) continue;
      if (state.autoUse.has(id)) {
        // 自动使用：优先续用；没货则标记枯竭但保留条目
        if (findBagItemKey(id)) {
          useConsumable(id);
        } else {
          c.exhausted = true;
        }
        changed = true;
        continue;
      }
      state.consumables.delete(id);
      changed = true;
    }
    if (changed) {
      recalcStats();
      renderPlayer();
      renderBag();
      renderStats();
    }
    renderActiveBuffs();
  }

  function passiveSkillStats() {
    const total = {};
    for (const id of skillState.enabled) {
      const s = SKILL_BY_ID.get(String(id));
      if (!s || s.kind !== "被动" || !skillState.learned.has(String(s.id))) continue;
      const eff = skillEffect("player", s);
      if (!eff || !eff.self || !eff.self.stats) continue;
      for (const [k, v] of Object.entries(eff.self.stats)) total[k] = (total[k] || 0) + v;
    }
    return total;
  }

  // 被动技能百分比加成（激活的被动，按当前等级）
  function passiveSkillPct() {
    const total = {};
    for (const id of skillState.enabled) {
      const s = SKILL_BY_ID.get(String(id));
      if (!s || s.kind !== "被动" || !skillState.learned.has(String(s.id))) continue;
      const eff = skillEffect("player", s);
      if (!eff || !eff.self || !eff.self.pctStats) continue;
      for (const [k, v] of Object.entries(eff.self.pctStats)) total[k] = (total[k] || 0) + v;
    }
    return total;
  }

  function expBonusPct() {
    return buffSumPct("player", "expBonus")
      + (passiveSkillPct().expBonus || 0)
      + (setBonusStats().pct.expBonus || 0)
      + ((state.player.stats && state.player.stats.expBonus) || 0);
  }

  function clampBattleHp() {
    const maxHp = effMaxHp("player");
    if (state.player.hp > maxHp) state.player.hp = maxHp;
    const maxMp = effMaxMp();
    if (state.player.mp > maxMp) state.player.mp = maxMp;
  }

  // 首领额外掉落（不影响原有的 3 次掉落）：
  // 90% 稀有(q3) / 9% 英雄(q4) / 1% 传说(q5)；该品质没有道具时向下取最近的有道具品质
  function rollBossExtraDrop(m) {
    const r = Math.random();
    const want = r < 0.9 ? 3 : (r < 0.99 ? 4 : 5);
    const quals = [1, 2, 3, 4, 5].filter(q => (m.drops || []).some(id => ITEMS[id] && ITEMS[id].quality === q));
    if (!quals.length) return null;
    let q = want;
    while (q >= 1 && !quals.includes(q)) q--;
    if (q < 1) q = quals[0];
    const pool = m.drops.filter(id => ITEMS[id] && ITEMS[id].quality === q);
    return weightedPick(pool);
  }

  function onMonsterDead(m) {
    // 先写「X 被击败了」，再处理金币/掉落/经验，保证日志顺序是：死亡 → 金币 → 掉落 → 升级
    enterDeath("monster");
    state.kills += 1;
    // 基础金币：每只怪必掉（精英 ×3、首领 ×20）
    const goldMul = m.boss ? 20 : (m.elite ? 3 : 1);
    const gold = goldFor(m.level) * goldMul;
    state.harvestGold += gold;
    state.lootValue += gold;   // 战利品价值 = 道具价值 + 掉落金币
    pushLog("drop", `${esc(logLabel(m))} 掉落了<b class="num gold">${fmt(gold)}</b>金币`);
    // 首领必掉 3 次（升阶率与精英相同），普通/精英掉 1 次
    const rolls = m.boss ? 3 : 1;
    for (let i = 0; i < rolls; i++) {
      const drop = rollDrop(m);
      if (drop) {
        const n = dropCountOf(m, drop);
        gainDrop(drop, n);
        logDrop(logLabel(m), drop, n);
      }
    }
    // 首领额外一次掉落（90% 稀有 / 9% 英雄 / 1% 传说），与上面 3 次互不影响
    if (m.boss) {
      const extra = rollBossExtraDrop(m);
      if (extra) {
        const n = dropCountOf(m, extra);
        gainDrop(extra, n);
        logDrop(logLabel(m), extra, n);
      }
    }
    const lvBefore = state.player.level;
    const ups = addExp(expFor(m.level));
    if (ups > 0) {
      recalcStats();   // 等级成长立即生效（HP / 攻击 / 防御等级 / 主属性）
      showToast(upgradeMessage(lvBefore, state.player.level));
      if (els.areaPicker.classList.contains("open")) buildAreaPicker();
      if (els.statsView && !els.statsView.classList.contains("is-hidden")) renderStats();
    }
    renderPlayer();
    // 金币进了收获区：重绘底部收获栏，否则只有掉落时才刷新，纯金币变化看不到
    renderBag();
    saveState();
    // 击杀段落的结尾分隔线：把下一只怪的日志和这一只区分开
    pushLog("divider", "<span class='log-sep'></span>");
  }

  function tick() {
    // 后台时完全不跑战斗，等回到前台统一补结算（手机 Chrome 会节流 setInterval）
    if (document.hidden) return;
    if (hiddenAt) {
      resumeFromHidden();
      return;
    }

    // 兜底：某些机型不触发 visibilitychange，但定时器被节流；
    // 两次 tick 间隔超过 1 分钟就按真实时间补结算。
    const now = Date.now();
    const gap = now - lastTickAt;
    lastTickAt = now;
    tickConsumables();
    if (gap >= GAP_SETTLE_MS) {
      const gapSec = gap / 1000;
      const settled = settleOffline(now - gap, state.area, false);
      if (gapSec > OFFLINE_CAP && settled > 0) {
        state.sessionStart += (gapSec - OFFLINE_CAP) * 1000;
      }
      if (settled > 0) {
        startBattle();
        renderTimer();
        saveState();
      }
      return;
    }

    if (state.death) return;   // 复活冷却中，双方都不行动
    const m = state.monster;
    if (!m) return;

    // 战斗开始时技能可能已经把怪打死了
    if (state.monsterHp <= 0) { onMonsterDead(m); return; }

    // 回合开始：每N回合 / Buff（内部推进回合数）
    triggerTurnStart();

    // 玩家行动
    if (!isStunned("player")) {
      // 贯通效果等被动：无视目标闪避
      const hitOnMonster = hitChance(state.player.level, m.level, effHit("player"),
        effDodge("monster") - passiveIgnoreDodge());
      if (Math.random() < hitOnMonster) {
        let dmg = baseDamage(effAtk("player"), effDef("monster"));
        let crit = false;
        // 暴击率保留超过 100 / 低于 0 的原始值：>100 必暴，<0 必不暴
        if (Math.random() * 100 < effCrit()) {
          crit = true;
          dmg = Math.max(1, Math.floor(dmg * critDamagePct() / 100));
        }
        // 固定减伤 / 增伤在暴击加成之后结算
        dmg = Math.max(1, dmg - effDr("monster") + effDmgAdd("player"));
        dmg = Math.max(1, Math.floor(dmg * playerDmgOut()));
        state.monsterHp = Math.max(0, state.monsterHp - dmg);
        floatDamage(els.mFloat, dmg, false, crit);
        logDamage("to-monster", "勇者", logLabel(m), dmg, crit);
        // 装备触发效果：普攻命中后按概率触发（即使这一击打死了怪也照常结算）
        triggerEquipAttack("player", dmg);
        triggerEquipDrain("player", dmg);
      } else {
        floatDamage(els.mFloat, 0, true);
        logMiss("to-monster", "勇者", logLabel(m));
      }
      triggerAttack("player");
      if (state.monsterHp > 0) triggerHurt("monster");
    }

    // 怪物行动
    if (!isStunned("monster")) {
      // 首领攻击命中：等级差只奖励不惩罚
      const hitOnPlayer = hitChance(m.boss ? Math.max(m.level, state.player.level) : m.level, state.player.level, effHit("monster"), effDodge("player"));
      if (Math.random() < hitOnPlayer) {
        if (tryImmuneOnHit("player")) {
          floatDamage(els.pFloat, 0, false, false, true);
        } else {
          let dmg = baseDamage(effAtk("monster"), effDef("player"));
          let crit = false;
          if (Math.random() * 100 < MONSTER_BASE_CRIT) {
            crit = true;
            dmg = Math.max(1, Math.floor(dmg * MONSTER_BASE_CRIT_DMG / 100));
          }
          dmg = Math.max(1, dmg - effDr("player") + effDmgAdd("monster"));
          dmg = Math.max(1, Math.floor(dmg * playerDmgIn()));
          state.player.hp = Math.max(0, state.player.hp - dmg);
          floatDamage(els.pFloat, dmg, false, crit);
          logDamage("to-player", logLabel(m), "勇者", dmg, crit);
        }
      } else {
        floatDamage(els.pFloat, 0, true);
        logMiss("to-player", logLabel(m), "勇者");
      }
      triggerAttack("monster");
      if (state.player.hp > 0) triggerHurt("player");
      // 装备「受击时」触发（如席琳的庇护）
      if (state.player.hp > 0) triggerEquipWhen("player", "hurt");
    }

    // 生命/法力低于阈值：受伤后立即检查
    triggerThreshold("player");

    // 先挨打、后回复；本回合回复只在下回合生效
    if (state.player.hp > 0 && state.player.stats.hpRegen > 0) {
      state.player.hp = Math.min(effMaxHp("player"), state.player.hp + state.player.stats.hpRegen);
    }
    if (state.player.hp > 0 && state.player.stats.mpRegen > 0) {
      state.player.mp = Math.min(effMaxMp(), state.player.mp + state.player.stats.mpRegen);
    }

    // 首领每回合回复最大 HP 的 5%：玩家输出不够就打不死（DPS 门槛）
    if (m.boss && state.monsterHp > 0 && state.monsterHp < m.hp) {
      const regenRate = /^(傲慢之塔|信念之塔|世界副本)/.test(m.area || "") ? 0.5 : 0.25;
      const bossRegen = (m.regen != null) ? Number(m.regen) : Math.round(m.level * regenRate);
      state.monsterHp = Math.min(m.hp, state.monsterHp + Math.max(1, bossRegen));
    }

    clampBattleHp();
    renderBars();
    renderPlayer();

    // 回合结束：buff / 状态持续时间 -1
    decaySide("player");
    decaySide("monster");

    if (state.monsterHp <= 0) { onMonsterDead(m); return; }
    if (state.player.hp <= 0) enterDeath("player");
  }

  /* ---------------- 掉落 ---------------- */
  // 硬币：首领掉落时数量 = 首领等级；小怪 / 精英仍为 1
  const COIN_DROP_IDS = new Set(["1305", "2495", "2496", "2497"]);   // 荣誉货币 / 魔法娃娃制作硬币 / 名誉金币 / 变身制作硬币
  const dropCountOf = (monster, itemId) =>
    monster.boss && COIN_DROP_IDS.has(String(itemId)) ? monster.level : 1;

  function rollDrop(monster) {
    // 精英 / 首领没有精英版本，掉落完全走精英逻辑（必掉 + 30% 升阶）
    const special = monster.elite || monster.boss;
    const luck = (state.player.stats && state.player.stats.luk) || 0;
    // 普通怪基础掉率 10%，每点幸运 +1%，上限 100%；精英/稀有必掉不受幸运影响
    const dropChance = special ? 1 : Math.max(0, Math.min(1, 0.1 + 0.01 * luck));
    if (Math.random() >= dropChance) return null;

    const upChance = special ? 0.3 : 0.1;
    // 普通小怪：升红（q3 → q4）、升紫（q4 → q5）两步只有 5%，其余档保持 10%；
    // 精英 / 首领仍然全程 30%
    const upChanceOf = q => (special ? upChance : (q >= 3 ? 0.05 : upChance));
    const quals = [1, 2, 3, 4, 5].filter(q =>
      monster.drops.some(id => ITEMS[id] && ITEMS[id].quality === q)
    );
    if (!quals.length) return null;

    // 从最低品质 q1 开始逐档 roll，即使 q1/q2 没有道具也要掷。
    // current 只在「该品质真的有道具」时更新；如果最终没到达任何有道具的品质，则无掉落。
    let current = 0;
    for (let q = 1; q <= 5; q++) {
      if (quals.includes(q)) current = q;
      if (q === 5) break;
      if (Math.random() >= upChanceOf(q)) break;
    }
    if (!current) return null;

    const pool = monster.drops.filter(id => ITEMS[id] && ITEMS[id].quality === current);
    return weightedPick(pool);
  }

  function weightedPick(ids) {
    const weights = ids.map(id => {
      const mod = ITEMS[id].mod;
      return Number.isFinite(mod) && mod > 0 ? mod : 1;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < ids.length; i++) {
      r -= weights[i];
      if (r <= 0) return ids[i];
    }
    return ids[ids.length - 1];
  }

  function addToHarvest(itemId, count = 1) {
    const key = itemKey(itemId);
    state.harvest.set(key, (state.harvest.get(key) || 0) + count);
    const it = ITEMS[itemId];
    if (it) state.lootValue += (Number(it.value) || 0) * count;
    renderBag();
  }

  // 掉落入账：白/绿装备若勾了自动出售，直接折成金币进收获区，不占格子
  function gainDrop(itemId, count = 1) {
    const it = ITEMS[itemId];
    const autoSold = it && it.type === 3 &&
      ((it.quality === 1 && state.autoSell.white) || (it.quality === 2 && state.autoSell.green));
    if (autoSold) {
      const gold = (Number(it.value) || 0) * count;
      state.harvestGold += gold;
      state.lootValue += gold;
      renderBag();
      return;
    }
    addToHarvest(itemId, count);
  }

  // 收获区里的金币角标：超过一万显示「x万」（不足一万的零头忽略），不足一万直接显示数字
  function goldShort(n) {
    const v = Math.max(0, Math.round(Number(n) || 0));
    if (v >= 10000) return Math.floor(v / 10000) + "万";
    return String(v);
  }

  // 单个实例（key）在背包 + 收获区的数量
  function countKey(key) {
    return (state.bag.get(key) || 0) + (state.harvest.get(key) || 0);
  }

  // 扣 1 件指定实例（背包优先，其次收获区）
  function takeKey(key) {
    const b = state.bag.get(key) || 0;
    if (b > 0) {
      if (b > 1) state.bag.set(key, b - 1);
      else state.bag.delete(key);
      return true;
    }
    const h = state.harvest.get(key) || 0;
    if (h > 0) {
      if (h > 1) state.harvest.set(key, h - 1);
      else state.harvest.delete(key);
      return true;
    }
    return false;
  }

  // 按物品 ID 汇总（含该 ID 的所有实例：白板 + 各强化档）
  function countItem(itemId) {
    const id = String(itemId);
    let n = 0;
    for (const [k, c] of state.bag) if (parseKey(k).id === id) n += c;
    for (const [k, c] of state.harvest) if (parseKey(k).id === id) n += c;
    return n;
  }

  // 按物品 ID 扣 1 件（优先白板，再按强化等级从低到高）
  function takeItem(itemId) {
    const id = String(itemId);
    const pick = map => {
      const keys = [...map.keys()]
        .filter(k => parseKey(k).id === id)
        .sort((a, b) => parseKey(a).enhance - parseKey(b).enhance || parseKey(a).bless - parseKey(b).bless);
      return keys.length ? keys[0] : null;
    };
    const kb = pick(state.bag);
    if (kb) return takeKey(kb);
    const kh = pick(state.harvest);
    if (kh) return takeKey(kh);
    return false;
  }

  /* ---------------- 渲染 ---------------- */
  // 等级差配色（以玩家为基准，看怪物比玩家高/低多少）：
  // 低 10+ 灰、低 5~9 绿、±4 黄、高 5~9 橙、高 10+ 红
  function levelColor(playerLv, targetLv) {
    const d = targetLv - playerLv;
    if (d <= -10) return "#808080";
    if (d <= -5) return "#4ce650";
    if (d <= 4) return "#ffe14d";
    if (d <= 9) return "#ff9a3c";
    return "#ff5a5a";
  }

  function renderArea() {
    const name = state.area || "—";
    const a = areaInfo.find(x => x.name === name);
    if (!a) {
      els.area.textContent = name;
      els.area.style.color = "";
      return;
    }
    // 一张图里的怪可能分好几档（外面 14 级、里面 32 级），显示范围更准确；只算小怪、不算首领
    const lo = a.mobMin != null ? a.mobMin : a.minLevel;
    const hi = a.mobMax != null ? a.mobMax : lo;
    // 只显示地区名（去掉「大类-序号.」前缀），后面跟等级
    const title = a.label || name;
    els.area.textContent = lo === hi ? `${title}（Lv${lo}）` : `${title}（Lv${lo}~${hi}）`;
    const p = state.player.level;
    // 地图名专用配色（以整张图的等级范围为准）：
    // 低最低档 5 级以上红、低 1~4 级橙、范围内黄、比最高档高 1~4 级绿、高 5 级及以上灰
    if (p < lo - 4) els.area.style.color = "#ff5a5a";
    else if (p < lo) els.area.style.color = "#ff9a3c";
    else if (p <= hi) els.area.style.color = "#ffe14d";
    else if (p <= hi + 4) els.area.style.color = "#4ce650";
    else els.area.style.color = "#808080";
  }

  function renderBars() {
    const hpText = `${fmtHpMp(Math.max(0, state.player.hp))} / ${fmtHpMp(state.player.maxHp)}`;
    const pPct = Math.max(0, state.player.hp / state.player.maxHp) * 100;
    els.pFill2.style.width = pPct + "%";
    els.pHpText2.textContent = `HP ${hpText}`;
    if (els.playerHpStat) els.playerHpStat.textContent = hpText;

    const mpText = `${fmtHpMp(Math.max(0, state.player.mp))} / ${fmtHpMp(state.player.maxMp)}`;
    const mpPct = state.player.maxMp > 0 ? Math.max(0, state.player.mp / state.player.maxMp) * 100 : 0;
    if (els.pMpFill) els.pMpFill.style.width = mpPct + "%";
    if (els.pMpStat) els.pMpStat.textContent = mpText;
    if (els.pMpText2) els.pMpText2.textContent = `MP ${mpText}`;

    const mPct = Math.max(0, state.monsterHp / state.monster.hp) * 100;
    els.mFill.style.width = mPct + "%";
    els.mHpText.textContent = `HP ${fmtHpMp(Math.max(0, state.monsterHp))} / ${fmtHpMp(state.monster.hp)}`;
  }

  // 左上角：勇者 Lv15 0.00% + 经验条
  function renderExp() {
    const need = expToNext(state.player.level);
    const raw = need > 0 ? (state.player.exp / need) * 100 : 0;
    const pct = Math.max(0, Math.min(100, raw));
    if (els.playerLv) els.playerLv.textContent = `勇者 Lv${state.player.level}`;
    if (els.expPct) els.expPct.textContent = `${pct.toFixed(2)}%`;
    els.expFill.style.width = pct + "%";
  }

  // 加经验并结算升级，返回升了几级
  function addExp(amount) {
    if (!(amount > 0)) return 0;
    // 经验加成（团结等被动/临时 buff）
    amount = amount * (1 + expBonusPct() / 100);
    state.player.exp += amount;
    let ups = 0;
    while (state.player.level < MAX_LEVEL) {
      const need = expToNext(state.player.level);
      if (state.player.exp < need) break;
      state.player.exp -= need;
      state.player.level++;
      ups++;
    }
    if (state.player.level >= MAX_LEVEL) state.player.exp = 0;
    return ups;
  }

  /* ---------------- 装备界面 ---------------- */
  // 12 个部位；顺序按面板行优先排列。
  // 腰带在正中间（第 3 行中列），武器单独一行居中。
  const EQUIP_SLOTS = [
    { key: "head", name: "头部" },
    { key: "earring", name: "耳环" },
    { key: "body", name: "衣服" },
    { key: "necklace", name: "项链" },
    { key: "offhand", name: "副手" },
    { key: "belt", name: "腰带" },
    { key: "shoulder", name: "披风" },
    { key: "pants", name: "裤子" },
    { key: "ring", name: "戒指" },
    { key: "shoes", name: "鞋子" },
    { key: "gloves", name: "手套" },
    { key: "transform", name: "变身" },
    { key: "doll", name: "娃娃" },
    { key: "weapon", name: "武器" },
  ];

  // 各部位穿戴的道具：slot -> itemId
  const equipment = {};

  /* ---------------- 装备强化 / 祝福 ---------------- */
  // 强化卷轴：武器只能武器卷轴 + 祝福；防具只能防具卷轴 + 祝福
  const ENHANCE_SCROLLS = {
    weapon: ["2511", "2520", "2600"],
    armor: ["2509", "2518", "2600"],
  };
  const BLESS_SCROLL = "2600";                       // 祝福赋予卷轴
  const ARTISAN_SCROLLS = new Set(["2520", "2518"]); // 工匠卷轴：失败装备不消失
  const ENHANCE_MAX = 14;
  let enhanceKey = null;      // 正在强化的实例键
  let enhanceSource = "bag";  // bag | equip（装备栏里的强化失败会消失）
  let enhanceScroll = null;   // 选中的卷轴 id

  // 装备属性只认 GEAR_KEYS 里的 key。按当前规则：def / hit / magicHit / dodge 真正参与战斗，
  // str / int / dex / wis / con / luk 参与换算（暴击 / 命中 / 魔抗 / MP回复 / HP / 幸运）。
  const GEAR_KEYS = ["hp", "atk", "def", "str", "int", "dex", "wis", "con", "luk", "hit", "magicHit", "crit", "critDmg", "dodge", "mr", "dr", "dmgAdd", "dmgAddPct", "drPct", "mp", "mpRegen", "hpRegen", "expBonus"];
  const GEAR_NAME = {
    hp: "HP", atk: "攻击力", def: "防御等级", str: "力量", int: "智力", dex: "敏捷",
    wis: "精神", con: "体质", luk: "幸运", hit: "命中", magicHit: "魔法命中", crit: "暴击", dodge: "闪避等级",
    mr: "魔抗", dr: "伤害减免", dmgAdd: "伤害增加", dmgAddPct: "伤害增加", drPct: "伤害减免",
    mp: "MP", mpRegen: "MP回复", hpRegen: "HP回复",
    expBonus: "经验值获得量",
  };
  // 这两个属性按百分比显示（扩展属性里存的是数字，避免被「%」当成乘算百分比）
  const isPctAttr = k => k === "dmgAddPct" || k === "drPct";

  const slotName = key => (EQUIP_SLOTS.find(s => s.key === key) || {}).name || key;

  // 汇总所有已穿戴装备的属性
  /* ---------------- 套装 ---------------- */
  // 套装效果行 → 结构化属性（AC 记法比较特殊：物理防御力 (AC)-5 = 防御等级 +5）
  const SET_STAT_PATTERNS = [
    [/物理防[御禦]力\s*\(AC\)/i, "def", "防御等级"],
    [/魔法防[御禦]\s*\(MR\)/i, "mr", "魔抗"],
    [/最大\s*HP/i, "hp", "HP"],
    [/近距[离離]伤害|远距[离離]伤害|近距離傷害|遠距離傷害/, "atk", "攻击力"],
    [/无视伤害减[少免]|無視傷害減[少免]/, "dmgAdd", "伤害增加"],
    [/伤害减免|傷害減免/, "dr", "伤害减免"],
    [/魔法命中/, "magicHit", "魔法命中"],
    [/经验值?获得量|經驗值?獲得量/, "expBonus", "经验值获得量"],
    [/力量/, "str", "力量"],
    [/体质|體質/, "con", "体质"],
    [/敏捷/, "dex", "敏捷"],
    [/精神/, "wis", "精神"],
    [/智力/, "int", "智力"],
  ];

  function parseSetBonusLine(line) {
    const text = String(line || "").trim();
    if (!text) return null;
    const m = text.match(/^(.*?)\s*([+\-])\s*(\d+(?:\.\d+)?)\s*(%?)$/);
    if (!m) return null;
    const name = m[1].trim();
    const sign = m[2];
    const num = parseFloat(m[3]);
    const pct = !!m[4] || /获得量|獲得量/.test(name);
    let key = null;
    let label = name;
    for (const [re, k, labelName] of SET_STAT_PATTERNS) {
      if (re.test(name)) { key = k; label = labelName; break; }
    }
    // AC 是「物理防御力 (AC)-5」= 防御等级 +5，取绝对值
    const value = key === "def" ? Math.abs(num) : (sign === "-" ? -num : num);
    return { key, name: label, value, pct };
  }

  // 已装备的同套装分组（members 相同的算同一套）
  function equippedSetGroups() {
    const groups = new Map();
    for (const slot of EQUIP_SLOTS) {
      const key = equipment[slot.key];
      if (!key) continue;
      const it = keyItem(key);
      if (!it || !it.set || !Array.isArray(it.set.members) || !it.set.members.length) continue;
      const sig = it.set.members.join("|");
      const g = groups.get(sig) || { sample: it, count: 0 };
      g.count++;
      groups.set(sig, g);
    }
    return groups;
  }

  // 套装生效属性：件数达到的档位都生效，独立相加
  function setBonusStats() {
    const total = {};
    const pct = {};
    for (const [, g] of equippedSetGroups()) {
      for (const b of g.sample.set.bonuses || []) {
        if (Number(b.count) > g.count) continue;
        for (const line of b.lines || []) {
          const a = parseSetBonusLine(line);
          if (!a || !a.key) continue;
          if (a.pct) pct[a.key] = (pct[a.key] || 0) + a.value;
          else total[a.key] = (total[a.key] || 0) + a.value;
        }
      }
    }
    return { total, pct };
  }

  function gearTotals() {
    const total = {
      hp: 0, atk: 0, def: 0, str: 0, int: 0, dex: 0, wis: 0, luk: 0,
      hit: 0, magicHit: 0, crit: 0, dodge: 0, mr: 0, dr: 0, dmgAdd: 0,
      dmgAddPct: 0, drPct: 0,
      mp: 0, mpRegen: 0, hpRegen: 0,
      con: 0,
    };
    // 百分比属性（如「敏捷+5%」）：乘算，单独汇总
    const pct = {};
    for (const slot of EQUIP_SLOTS) {
      const key = equipment[slot.key];
      if (!key) continue;
      const { id, enhance, bless } = parseKey(key);
      const item = ITEMS[id];
      if (!item || !Array.isArray(item.attrs)) continue;
      const add = (k, v, isPct) => {
        if (!GEAR_KEYS.includes(k)) return;
        if (isPct) pct[k] = (pct[k] || 0) + toInt(v, 0);
        else total[k] += toInt(v, 0);
      };
      for (const attr of item.attrs) {
        if (attr) add(attr.key, attr.value, attr.pct);
      }
      // 强化：最终 = 基础属性 + 该等级的强化属性（每级是绝对值，不累加）
      const lv = enchantLevelOf(id, enhance);
      if (lv && lv.attrs) {
        for (const [k, v] of Object.entries(lv.attrs)) add(k, v, false);
      }
      // 祝福属性（祝福过的装备才生效）
      if (bless && Array.isArray(item.blessAttrs)) {
        for (const a of item.blessAttrs) {
          if (a && a.key) add(a.key, a.value, a.pct);
        }
      }
    }
    return { total, pct };
  }

  // 把装备加成汇总回玩家：HP / 攻击力 / 防御直接累加，命中/闪避供 hitChance 使用。
  /* ---------------- 等级成长 ----------------
     15 级起每升 1 级：+20 HP / +1 攻击 / +1 防御等级 / +1 主属性。
     主属性按「力 → 敏 → 智 → 精 → 体」循环，每 5 级正好各 +1 一轮
     （Lv16 力量、Lv17 敏捷、Lv18 智力、Lv19 精神、Lv20 体质、Lv21 力量…）。 */
  const LEVEL_GROWTH = {
    hp: 20, atk: 1, def: 1,
    attrs: [["str", "力量"], ["dex", "敏捷"], ["int", "智力"], ["wis", "精神"], ["con", "体质"]],
  };
  function levelGrowth(level) {
    const n = Math.max(0, toInt(level, START_LEVEL) - START_LEVEL);
    const full = Math.floor(n / 5);
    const attrs = { str: full, dex: full, int: full, wis: full, con: full };
    for (let i = 0; i < n % 5; i++) attrs[LEVEL_GROWTH.attrs[i][0]] += 1;
    return { hp: n * LEVEL_GROWTH.hp, atk: n * LEVEL_GROWTH.atk, def: n * LEVEL_GROWTH.def, attrs };
  }
  function growthGain(from, to) {
    const a = levelGrowth(from);
    const b = levelGrowth(to);
    const attrs = {};
    for (const [k] of LEVEL_GROWTH.attrs) attrs[k] = b.attrs[k] - a.attrs[k];
    return { hp: b.hp - a.hp, atk: b.atk - a.atk, def: b.def - a.def, attrs };
  }
  // 升级提示文案：告知这一级（或连升多级）具体增加了哪些属性
  function upgradeMessage(from, to) {
    const g = growthGain(from, to);
    const parts = [`HP+${g.hp}`, `攻击+${g.atk}`, `防御等级+${g.def}`];
    const attrs = LEVEL_GROWTH.attrs
      .filter(([k]) => g.attrs[k] > 0)
      .map(([k, name]) => `${name}+${g.attrs[k]}`);
    const lvText = to > from + 1
      ? `连升 ${to - from} 级，Lv${from} → Lv${to}`
      : `升到 Lv${to}`;
    return `升级！${lvText}：${parts.concat(attrs).join("、")}`;
  }

  function recalcStats() {
    const p = state.player;
    const gear = gearTotals();
    // 激活的被动技能也直接加到面板属性
    const ps = passiveSkillStats();
    const merged = { ...gear.total };
    // 装备的百分比属性作用在装备汇总值上（如「敏捷+5%」）
    for (const [k, v] of Object.entries(gear.pct)) {
      merged[k] = (merged[k] || 0) * (1 + v / 100);
    }
    // 等级成长的主属性：并入汇总，力量→暴击 / 敏捷→命中闪避 / 精神→魔抗 / 体质→HP 一并生效
    const growth = levelGrowth(p.level);
    for (const [k, v] of Object.entries(growth.attrs)) merged[k] = (merged[k] || 0) + v;
    // 万能药等永久属性：与装备加成同口径，参与力量→暴击、体质→HP 等换算
    for (const [k, v] of Object.entries(p.permanent || {})) merged[k] = (merged[k] || 0) + v;
    // 消耗品 buff：固定值并入汇总，百分比并入下方 pp（与被动同口径）
    const cons = consumableBonus();
    for (const [k, v] of Object.entries(cons.total)) merged[k] = (merged[k] || 0) + v;
    // 套装效果：件数达标的档位一起相加
    const setBonus = setBonusStats();
    for (const [k, v] of Object.entries(setBonus.total)) merged[k] = (merged[k] || 0) + v;
    for (const [k, v] of Object.entries(ps)) merged[k] = (merged[k] || 0) + v;

    // 体质：1 点 = +50 HP + 1 HP回复。并入装备 HP / HP回复的口径，一起参与百分比加成。
    const con = merged.con || 0;
    if (con) {
      merged.hp = (merged.hp || 0) + 50 * con;
      merged.hpRegen = (merged.hpRegen || 0) + con;
    }

    p.stats = {
      hp: merged.hp, atk: merged.atk,
      str: merged.str, int: merged.int, dex: merged.dex, wis: merged.wis, con, luk: merged.luk,
      // 敏捷：1 点 = +1% 命中 +1 闪避等级；精神：1 点 = +10 魔抗 +1 MP回复
      hit: merged.hit + merged.dex, magicHit: merged.magicHit,
      crit: merged.crit, dodge: merged.dodge + merged.dex,
      mr: merged.mr + 10 * merged.wis, dr: merged.dr, dmgAdd: merged.dmgAdd,
      dmgAddPct: merged.dmgAddPct || 0, drPct: merged.drPct || 0, mp: merged.mp,
      mpRegen: merged.mpRegen + merged.wis, hpRegen: merged.hpRegen,
      // 暴击伤害加成（%）：装备/消耗品固定值 + 百分比 buff
      critDmg: (merged.critDmg || 0),
      // 经验值获得量（%）：装备百分比（经验值获得量增加）
      expBonus: (merged.expBonus || 0),
    };
    const oldMax = p.maxHp;
    const pp = passiveSkillPct();
    // 消耗品的百分比（攻击力+10% / HP+10% 等）与被动百分比同口径
    for (const [k, v] of Object.entries(cons.pct)) pp[k] = (pp[k] || 0) + v;
    // 套装的百分比（经验值获得量增加 等）同理
    for (const [k, v] of Object.entries(setBonus.pct)) pp[k] = (pp[k] || 0) + v;
    const mul = k => 1 + (pp[k] || 0) / 100;
    // 百分比属性里，暴击/命中/闪避/魔抗/减伤直接加点，攻防血蓝乘算
    p.stats.crit += pp.crit || 0;
    p.stats.critDmg = (merged.critDmg || 0) + (pp.critDmg || 0);
    p.stats.hit += pp.hit || 0;
    p.stats.dodge += pp.dodge || 0;
    p.stats.mr += pp.mr || 0;
    p.stats.dr += pp.dr || 0;
    p.maxHp = Math.max(100, Math.round((toInt(p.base.maxHp, BASE_MAX_HP) + growth.hp + merged.hp) * mul("hp")));
    p.atk = Math.max(0, Math.round((toInt(p.base.atk, BASE_ATK) + growth.atk + merged.atk) * mul("atk")));
    p.def = Math.max(0, Math.round((toInt(p.base.def, 0) + growth.def + merged.def) * mul("def")));
    // 换装备导致最大生命变化：满血时继续满血，受伤时把增量补到当前血量
    const delta = p.maxHp - oldMax;
    if (p.hp > 0 && delta > 0) p.hp = Math.min(p.maxHp, p.hp + delta);
    else p.hp = Math.min(p.hp, p.maxHp);

    // 最大 MP = 基础 100 + 智力×10 + 装备 MP；换装时保持当前比例/补差值
    const oldMaxMp = p.maxMp || 100;
    p.maxMp = Math.max(0, Math.round((BASE_MP + 10 * (merged.int || 0) + (merged.mp || 0)) * mul("mp")));
    if (!Number.isFinite(p.mp)) p.mp = p.maxMp;
    else if (p.mp >= oldMaxMp) p.mp = p.maxMp;
    else {
      const mpDelta = p.maxMp - oldMaxMp;
      p.mp = Math.max(0, Math.min(p.maxMp, p.mp + mpDelta));
    }
  }

  // 提示里的道具名：套品质色
  function qName(text, quality) {
    return `<span class="q${quality}">${esc(text)}</span>`;
  }

  function afterEquipChange(msg) {
    recalcStats();
    renderBag();
    renderPlayer();
    renderEquipView();
    if (!els.statsView.classList.contains("is-hidden")) renderStats();
    hideItemDetail();
    saveState();
    if (msg) showToast(msg);
  }

  function equipItem(key) {
    const { id, enhance } = parseKey(key);
    const item = ITEMS[id];
    if (!item || item.type !== 3) {
      showToast("这件道具不是装备");
      return;
    }
    const slot = EQUIP_SLOTS.find(s => s.key === item.slot);
    if (!slot) {
      showToast("这件装备还没有配置部位");
      return;
    }
    if (equipment[slot.key] === key) {
      showToast(`已经装备了「${qName(item.name, item.quality)}」`);
      return;
    }
    // 收获区的装备可以直接穿：同一实例优先扣背包，再扣收获区
    if (countKey(key) <= 0) {
      showToast("背包里没有这件装备");
      return;
    }

    // 双手武器与副手互斥：武器是双手时不能装副手
    if (slot.key === "offhand") {
      const wItem = equipment["weapon"] ? keyItem(equipment["weapon"]) : null;
      if (wItem && wItem.twoHanded) {
        showToast("当前武器是双手武器，占用了副手");
        return;
      }
    }

    // 先从背包/收获区扣 1 件，换下来的旧装备再回背包
    takeKey(key);

    const oldKey = equipment[slot.key];
    if (oldKey) state.bag.set(oldKey, (state.bag.get(oldKey) || 0) + 1);
    equipment[slot.key] = key;

    // 装上双手武器：自动脱下副手
    let dropOff = null;
    if (item.twoHanded && slot.key === "weapon" && equipment["offhand"]) {
      dropOff = equipment["offhand"];
      state.bag.set(dropOff, (state.bag.get(dropOff) || 0) + 1);
      delete equipment["offhand"];
    }

    const suffix = enhance > 0 ? ` +${enhance}` : "";
    const msg = [];
    msg.push(oldKey
      ? `已装备「${qName(item.name, item.quality)}${suffix}」，换下「${qName(keyItem(oldKey).name, keyItem(oldKey).quality)}${keySuffix(oldKey)}」`
      : `已装备「${qName(item.name, item.quality)}${suffix}」`);
    if (dropOff) msg.push(`双手武器占用了副手，「${keyItem(dropOff).name}${keySuffix(dropOff)}」已卸下`);
    lastEquippedId = key;   // 背包面板里排到「已装备」组第一位
    afterEquipChange(msg.join("；"));
  }

  function unequipSlot(slotKey) {
    const key = equipment[slotKey];
    if (!key) return;
    const item = keyItem(key);
    delete equipment[slotKey];
    state.bag.set(key, (state.bag.get(key) || 0) + 1);
    afterEquipChange(`已卸下「${item ? qName(item.name, item.quality) : key}${keySuffix(key)}」`);
  }

  function renderEquipView() {
    els.equipGrid.innerHTML = "";
    // 双手武器占用副手：副手格置灰不可点
    const weaponItem = equipment["weapon"] ? keyItem(equipment["weapon"]) : null;
    const offhandLocked = !!(weaponItem && weaponItem.twoHanded);
    for (const slot of EQUIP_SLOTS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "equip-slot";
      btn.dataset.slot = slot.key;

      const key = equipment[slot.key];
      const item = key ? keyItem(key) : null;
      const suffix = key ? keySuffix(key) : "";
      const locked = slot.key === "offhand" && offhandLocked && !item;
      if (key && parseKey(key).bless) { btn.classList.add("blessed"); btn.style.setProperty("--sweep-phase", `-${Date.now() % 4900}ms`); }
      if (item) {
        // 已穿戴：显示装备图标，边框按品质上色（与掉落预览一致）
        btn.classList.add("filled", "q" + item.quality);
        btn.title = itemLabel(key);
        btn.innerHTML = `<img src="${iconSrc(item)}" alt="${esc(item.name)}">` +
          (suffix ? `<span class="enh">${enhLabelHtml(key)}</span>` : "");
      } else if (locked) {
        // 双手武器占用副手：显示主手武器的半透明图标，代表双手都拿着它
        btn.classList.add("locked");
        if (weaponItem) {
          btn.innerHTML = `<img src="${iconSrc(weaponItem)}" alt="${esc(weaponItem.name)}">`;
          btn.title = `双手武器「${weaponItem.name}」占用副手`;
        } else {
          btn.textContent = slot.name;
        }
        btn.disabled = true;
      } else {
        // 空位：显示部位名
        btn.textContent = slot.name;
      }

      btn.addEventListener("click", () => {
        if (item) showItemDetail(key, true, true, "equip");   // 从装备格点开：可操作（卸下 / 强化）
        else if (locked) showToast("双手武器占用了副手，先换成单手武器");
        else showToast(`「${slot.name}」还没有装备道具`);
      });
      els.equipGrid.appendChild(btn);
    }

    // 装备页底部汇总：只展示真正生效的三项，0 不占位
    if (els.equipSummary) {
      const gear = gearTotals().total;
      const parts = [];
      if (gear.hp) parts.push(`HP <b>+${fmtHpMp(gear.hp)}</b>`);
      if (gear.atk) parts.push(`攻击 <b>+${fmt(gear.atk)}</b>`);
      if (gear.def) parts.push(`防御等级 <b>+${fmt(gear.def)}</b>`);
      if (gear.hit) parts.push(`命中 <b>+${fmt(gear.hit)}</b>`);
      if (gear.dodge) parts.push(`闪避等级 <b>+${fmt(gear.dodge)}</b>`);
      if (parts.length) els.equipSummary.innerHTML = parts.join("　");
      else if (EQUIP_SLOTS.some(s => equipment[s.key])) {
        els.equipSummary.textContent = "已装备道具，但属性加成为 0";
      } else {
        els.equipSummary.textContent = "未装备任何道具";
      }
    }
  }

  function showView(name) {
    els.playerView.classList.toggle("is-hidden", name !== "player");
    els.equipView.classList.toggle("is-hidden", name !== "equip");
    els.statsView.classList.toggle("is-hidden", name !== "stats");
  }

  function showEquipPanel() {
    renderEquipView();
    showView("equip");
  }

  function showStatsPanel() {
    statPageIdx = 0;   // 每次打开都从第一页开始
    renderStats();
    showView("stats");
  }

  function showPlayerPanel() {
    showView("player");
  }

  /* ---------------- 属性详情 ----------------
     第一页保持不变（HP / 攻击 / 防御 + 五项主属性）；
     第二页放「已定义、但勇者信息版不显示」的战斗属性。 */
  const STAT_DEFS = [
    { key: "hp", icon: "❤️", name: "HP", tip: "你的最大生命值，如果归零你就会死亡，并在 3 秒后复活重新寻找怪物" },
    { key: "atk", icon: "⚔️", name: "攻击力", tip: "提高你对怪物造成的伤害" },
    { key: "def", icon: "🛡️", name: "防御等级", tip: "降低怪物对你造成的伤害" },
    { key: "str", icon: "💪", name: "力量", tip: "提高你的暴击率和暴击伤害" },
    { key: "int", icon: "🧠", name: "智力", tip: "提高你的技能伤害和MP上限" },
    { key: "dex", icon: "🥾", name: "敏捷", tip: "提高你击中怪物和降低怪物击中你的概率" },
    { key: "wis", icon: "✝️", name: "精神", tip: "提高你的魔抗和MP回复" },
    { key: "con", icon: "👕", name: "体质", tip: "提高你的HP上限和HP回复" },
    { key: "luk", icon: "🍀", name: "幸运", tip: "提高你稀有物品的掉落率和遇到好事的概率" },
  ];

  /* 第二页的四个图标用内联 SVG：emoji 没有「红色斗篷 / 红药水 / 蓝药水」的字符，
     靠 hue-rotate 调色在不同系统字体下结果不可控，直接用纯色小图。
     其余属性继续用 emoji，14px 下两者观感接近。 */
  function potionIcon(liquid) {
    return '<svg viewBox="0 0 16 16" aria-hidden="true">' +
      '<rect x="6.3" y="1" width="3.4" height="2.7" rx=".8" fill="#9aa3b2"/>' +
      '<path d="M6.3 3.7h3.4v1.5c0 .9 2.5 2.5 2.5 4.9v3c0 1.2-1 2.2-2.2 2.2H6c-1.2 0-2.2-1-2.2-2.2v-3c0-2.4 2.5-4 2.5-4.9V3.7z" fill="#1b1f27" stroke="#7d8494" stroke-width="1"/>' +
      `<path d="M4.2 10.9h7.6v2.1c0 .7-.5 1.2-1.2 1.2H5.4c-.7 0-1.2-.5-1.2-1.2z" fill="${liquid}"/>` +
      '</svg>';
  }

  const STAT_ICONS = {
    // 一片叶子（闪避）
    leaf: '<svg viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M2.7 13.3C1.9 8.4 5.2 2.7 13.7 2.3c.4 8.5-5.6 11.6-11 11z" fill="#5aa84c"/>' +
      '<path d="M4.2 11.9C6.5 9.3 9.1 6.8 12.5 4.7" stroke="#356b2c" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
      '</svg>',
    // 红色斗篷（魔抗）：兜帽 + 垂坠披风，下摆起伏
    cloak: '<svg viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M11 3.9C12.2 4.6 12.9 6.4 13.3 8.6 13.6 10.6 13.8 12.4 14.1 13.9 12 12.9 10 13.9 8 13.9 6 13.9 4 12.9 1.9 13.9 2.2 12.4 2.4 10.6 2.7 8.6 3.1 6.4 3.8 4.6 5 3.9 5.8 4.9 6.8 5.4 8 5.4 9.2 5.4 10.2 4.9 11 3.9z" fill="#bb3a2f"/>' +
      '<path d="M8 1.1C9.7 1.1 10.9 2.2 11 3.9 10.2 4.9 9.2 5.4 8 5.4 6.8 5.4 5.8 4.9 5 3.9 5.1 2.2 6.3 1.1 8 1.1z" fill="#8c2a21"/>' +
      '</svg>',
    potionRed: potionIcon("#d8453a"),
    potionBlue: potionIcon("#3d7ed6"),
  };

  const STAT_DEFS_2 = [
    { key: "hit", icon: "🎯", name: "命中", tip: "增加你击中怪物的概率" },
    { key: "dodge", svg: "leaf", name: "闪避等级", tip: "增加你闪避怪物攻击的概率" },
    { key: "mr", svg: "cloak", name: "魔抗", tip: "增加你抵抗怪物技能的概率" },
    { key: "magicHit", icon: "✨", name: "魔法命中", tip: "增加技能命中的概率" },
    { key: "hpRegen", svg: "potionRed", name: "HP回复", tip: "每回合开始时回复HP" },
    { key: "mpRegen", svg: "potionBlue", name: "MP回复", tip: "每回合开始时回复MP" },
    // 暴击和暴击伤害合并成一条显示：暴击/暴击伤害 5%/150%
    { key: "critRate", icon: "💥", name: "暴击/暴击伤害", tip: "普通攻击暴击时造成更多伤害", combo: "critDmg" },
    { key: "dr", icon: "➖", name: "伤害减免", tip: "固定减少你受到的伤害" },
    { key: "dmgAdd", icon: "➕", name: "伤害增加", tip: "固定增加你造成的伤害" },
    { key: "drPct", icon: "🛡", name: "伤害减免率", tip: "百分比减少你受到的伤害" },
    { key: "dmgAddPct", icon: "⚔", name: "伤害增加率", tip: "百分比增加你造成的伤害" },
  ];

  // 属性详情分页：0 = 第一页（原有 8 项），1 = 第二页（命中 / 闪避 / 魔抗 / 回复 / 暴击）
  const STAT_PAGES = [STAT_DEFS, STAT_DEFS_2];
  let statPageIdx = 0;

  function statValue(key, def) {
    const p = state.player;
    if (key === "hp") return fmtHpMp(p.maxHp);   // HP 取最大生命值，不是当前血量
    if (key === "atk") return fmt(p.atk);
    if (key === "def") return fmt(p.def);
    // 暴击 / 暴击伤害在战斗里是 150% 基准的百分比，这里按百分比显示
    if (key === "critRate") {
      const crit = fmt(critRate()) + "%";
      if (def && def.combo === "critDmg") return `${crit}/${fmt(critDamagePct())}%`;
      return crit;
    }
    if (key === "critDmg") return fmt(critDamagePct()) + "%";
    if (key === "dmgAddPct" || key === "drPct") return fmt((p.stats && p.stats[key]) || 0) + "%";
    // HP回复 / MP回复也属于 HP / MP 数值，不加千分位
    if (key === "hpRegen" || key === "mpRegen") return fmtHpMp((p.stats && p.stats[key]) || 0);
    return fmt((p.stats && p.stats[key]) || 0);
  }

  function renderStats() {
    const page = STAT_PAGES[statPageIdx] || STAT_DEFS;
    els.statsList.innerHTML = "";
    for (const def of page) {
      const row = document.createElement("div");
      row.className = "stat-item";

      const key = document.createElement("span");
      key.className = "stat-key";
      key.dataset.stat = def.key;

      const ico = document.createElement("span");
      ico.className = "stat-ico";
      if (def.svg && STAT_ICONS[def.svg]) {
        ico.classList.add("stat-svg");
        ico.innerHTML = STAT_ICONS[def.svg];
      } else {
        ico.textContent = def.icon;
      }

      const label = document.createElement("span");
      label.textContent = def.name;

      key.appendChild(ico);
      key.appendChild(label);
      key.addEventListener("click", ev => {
        ev.stopPropagation();
        showStatTip(key, def.tip);
      });

      const val = document.createElement("b");
      val.className = "stat-val";
      val.textContent = statValue(def.key, def);

      row.appendChild(key);
      row.appendChild(val);
      els.statsList.appendChild(row);
    }

    // 页码与左右箭头：只有 2 页，到端点就把箭头置灰
    if (els.statsPage) els.statsPage.textContent = `${statPageIdx + 1}/${STAT_PAGES.length}`;
    if (els.statsPrev) els.statsPrev.disabled = statPageIdx <= 0;
    if (els.statsNext) els.statsNext.disabled = statPageIdx >= STAT_PAGES.length - 1;
  }

  // 翻页；越界直接忽略（箭头此时也是 disabled 状态）
  function turnStatsPage(delta) {
    const next = statPageIdx + delta;
    if (next < 0 || next >= STAT_PAGES.length) return;
    statPageIdx = next;
    renderStats();
  }

  function showStatTip(anchor, text) {
    const tip = els.statTip;
    tip.textContent = text;
    tip.classList.add("show");

    const r = anchor.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const docEl = document.documentElement;
    const vw = window.innerWidth || (docEl && docEl.clientWidth) || 0;
    const vh = window.innerHeight || (docEl && docEl.clientHeight) || 0;

    let left = r.left;
    if (vw) left = Math.max(8, Math.min(left, vw - w - 8));
    let top = r.bottom + 8;
    if (vh && top + h > vh - 8) top = Math.max(8, r.top - h - 8);

    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";

    clearTimeout(tip._t);
    tip._t = setTimeout(() => tip.classList.remove("show"), 2800);
  }

  function renderPlayer() {
    els.pAtk.textContent = fmt(state.player.atk);
    els.pDef.textContent = fmt(state.player.def);
    els.gold.textContent = fmt(state.player.gold);
    renderExp();
    renderBars();
    // 等级变化会影响地图名的等级差颜色
    renderArea();
  }

  function renderMonster() {
    const m = state.monster;
    if (!m) return;
    const pfx = m.elite ? "精英" : m.boss ? "首领" : "";
    els.mName.innerHTML = pfx
      ? `<span class="m-prefix ${m.elite ? "elite" : "boss"}">[${pfx}] </span>${esc(m.name)}`
      : esc(m.name);
    // 普通怪按等级差上色；精英/首领用各自的专属颜色（优先），头像下的名字同步
    const nameColor = m.boss ? "#ffd97a" : m.elite ? "#e3ebf7" : levelColor(state.player.level, m.level);
    els.mName.style.color = nameColor;
    if (els.mAvatarName) els.mAvatarName.style.color = nameColor;
    els.mAvatar.classList.toggle("elite", !!m.elite);
    els.mAvatar.classList.toggle("boss", !!m.boss);
    els.mAvatarName.innerHTML = pfx
      ? `<span class="m-prefix ${m.elite ? "elite" : "boss"}">[${pfx}]</span>\n${esc(m.name)}`
      : esc(m.name);
    els.statLevel.textContent = m.level;
    els.statAtk.textContent = fmt(m.atk);
    els.statDef.textContent = fmt(m.def);
    els.statHp.textContent = fmtHpMp(m.hp);
    renderDropPreview();
    renderBars();
  }

  function renderDropPreview() {
    const m = state.monster;
    els.dropPreview.innerHTML = "";
    if (!m) return;
    const unique = [...new Set(m.drops)].filter(id => ITEMS[id]);
    unique.sort((a, b) => ITEMS[b].quality - ITEMS[a].quality || Number(a) - Number(b));
    for (const id of unique) {
      const it = ITEMS[id];
      const cell = document.createElement("div");
      cell.className = "drop-item q" + it.quality;
      cell.innerHTML = `<img src="${iconSrc(it)}" alt="">`;
      bindItemClick(cell, itemKey(it.id), false);   // 掉落预览：只能看，不能操作
      els.dropPreview.appendChild(cell);
    }
  }

  function renderBag() {
    els.bag.innerHTML = "";

    // 收获区按品质高→低、同品质按单个价值排序；条目是实例键（id#强化#祝福）
    const entries = [...state.harvest.entries()]
      .filter(([key]) => keyItem(key))
      .sort((a, b) => {
        const ia = keyItem(a[0]);
        const ib = keyItem(b[0]);
        if (ib.quality !== ia.quality) return ib.quality - ia.quality;
        if ((ib.value || 0) !== (ia.value || 0)) return (ib.value || 0) - (ia.value || 0);
        return parseKey(a[0]).enhance - parseKey(b[0]).enhance;
      });

    // 挂机期间的金币也放在收获区里，和道具一样是「图标 + 数字」；超过一万显示 x万
    if (state.harvestGold > 0) {
      const cell = document.createElement("div");
      cell.className = "bag-item bag-gold-item";
      cell.innerHTML = `<img src="icons/coin.png" alt="">` +
        `<span class="bag-count">${goldShort(state.harvestGold)}</span>`;
      // 点一下用气泡显示精确数字（角标超万会省略零头，避免玩家误会）
      cell.addEventListener("click", ev => {
        ev.stopPropagation();
        showStatTip(cell, `${Math.round(state.harvestGold)}金币`);
      });
      els.bag.appendChild(cell);
    }

    for (const [key, count] of entries) {
      const it = keyItem(key);
      const suffix = keySuffix(key);
      const cell = document.createElement("div");
      cell.className = "bag-item q" + it.quality + (parseKey(key).bless ? " blessed" : "");
      if (parseKey(key).bless) cell.style.setProperty("--sweep-phase", `-${Date.now() % 4900}ms`);
      cell.innerHTML = `<img src="${iconSrc(it)}" alt="">` +
        (suffix ? `<span class="enh">${enhLabelHtml(key)}</span>` : "") +
        (count > 1 ? `<span class="bag-count">${count}</span>` : "");
      bindItemClick(cell, key, true, "harvest");   // 记住来源：出售时先扣收获区
      els.bag.appendChild(cell);
    }

    if (!entries.length && state.harvestGold <= 0) {
      const empty = document.createElement("div");
      empty.className = "bag-empty";
      empty.textContent = "还没有收获";
      els.bag.appendChild(empty);
    }

    let total = 0;
    for (const [key, count] of state.harvest) {
      const it = keyItem(key);
      if (it) total += (it.value || 0) * count;
    }
    // 收获区的金币也算进「总价值」（右侧预览）
    els.bagValue.textContent = fmt(total + state.harvestGold);
    els.sellBtn.disabled = state.harvest.size === 0 && state.harvestGold <= 0;

    // 背包面板开着时同步内容与金币（挂机中会持续掉落）
    if (els.bagPanel && !els.bagPanel.classList.contains("is-hidden")) {
      renderBagPanel();
    }
    // 制作面板开着时，材料数量随掉落实时刷新（只刷详情，列表不重建）
    if (els.craftPanel && !els.craftPanel.classList.contains("is-hidden")
      && els.craftContent && !els.craftContent.classList.contains("is-hidden") && craftRecipe) {
      renderCraftDetail();
    }
  }

  function floatDamage(layer, value, miss, crit = false, skill = false) {
    const el = document.createElement("div");
    el.className = "dmg" + (miss ? " miss" : value <= 0 ? " zero" : "")
      + (crit ? " crit" : "") + (skill ? " skill" : "");
    const txt = miss ? "闪避" : value > 0 ? "-" + fmt(value) : "0";
    // 暴击飘字加感叹号；日志不加，保持原格式
    el.textContent = txt + (crit && !miss ? "！" : "");
    el.style.left = 40 + Math.random() * 20 + "%";
    layer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  // 非自然回复（技能/道具等）用绿色 +N 飘字；HP/MP 每秒自然回复不走这里
  function floatHeal(layer, value) {
    const n = Math.max(0, toInt(value, 0));
    if (!n) return;
    const el = document.createElement("div");
    el.className = "dmg heal";
    el.textContent = "+" + fmtHpMp(n);
    el.style.left = 40 + Math.random() * 20 + "%";
    layer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /* ---------------- 技能 ---------------- */
  const SKILLS = (DATA.skills || []).slice();
  const SKILL_BY_ID = new Map(SKILLS.map(s => [String(s.id), s]));
  // 技能书道具 ID -> 技能（重名书会有多本指向同一个技能）
  const SKILL_BY_BOOK = new Map();
  for (const s of SKILLS) {
    for (const b of (s.books || (s.book ? [s.book] : []))) SKILL_BY_BOOK.set(String(b), s);
  }
  const SKILL_MAX_LEVEL = 5;
  // 升级消耗：目标等级 → { books: 技能书数量, gold: 金币 }
  const SKILL_UPGRADE_COSTS = {
    2: { books: 2, gold: 1000000 },
    3: { books: 3, gold: 2000000 },
    4: { books: 4, gold: 5000000 },
    5: { books: 5, gold: 10000000 },
  };
  const SKILL_CARRY_LIMIT = 5;   // 被动 / 主动各最多携带 5 个

  const isPassiveSkill = s => s && s.kind === "被动";

  function carryCount(passive) {
    let n = 0;
    for (const id of skillState.enabled) {
      const s = SKILL_BY_ID.get(String(id));
      if (s && isPassiveSkill(s) === passive) n++;
    }
    return n;
  }

  // 玩家初始不会任何技能，需要使用技能书学习
  const skillState = {
    learned: new Set(),
    enabled: new Set(),
    levels: {},
  };

  let skillTab = "mine";
  let currentSkillId = null;

  const skillLevel = id => {
    const lv = toInt(skillState.levels[id] || 1, 1);
    return Math.max(1, Math.min(SKILL_MAX_LEVEL, lv));
  };

  function skillListForTab(tab) {
    if (tab === "mine") {
      return SKILLS.filter(s => skillState.learned.has(String(s.id)) && skillState.enabled.has(String(s.id)));
    }
    // 图鉴只展示有技能书可获得的技能：无书技能（任务/商人获得）玩家学不到，不展示
    const obtainable = SKILLS.filter(s => (s.books && s.books.length) || s.book);
    if (tab === "common") return obtainable.filter(s => s.quality <= 2);
    if (tab === "hero") return obtainable.filter(s => s.quality === 4);
    if (tab === "myth") return obtainable.filter(s => s.quality === 6);
    return obtainable.filter(s => s.quality === 5);
  }

  // 标题行：已激活的主动 / 被动技能数量，形如「主动（1/5）已激活」
  function renderSkillHead() {
    const active = carryCount(false);
    const passive = carryCount(true);
    if (els.skillActiveCount) {
      els.skillActiveCount.textContent = `主动（${active}/${SKILL_CARRY_LIMIT}）已激活`;
      els.skillActiveCount.classList.toggle("is-empty", active === 0);
    }
    if (els.skillPassiveCount) {
      els.skillPassiveCount.textContent = `被动（${passive}/${SKILL_CARRY_LIMIT}）已激活`;
      els.skillPassiveCount.classList.toggle("is-empty", passive === 0);
    }
  }

  function renderSkillPanel() {
    renderSkillHead();
    if (!els.skillGrid) return;
    els.skillGrid.innerHTML = "";
    // 已学会的技能排在最前面；同状态内按品质从低到高、再按名称
    const learnedRank = s => (skillState.learned.has(String(s.id)) ? 0 : 1);
    const list = skillListForTab(skillTab).slice().sort((a, b) => {
      const ra = learnedRank(a);
      const rb = learnedRank(b);
      if (ra !== rb) return ra - rb;
      return (a.quality - b.quality) || String(a.name).localeCompare(String(b.name), "zh");
    });
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "skill-empty";
      empty.textContent = skillTab === "mine" ? "还没有携带技能" : "暂无技能";
      els.skillGrid.appendChild(empty);
      return;
    }
    for (const s of list) {
      const id = String(s.id);
      const on = skillState.enabled.has(id);
      const learned = skillState.learned.has(id);
      const cell = document.createElement("div");
      cell.className = "skill-cell" + (on ? " on" : "") + (learned ? "" : " off");
      cell.dataset.id = id;
      const kindLabel = isPassiveSkill(s) ? "被动" : "主动";
      const kindCls = isPassiveSkill(s) ? "" : " active";
      cell.innerHTML =
        `<span class="skill-check">${on ? "✓" : ""}</span>` +
        `<div class="skill-icon"><img src="skills/${s.icon}" alt="">` +
        `<span class="skill-lv">Lv${skillLevel(id)}</span></div>` +
        `<div class="skill-name q${s.quality}">${esc(s.name)}</div>` +
        `<span class="skill-kind${kindCls}">${kindLabel}</span>`;
      cell.addEventListener("click", () => openSkillDetail(id));
      els.skillGrid.appendChild(cell);
    }
  }

  function renderSkillTabs() {
    if (!els.skillTabs) return;
    els.skillTabs.querySelectorAll(".skill-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === skillTab);
    });
  }

  function setSkillTab(tab) {
    skillTab = tab;
    renderSkillTabs();
    renderSkillPanel();
  }

  function openSkillPanel() {
    if (!els.skillPanel) return;
    els.skillPanel.classList.remove("is-hidden");
    renderSkillTabs();
    renderSkillPanel();
  }

  // 把描述里的（1/2/3/4/5）按当前等级取一段，并用绿色标出等级数值
  function skillDescHtml(skill, lv, includeNote = true) {
    const raw = (skill && skill.desc ? String(skill.desc) : "")
      .split("\n")
      .filter(line => {
        const t = line.trim();
        return t !== "被动" && t !== "被动技能";
      })
      .join("\n")
      .trim();
    if (!raw) return "暂无描述";
    const idx = Math.max(0, Math.min(4, lv - 1));
    // 先处理「（数值/数值）」→ 只显示当前等级值
    let html = esc(raw).replace(/（([^（）]*\/[^（）]*)）/g, (m, inner) => {
      const parts = inner.split("/");
      const val = (parts[idx] || parts[parts.length - 1] || "").trim();
      return `<span class="lv-val">${val}</span>`;
    });
    // 风味文本（/说明文本/）：主描述里保留并渲染为说明样式；等级预览里去掉，只留实际效果
    if (includeNote) {
      html = html.replace(/\/([^/<>]+)\/(?=\s*\S)/g, (m, inner) => `<span class="desc-note">${inner.trim()}</span><br>`);
      html = html.replace(/\/([^/<>]+)\//g, (m, inner) => `<span class="desc-note">${inner.trim()}</span>`);
    } else {
      html = html.replace(/\/[^/<>]+\/(?=\s*\S)/g, "");
      html = html.replace(/\/[^/<>]+\//g, "");
    }
    return html;
  }

  // 技能详情：等级效果预览（默认折叠，当前等级绿字）
  function renderSkillLevels(skill) {
    const box = els.smLevels;
    if (!box) return;
    box.innerHTML = "";
    const levels = Array.isArray(skill.levels) ? skill.levels : [];
    if (levels.length < 2) { box.classList.add("is-hidden"); return; }
    const cur = skillLevel(String(skill.id));
    const title = document.createElement("div");
    title.className = "skill-levels-title";
    const head = open => `${open ? "▾" : "▸"} 预览效果`;
    title.textContent = head(false);
    const body = document.createElement("div");
    body.className = "skill-levels-body";
    body.style.display = "none";
    title.addEventListener("click", ev => {
      ev.stopPropagation();
      const open = body.style.display !== "block";
      body.style.display = open ? "block" : "none";
      title.textContent = head(open);
    });
    for (let i = 0; i < levels.length; i++) {
      const row = document.createElement("div");
      row.className = "lv-row" + (i + 1 === cur ? " current" : "");
      row.innerHTML = `<b>Lv${i + 1}</b> ${skillDescHtml(skill, i + 1, false)}`;
      body.appendChild(row);
    }
    box.appendChild(title);
    box.appendChild(body);
    box.classList.remove("is-hidden");
  }

  function openSkillDetail(id) {    const s = SKILL_BY_ID.get(String(id));
    if (!s || !els.skillModal) return;
    currentSkillId = String(id);
    const learned = skillState.learned.has(String(id));
    const on = skillState.enabled.has(String(id));
    const passive = isPassiveSkill(s);
    const used = carryCount(passive);
    const max = SKILL_CARRY_LIMIT;
    els.smIcon.src = `skills/${s.icon}`;
    els.smName.textContent = s.name;
    els.smName.className = "skill-card-name q" + s.quality;
    if (els.smType) els.smType.textContent = passive ? "被动" : "主动";
    els.smLv.textContent = `Lv${skillLevel(String(id))}`;
    if (els.smMp) {
      if (passive) {
        els.smMp.textContent = "";
        els.smMp.style.display = "none";
      } else {
        els.smMp.textContent = `MP ${s.mp || 0}`;
        els.smMp.style.display = "";
      }
    }
    els.smDesc.innerHTML = skillDescHtml(s, skillLevel(String(id)));
    renderSkillLevels(s);
    const typeLabel = passive ? "被动" : "主动";
    if (!learned) {
      els.smCarry.textContent = `${typeLabel} 未学会`;
      els.smCarry.disabled = true;
    } else if (on) {
      els.smCarry.innerHTML = `${typeLabel} 已激活 ${used}/${max}<span class="carry-box">✓</span>`;
      els.smCarry.disabled = false;
    } else if (used >= max) {
      els.smCarry.innerHTML = `${typeLabel} 已满 ${used}/${max}<span class="carry-box"></span>`;
      els.smCarry.disabled = true;
    } else {
      els.smCarry.innerHTML = `${typeLabel} 未激活 ${used}/${max}<span class="carry-box"></span>`;
      els.smCarry.disabled = false;
    }
    els.smCarry.classList.toggle("on", on);
    const learnedNow = skillState.learned.has(String(id));
    const nextLv = skillLevel(String(id)) + 1;
    // 未学会：显示「学习消耗 = 1 本书、0 金币」；已学会：显示下一级升级消耗
    const cost = learnedNow ? (SKILL_UPGRADE_COSTS[nextLv] || null) : { books: 1, gold: 0 };
    const book = s.book;
    const have = book ? countItem(String(book)) : 0;
    els.smMatIcon.src = book ? `icons/${book}.png` : "";
    els.smMatIcon.style.visibility = book ? "visible" : "hidden";
    if (book && ITEMS[book]) {
      els.smMatIcon.style.cursor = "pointer";
      els.smMatIcon.onclick = () => showItemDetail(itemKey(book));
    } else {
      els.smMatIcon.style.cursor = "default";
      els.smMatIcon.onclick = null;
    }
    els.smMatCount.textContent = cost ? `${have}/${cost.books}` : `${have}/—`;
    if (els.smGoldCost) {
      // 只有已学会且未满级时才需要金币；未学/满级都没有金币消耗，整块隐藏
      const hasGoldCost = learnedNow && !!cost;
      if (els.smGoldRow) els.smGoldRow.style.display = hasGoldCost ? "" : "none";
      if (!learnedNow) {
        els.smGoldCost.textContent = "—";
        els.smGoldCost.style.color = "";
      } else {
        els.smGoldCost.textContent = cost ? formatGold(cost.gold) : "—";
        els.smGoldCost.style.color = cost && state.player.gold >= cost.gold ? "" : "#e06a6a";
      }
    }
    const maxed = learnedNow && !cost;
    const booksOk = !!book && have >= (cost ? cost.books : Infinity);
    const goldOk = !learnedNow || (!!cost && state.player.gold >= cost.gold);
    els.smUpgrade.disabled = maxed || !booksOk || !goldOk;
    els.smUpgrade.textContent = maxed ? "已满级" : (learnedNow ? "升级" : "学习");
    els.skillModal.classList.remove("is-hidden");
  }

  function formatGold(n) {
    if (n >= 10000) {
      const w = n / 10000;
      return (Number.isInteger(w) ? w : w.toFixed(1)) + "万";
    }
    return fmt(n);
  }

  function closeSkillDetail() {
    if (els.skillModal) els.skillModal.classList.add("is-hidden");
    currentSkillId = null;
  }

  function toggleSkillCarry(id) {
    id = String(id);
    if (!skillState.learned.has(id)) return;
    const s = SKILL_BY_ID.get(id);
    if (!s) return;
    if (skillState.enabled.has(id)) {
      skillState.enabled.delete(id);
    } else {
      const passive = isPassiveSkill(s);
      if (carryCount(passive) >= SKILL_CARRY_LIMIT) {
        showToast(`最多激活 ${SKILL_CARRY_LIMIT} 个${passive ? "被动" : "主动"}技能`);
        openSkillDetail(id);
        return;
      }
      skillState.enabled.add(id);
    }
    renderSkillPanel();
    openSkillDetail(id);
    saveState();
  }

  // 使用技能书：未学会 → 消耗 1 本并学会 Lv1；已学会 → 只打开技能详情
  function useSkillBook(item, skill) {
    if (!item || !skill) return false;
    const id = String(skill.id);
    const owned = countItem(item.id);
    if (owned <= 0) return false;
    if (skillState.learned.has(id)) {
      hideItemDetail();
      openSkillDetail(id);
      return true;
    }
    takeItem(item.id);
    skillState.learned.add(id);
    skillState.levels[id] = 1;
    saveState();
    renderBag();
    hideItemDetail();
    openSkillPanel();
    openSkillDetail(id);
    showToast(`学会了「${esc(skill.name)}」`);
    return true;
  }

  /* ---------------- 特殊道具（type 2）使用效果 ---------------- */
  // 选择弹窗：options = [{ label, desc?, icon?, onPick(count) }]
  //   confirm=true 时：点条目只选中，点底部「确定」才生效（灵药箱/箱子）
  //   confirm=false 时：点条目直接生效（万能药选属性）
  let choiceMaxCount = 1;
  let choiceQtyValue = 1;
  let choiceConfirmMode = false;
  let choiceOptions = [];
  let choiceSelectedIdx = -1;
  let choiceOnConfirm = null;

  const plainDesc = (text) => String(text || "").replace(/\//g, "").trim();

  function renderChoiceQty() {
    if (els.choiceCount) els.choiceCount.textContent = String(choiceQtyValue);
    if (els.choiceMinus) els.choiceMinus.disabled = choiceQtyValue <= 1;
    if (els.choicePlus) els.choicePlus.disabled = choiceQtyValue >= choiceMaxCount;
    if (els.choiceMax) els.choiceMax.disabled = choiceQtyValue >= choiceMaxCount;
  }

  function setChoiceQty(n) {
    choiceQtyValue = Math.max(1, Math.min(choiceMaxCount, toInt(n, 1)));
    renderChoiceQty();
  }

  function renderChoiceSelection() {
    [...els.choiceList.children].forEach((btn, i) => {
      btn.classList.toggle("selected", i === choiceSelectedIdx);
    });
    if (els.choiceConfirm) {
      els.choiceConfirm.classList.toggle("is-hidden", !choiceConfirmMode);
      els.choiceConfirm.disabled = choiceSelectedIdx < 0;
    }
  }

  function confirmChoice() {
    // 纯数量确认（开箱）：没有选项，只把选中的数量回调出去
    if (choiceOnConfirm) {
      const fn = choiceOnConfirm;
      const n = choiceQtyValue;
      closeChoice();
      fn(n);
      return;
    }
    if (!choiceConfirmMode || choiceSelectedIdx < 0) return;
    const opt = choiceOptions[choiceSelectedIdx];
    const count = choiceQtyValue;
    closeChoice();
    if (opt && opt.onPick) opt.onPick(count);
  }

  function openChoice({ title, hint, options = [], maxCount = 1, confirm = false, qtyOnly = false, onConfirm = null }) {
    if (!els.choiceModal) return;
    choiceMaxCount = Math.max(1, toInt(maxCount, 1));
    choiceQtyValue = 1;
    choiceConfirmMode = !!confirm || !!qtyOnly;
    choiceOnConfirm = onConfirm || null;
    choiceOptions = options || [];
    // 确定模式默认选中第一项，点条目只切换选中
    choiceSelectedIdx = qtyOnly ? 0 : (choiceConfirmMode && choiceOptions.length ? 0 : -1);
    els.choiceTitle.textContent = title || "选择";
    els.choiceHint.innerHTML = hint || "";
    els.choiceList.innerHTML = "";
    choiceOptions.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-item";
      btn.innerHTML =
        (opt.icon ? `<img class="choice-icon" src="${opt.icon}" alt="">` : "") +
        `<span class="choice-body">` +
        `<span class="choice-label">${esc(opt.label)}</span>` +
        (opt.desc || opt.sub ? `<span class="choice-sub">${esc(opt.desc || opt.sub)}</span>` : "") +
        `</span>`;
      btn.addEventListener("click", () => {
        if (choiceConfirmMode) {
          choiceSelectedIdx = i;
          renderChoiceSelection();
          return;
        }
        const count = choiceQtyValue;
        closeChoice();
        if (opt.onPick) opt.onPick(count);
      });
      els.choiceList.appendChild(btn);
    });
    if (els.choiceQty) {
      els.choiceQty.classList.toggle("is-hidden", choiceMaxCount <= 1);
      renderChoiceQty();
    }
    renderChoiceSelection();
    els.choiceModal.classList.remove("is-hidden");
  }

  function closeChoice() {
    if (els.choiceModal) els.choiceModal.classList.add("is-hidden");
    choiceOnConfirm = null;
  }

  // 开箱结果弹窗：items = [{ id, count }]，图标可点开只读详情
  function openReward(items) {
    if (!els.rewardModal) return;
    els.rewardList.innerHTML = "";
    for (const { id, count } of items) {
      if (id === "gold") {
        const cell = document.createElement("div");
        cell.className = "reward-item q6";
        cell.innerHTML = `<img src="icons/coin.png" alt=""><span class="bag-count">${goldShort(count)}</span>`;
        cell.title = `${count} 金币`;
        els.rewardList.appendChild(cell);
        continue;
      }
      const it = ITEMS[String(id)];
      if (!it) continue;
      const cell = document.createElement("div");
      cell.className = "reward-item q" + it.quality;
      cell.innerHTML = `<img src="${iconSrc(it)}" alt="">` +
        (count > 1 ? `<span class="bag-count">${count}</span>` : "");
      cell.title = it.name;
      bindItemClick(cell, itemKey(it.id), false);   // 只读：不能操作
      els.rewardList.appendChild(cell);
    }
    els.rewardModal.classList.remove("is-hidden");
  }

  function closeReward() {
    if (els.rewardModal) els.rewardModal.classList.add("is-hidden");
  }

  // 纯数量选择弹窗（开箱用）
  function openQtyDialog({ title, hint, maxCount, onConfirm }) {
    openChoice({ title, hint, maxCount, qtyOnly: true, onConfirm });
  }

  // 开箱：可一次开多个，结果统一展示；drawOne() 返回 [{ id, count }]
  function openBoxes(item, drawOne) {
    const have = countItem(item.id);
    const run = (count) => {
      const got = new Map();
      let opened = 0;
      for (let i = 0; i < count; i++) {
        if (!consumeOne(item.id)) break;
        opened++;
        for (const r of (drawOne() || [])) {
          if (r.gold) {
            state.player.gold += r.amount;
            got.set("gold", (got.get("gold") || 0) + r.amount);
            continue;
          }
          if (!ITEMS[String(r.id)]) continue;
          grantItem(r.id, r.count || 1);
          got.set(String(r.id), (got.get(String(r.id)) || 0) + (r.count || 1));
        }
      }
      if (!opened) { showToast("道具不足"); return; }
      hideItemDetail();
      renderBag();
      saveState();
      openReward([...got.entries()].map(([id, count]) => ({ id, count })));
    };
    if (have > 1) {
      openQtyDialog({
        title: "开启数量",
        hint: `持有 ${have} 个，选择要开启的数量`,
        maxCount: have,
        onConfirm: run,
      });
    } else {
      run(1);
    }
  }

  // 消耗 1 个道具（背包优先、其次收获区）
  function consumeOne(itemId) {
    return takeItem(itemId);
  }

  // 发放道具到背包
  function grantItem(id, count = 1) {
    const it = ITEMS[String(id)];
    if (!it) return false;
    addBagKey(itemKey(it.id), count);
    return true;
  }

  function useSpecialItem(item) {
    if (!item || !item.use) return;
    if (countItem(item.id) <= 0) { showToast("道具不足"); return; }
    const kind = item.use.kind;
    if (kind === "teleport") return useTeleport(item);
    if (kind === "permanent") return usePermanent(item);
    if (kind === "choose") return useChooseItem(item);
    if (kind === "bundle") return useBundle(item);
    if (kind === "equipBox") return useEquipBox(item);
    if (kind === "box") return useRandomBox(item);
    if (kind === "timeGem") return useTimeGem(item);
    if (kind === "cardBox") return useCardBox(item);
    if (kind === "qualityEquip") return useQualityEquip(item);
    if (kind === "skillBookBox") return useSkillBookBox(item);
    if (kind === "summonBoss") return useSummonBoss(item, false);
    if (kind === "dominateBoss") return useSummonBoss(item, true);
    if (kind === "keyBoss") return useKeyBoss(item);
    if (kind === "treasureMap") return useTreasureMap(item);
    showToast("这个道具的效果还没有实现");
  }

  // 藏宝图：先选等级范围 → 随机传送到亚丁大陆有首领的地区并挑战
  function useTreasureMap(item) {
    const ranges = [
      { label: "60 级以下", min: 0, max: 60 },
      { label: "60~70 级", min: 60, max: 70 },
      { label: "70~80 级", min: 70, max: 80 },
      { label: "80 级以上", min: 80, max: Infinity },
    ];
    const all = DATA.monsters.filter(m => m.boss && String(m.area || "").startsWith("亚丁大陆"));
    if (!all.length) { showToast("没有可传送的地区"); return; }
    openChoice({
      title: "使用藏宝图",
      hint: "随机传送并挑战亚丁大陆首领",
      options: ranges.map(r => {
        const pool = all.filter(m => (m.level || 0) >= r.min && (m.level || 0) < r.max);
        return {
          label: r.label,
          onPick: () => {
            if (!pool.length) { showToast("该范围没有首领"); return; }
            const picked = pool[Math.floor(Math.random() * pool.length)];
            const areaPool = pool.filter(m => m.area === picked.area);
            const boss = areaPool[Math.floor(Math.random() * areaPool.length)];
            if (!consumeOne(item.id)) { showToast("道具不足"); return; }
            state.area = boss.area;
            state.pendingBoss = boss.id;
            startBattle();
            renderArea();
            renderBag();
            hideItemDetail();
            saveState();
            showToast(`传送到「${boss.area}」，挑战${boss.name}`);
          },
        };
      }),
    });
  }

  // 次元钥匙：弹窗选择 5 只 BOSS 挑战，消耗对应数量钥匙，地点不变
  function useKeyBoss(item) {
    const have = countItem(item.id);
    const opts = (item.use.options || [])
      .map(o => ({ boss: DATA.monsters.find(m => String(m.id) === String(o.id)), cost: o.cost }))
      .filter(x => x.boss);
    if (!opts.length) { showToast("没有可挑战的首领"); return; }
    // 按首领等级从低到高排序
    opts.sort((a, b) => (a.boss.level || 0) - (b.boss.level || 0));
    openChoice({
      title: "选择挑战的首领",
      hint: "消耗次元钥匙，挑战血盟首领",
      options: opts.map(x => ({
        label: `${x.boss.name}（Lv.${x.boss.level}）`,
        sub: `消耗 ${x.cost} 把钥匙（拥有 ${have}）`,
        onPick: () => {
          if (countItem(item.id) < x.cost) { showToast("次元钥匙不足"); return; }
          for (let i = 0; i < x.cost; i++) takeItem(item.id);
          state.pendingBoss = x.boss.id;
          startBattle();
          renderBag();
          renderPlayer();
          hideItemDetail();
          saveState();
          showToast(`挑战 ${x.boss.name}`);
        },
      })),
    });
  }

  // 召唤符 / 支配符：先让玩家选首领，选好后再切换地区并立刻挑战
  function useSummonBoss(item, dominate) {
    const area = item.use.area;
    const bosses = DATA.monsters.filter(m => m.area === area && m.boss);
    if (!bosses.length) { showToast("这个地区没有首领"); return; }
    if (dominate) {
      const until = state.dominateCooldowns.get(String(item.id)) || 0;
      if (Date.now() < until) { showToast(`冷却中，剩余${fmtCd(until - Date.now())}`); return; }
    }
    const start = (boss) => {
      if (dominate) {
        state.dominateCooldowns.set(String(item.id), Date.now() + 24 * 3600 * 1000);
      } else if (!consumeOne(item.id)) {
        showToast("道具不足");
        return;
      }
      // 先选好首领，再切换地区
      state.area = area;
      state.pendingBoss = boss.id;
      startBattle();
      renderArea();
      renderBag();
      hideItemDetail();
      saveState();
      showToast(`前往「${area}」，挑战${boss.name}`);
    };
    // 无论几个首领都统一弹窗选择，带上等级 / HP 信息
    const sorted = bosses.slice().sort((a, b) => (a.level || 0) - (b.level || 0));
    openChoice({
      title: "选择挑战的首领",
      hint: `${area} · 共 ${sorted.length} 个首领`,
      options: sorted.map(b => ({
        label: b.name,
        sub: `等级 ${b.level || "?"} · HP ${fmt(b.hp)}`,
        onPick: () => start(b),
      })),
    });
  }

  // 冷却剩余时间：X小时XX分XX秒
  function fmtCd(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}小时${String(m).padStart(2, "0")}分${String(sec).padStart(2, "0")}秒`;
  }

  // 每秒刷新支配符的黑色扇形遮罩：剩余越少角度越小
  function tickCooldownMasks() {
    if (!document.querySelectorAll) return;   // 测试桩没有 querySelectorAll
    const now = Date.now();
    document.querySelectorAll(".cd-mask[data-until]").forEach(el => {
      const left = Number(el.dataset.until) - now;
      if (left <= 0) { el.remove(); return; }
      // 顺时针消退：--deg 表示「已过角度」，遮罩在 deg~360
      el.style.setProperty("--deg", `${(1 - left / (24 * 3600 * 1000)) * 360}deg`);
    });
  }

  // 传送卷轴：随机地区（已解锁 / 全部），立即切换并开始战斗
  function useTeleport(item) {
    const scope = item.use.scope;
    // 次元钥匙不是可挂机地区，只能通过次元钥匙道具挑战 BOSS，不进入随机传送池
    const pool = areaInfo.filter(a =>
      a.name !== "次元钥匙" &&
      (scope === "all" || areaUnlocked(state.player.level, a.minLevel)));
    if (!pool.length) { showToast("没有可以传送的地区"); return; }
    const target = pool[Math.floor(Math.random() * pool.length)];
    if (!consumeOne(item.id)) { showToast("道具不足"); return; }
    state.area = target.name;
    startBattle();
    renderArea();
    renderPlayer();
    renderBag();
    hideItemDetail();
    saveState();
    showToast(`传送到「${esc(target.label || target.name)}」`);
  }

  // 万能药：每种属性单独计算成功率（1/(该属性已成功次数+1)）；失败也消耗道具，但不影响任何属性
  function usePermanent(item) {
    const options = (item.use.options || []).map((o) => {
      const n = state.useCounts.get(`${item.id}:${o.key}`) || 0;
      return {
        label: `${o.name} +${o.value}`,
        sub: `成功率 ${Math.round(100 / (n + 1))}%（已成功 ${n} 次）`,
        onPick: () => rollPermanent(item, o),
      };
    });
    openChoice({
      title: "选择提升的属性",
      hint: "每种属性成功提升后概率将会降低",
      options,
    });
  }

  // count = 一次使用几瓶（同一属性逐个判定，成功率随成功次数递增而下降）
  function rollPermanent(item, opt, count = 1) {
    const id = String(item.id);
    const countKey = `${id}:${opt.key}`;
    let used = 0;
    let ok = 0;
    for (let i = 0; i < count; i++) {
      const successes = state.useCounts.get(countKey) || 0;
      const rate = 1 / (successes + 1);
      if (!consumeOne(item.id)) break;
      used++;
      if (Math.random() < rate) {
        // 只有成功才累加该属性的次数：失败不影响下一次，也不影响其它属性
        state.useCounts.set(countKey, successes + 1);
        const perm = state.player.permanent;
        perm[opt.key] = (perm[opt.key] || 0) + opt.value;
        ok++;
      }
    }
    if (!used) { showToast("道具不足"); return; }
    if (ok) {
      recalcStats();
      renderPlayer();
      if (els.statsView && !els.statsView.classList.contains("is-hidden")) renderStats();
    }
    hideItemDetail();
    renderBag();
    saveState();
    if (count === 1) {
      showToast(ok
        ? `成功！${opt.name} +${opt.value}`
        : `你使用了${qName(item.name, item.quality)}，但是什么也没有发生`);
    } else {
      showToast(ok
        ? `使用 ${used} 瓶：成功 ${ok} 次，永久${opt.name} +${ok * opt.value}`
        : `使用 ${used} 瓶：全部失败，${opt.name}没有提升`);
    }
  }

  // 灵药箱：二选一获得（可一次开多个）
  function useChooseItem(item) {
    const have = countItem(item.id);
    const options = (item.use.options || []).map((o) => {
      const it = ITEMS[String(o.id)];
      return {
        label: `${it ? it.name : o.id} ×${o.count}`,
        desc: it ? plainDesc(it.desc) : "",
        icon: it ? iconSrc(it) : "",
        onPick: (count) => {
          let used = 0;
          for (let i = 0; i < count; i++) {
            if (!consumeOne(item.id)) break;
            grantItem(o.id, o.count);
            used++;
          }
          if (!used) { showToast("道具不足"); return; }
          hideItemDetail();
          renderBag();
          saveState();
          openReward([{ id: o.id, count: used * o.count }]);
        },
      };
    });
    openChoice({ title: "选择获得的道具", maxCount: have, confirm: true, options });
  }

  // 固定内容礼包（药水箱）
  function useBundle(item) {
    openBoxes(item, () => (item.use.items || []).map((g) => ({ id: g.id, count: g.count })));
  }

  // 装备箱：按品质概率抽一件装备
  function useEquipBox(item) {
    const rates = item.use.rates || {};
    openBoxes(item, () => {
      let roll = Math.random() * 100;
      let acc = 0;
      let quality = 1;
      for (const [k, v] of Object.entries(rates)) {
        acc += Number(v) || 0;
        if (roll < acc) { quality = Number(k); break; }
      }
      const pool = Object.values(ITEMS).filter((i) =>
        i.type === 3 && i.quality === quality && i.slot &&
        !/^\[(变身卡|魔法娃娃卡)\]/.test(i.name || ""));
      if (!pool.length) return [];
      return [{ id: pool[Math.floor(Math.random() * pool.length)].id, count: 1 }];
    });
  }

  // 概率箱子：按「箱子」表权重随机开 1 个
  function useRandomBox(item) {
    const rolls = (DATA.boxes || {})[String(item.id)] || [];
    if (!rolls.length) { showToast("箱子内容待配置"); return; }
    const total = rolls.reduce((s, r) => s + (Number(r.weight) || 0), 0);
    if (total <= 0) { showToast("箱子内容待配置"); return; }
    openBoxes(item, () => {
      let roll = Math.random() * total;
      let pick = rolls[rolls.length - 1];
      for (const r of rolls) {
        roll -= Number(r.weight) || 0;
        if (roll <= 0) { pick = r; break; }
      }
      const count = Math.max(1, toInt(pick.count, 1));
      if (pick.id === "金币" || pick.id === "gold") return [{ gold: true, amount: count }];
      return [{ id: pick.id, count }];
    });
  }
  // 品质/类型随机的卡片箱（神秘卡、稀有卡箱）
  function useCardBox(item) {
    const quality = Number(item.use.quality) || 1;
    const slot = item.use.slot;
    const pool = Object.values(ITEMS).filter((i) =>
      i.type === 3 && i.slot === slot && i.quality === quality &&
      /^\[(变身卡|魔法娃娃卡)\]/.test(i.name || ""));
    if (!pool.length) { showToast("没有可开出的卡片"); return; }
    openBoxes(item, () => [{ id: pool[Math.floor(Math.random() * pool.length)].id, count: 1 }]);
  }

  // 技能书箱：按品质随机开一本技能书（库杰英雄/传说技能书箱）
  function useSkillBookBox(item) {
    const q = Number(item.use.quality) || 1;
    const pool = [];
    for (const s of SKILLS) {
      if (Number(s.quality) !== q) continue;
      const book = s.book || (Array.isArray(s.books) && s.books[0]);
      if (book && ITEMS[String(book)]) pool.push(String(book));
    }
    if (!pool.length) { showToast("没有可开出的技能书"); return; }
    openBoxes(item, () => [{ id: pool[Math.floor(Math.random() * pool.length)], count: 1 }]);
  }

  // 品质概率 + 部位随机的装备箱（2598 耳环 / 2599 戒指）
  function useQualityEquip(item) {    const slot = item.use.slot;
    const rates = item.use.rates || {};
    openBoxes(item, () => {
      let roll = Math.random() * 100;
      let acc = 0;
      let quality = null;
      for (const [k, v] of Object.entries(rates)) {
        acc += Number(v) || 0;
        if (roll < acc) { quality = Number(k); break; }
      }
      if (quality == null) return [];
      const pool = Object.values(ITEMS).filter((i) =>
        i.type === 3 && i.slot === slot && i.quality === quality);
      if (!pool.length) return [];
      return [{ id: pool[Math.floor(Math.random() * pool.length)].id, count: 1 }];
    });
  }

  // 时间补充宝石：选地区 + 数量 + 确定，立刻结算 N 小时的离线收益（进收获区，含经验）
  function harvestTotals() {
    let items = 0;
    for (const n of state.harvest.values()) items += n;
    return { items, gold: state.harvestGold };
  }

  function useTimeGem(item) {
    const hours = Math.max(1, Math.round(item.use.hours || 1));
    const have = countItem(item.id);
    const options = (item.use.areas || []).map((area) => {
      // 副标题显示该地区的怪物等级范围（小怪，不含首领）
      const info = areaInfo.find(a => a.name === area);
      const lo = info && info.mobMin != null ? info.mobMin : (info ? info.minLevel : null);
      const hi = info && info.mobMax != null ? info.mobMax : lo;
      const lvText = lo == null ? "" : (lo === hi ? `Lv${lo}` : `Lv${lo}~${hi}`);
      return {
        label: area,
        sub: lvText,
        onPick: (count) => {
          let used = 0;
          for (let i = 0; i < count; i++) {
            if (!consumeOne(item.id)) break;
            used++;
          }
          if (!used) { showToast("道具不足"); return; }
          const before = harvestTotals();
          const lvBefore = state.player.level;
          // 复用离线结算：起始时间往前推 used×hours 小时，不占实际挂机时间
          settleOffline(Date.now() - used * hours * 3600 * 1000, area, false);
          const after = harvestTotals();
          hideItemDetail();
          renderBag();
          saveState();
          const gained = after.items - before.items;
          const gold = Math.max(0, after.gold - before.gold);
          const lvUp = state.player.level > lvBefore ? `，等级提升至 Lv${state.player.level}` : "";
          showToast(`在「${esc(area)}」获得 ${fmt(gained)} 件道具、金币 ${fmt(gold)}${lvUp}`);
        },
      };
    });
    openChoice({
      title: "选择使用地区",
      hint: `立刻获得${hours} 小时挂机收益`,
      maxCount: have,
      confirm: true,
      options,
    });
  }

  // 在技能详情里直接学习：消耗 1 本技能书
  function learnSkillById(id) {
    id = String(id);
    const s = SKILL_BY_ID.get(id);
    if (!s || skillState.learned.has(id)) return;
    const book = String(s.book || "");
    const have = book ? countItem(book) : 0;
    if (!book || have < 1) {
      showToast("技能书不足");
      return;
    }
    takeItem(book);
    skillState.learned.add(id);
    skillState.levels[id] = 1;
    renderBag();
    renderSkillPanel();
    openSkillDetail(id);
    saveState();
    showToast(`学会了「${s.name}」`);
  }

  function upgradeSkill(id) {
    id = String(id);
    const s = SKILL_BY_ID.get(id);
    if (!s) return;
    const lv = skillLevel(id);
    const cost = SKILL_UPGRADE_COSTS[lv + 1];
    if (!cost) return;
    const book = String(s.book || "");
    const have = book ? countItem(book) : 0;
    if (!book || have < cost.books) {
      showToast("技能书不足");
      return;
    }
    if (state.player.gold < cost.gold) {
      showToast("金币不足");
      return;
    }
    state.player.gold -= cost.gold;
    for (let i = 0; i < cost.books; i++) takeItem(book);
    skillState.levels[id] = lv + 1;
    renderBag();
    renderPlayer();
    renderSkillPanel();
    openSkillDetail(id);
    saveState();
    showToast(`技能升级到 Lv${lv + 1}`);
  }

  if (els.skillBtn) {
    els.skillBtn.addEventListener("click", openSkillPanel);
  }
  if (els.skillClose) {
    els.skillClose.addEventListener("click", () => els.skillPanel.classList.add("is-hidden"));
  }
  if (els.skillTabs) {
    els.skillTabs.querySelectorAll(".skill-tab").forEach(btn => {
      btn.addEventListener("click", () => setSkillTab(btn.dataset.tab));
    });
  }
  if (els.skillModalClose) els.skillModalClose.addEventListener("click", closeSkillDetail);
  if (els.skillModal) {
    els.skillModal.addEventListener("click", ev => {
      if (ev.target === els.skillModal) closeSkillDetail();
    });
  }
  if (els.smCarry) {
    els.smCarry.addEventListener("click", () => {
      if (currentSkillId != null) toggleSkillCarry(currentSkillId);
    });
  }
  if (els.smUpgrade) {
    els.smUpgrade.addEventListener("click", () => {
      if (currentSkillId == null) return;
      if (!skillState.learned.has(String(currentSkillId))) learnSkillById(currentSkillId);
      else upgradeSkill(currentSkillId);
    });
  }

  /* ---------------- 道具详情弹窗拖动 / 位置记忆 ---------------- */
  const ITEM_POS_KEY = "lineagem_item_card_pos_v1";
  let itemCardPos = null;      // {x, y} 视口坐标；null 表示居中

  function loadItemCardPos() {
    try {
      const raw = localStorage.getItem(ITEM_POS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) itemCardPos = { x: p.x, y: p.y };
    } catch (e) { /* 忽略 */ }
  }

  function saveItemCardPos() {
    try {
      if (itemCardPos) localStorage.setItem(ITEM_POS_KEY, JSON.stringify(itemCardPos));
      else localStorage.removeItem(ITEM_POS_KEY);
    } catch (e) { /* 忽略 */ }
  }

  function applyItemCardPos() {
    const card = els.itemCard;
    if (!card) return;
    if (!itemCardPos) {
      card.style.position = "";
      card.style.left = "";
      card.style.top = "";
      card.style.margin = "";
      return;
    }
    const r = card.getBoundingClientRect ? card.getBoundingClientRect() : { width: 0, height: 0 };
    const w = r.width || card.offsetWidth || 320;
    const h = r.height || card.offsetHeight || 240;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const maxX = Math.max(0, vw - w);
    const maxY = Math.max(0, vh - h);
    const x = Math.min(Math.max(0, itemCardPos.x), maxX);
    const y = Math.min(Math.max(0, itemCardPos.y), maxY);
    itemCardPos = { x, y };
    card.style.position = "fixed";
    card.style.left = x + "px";
    card.style.top = y + "px";
    card.style.margin = "0";
  }

  function moveItemCard(x, y) {
    const card = els.itemCard;
    if (!card) return;
    const w = card.offsetWidth || 320;
    const h = card.offsetHeight || 240;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const px = Math.min(Math.max(0, x), Math.max(0, vw - w));
    const py = Math.min(Math.max(0, y), Math.max(0, vh - h));
    itemCardPos = { x: px, y: py };
    card.style.position = "fixed";
    card.style.left = px + "px";
    card.style.top = py + "px";
    card.style.margin = "0";
  }

  loadItemCardPos();

  let itemCardDrag = null;
  if (els.itemCard) {
    els.itemCard.addEventListener("mousedown", ev => {
      if (ev.button !== 0) return;
      // 按钮 / 链接上按下时不拖动，交给它们自己的点击
      const tag = ev.target && ev.target.tagName ? ev.target.tagName : "";
      if (tag === "BUTTON" || tag === "A" || tag === "IMG") return;
      const r = els.itemCard.getBoundingClientRect
        ? els.itemCard.getBoundingClientRect()
        : { left: 0, top: 0 };
      itemCardDrag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top };
      els.itemCard.classList.add("dragging");
      ev.preventDefault();
    });
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("mousemove", ev => {
        if (!itemCardDrag) return;
        moveItemCard(ev.clientX - itemCardDrag.dx, ev.clientY - itemCardDrag.dy);
      });
      window.addEventListener("mouseup", () => {
        if (!itemCardDrag) return;
        itemCardDrag = null;
        els.itemCard.classList.remove("dragging");
        saveItemCardPos();
      });
    }
  }

  /* ---------------- 背包弹窗拖动 ---------------- */
  const BAG_POS_KEY = "lineagem_bag_pos_v1";
  let bagPos = null;
  function loadBagPos() {
    try {
      const raw = localStorage.getItem(BAG_POS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) bagPos = { x: p.x, y: p.y };
    } catch (e) { /* 忽略 */ }
  }
  function saveBagPos() {
    try {
      if (bagPos) localStorage.setItem(BAG_POS_KEY, JSON.stringify(bagPos));
      else localStorage.removeItem(BAG_POS_KEY);
    } catch (e) { /* 忽略 */ }
  }
  function moveBagWindow(x, y) {
    const win = els.bagWindow;
    if (!win) return;
    const w = win.offsetWidth || 274;
    const h = win.offsetHeight || 460;
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const maxX = Math.max(0, vw - w);
    const maxY = Math.max(0, vh - h);
    const px = Math.min(Math.max(0, x), maxX);
    const py = Math.min(Math.max(0, y), maxY);
    bagPos = { x: px, y: py };
    win.style.position = "fixed";
    win.style.left = px + "px";
    win.style.top = py + "px";
    win.style.margin = "0";
  }
  function applyBagPos() {
    const win = els.bagWindow;
    if (!win) return;
    if (!bagPos) {
      win.style.position = "";
      win.style.left = "";
      win.style.top = "";
      win.style.margin = "";
      return;
    }
    moveBagWindow(bagPos.x, bagPos.y);
  }
  loadBagPos();
  let bagWinDrag = null;
  if (els.bagWindow) {
    els.bagWindow.addEventListener("mousedown", ev => {
      if (ev.button !== 0) return;
      // 按钮 / 图片 / 格子上按下时不拖动，交给它们自己的点击
      const tag = ev.target && ev.target.tagName ? ev.target.tagName : "";
      const cls = String((ev.target && ev.target.className) || "");
      if (tag === "BUTTON" || tag === "IMG" || cls.includes("bag-cell")) return;
      const r = els.bagWindow.getBoundingClientRect
        ? els.bagWindow.getBoundingClientRect()
        : { left: 0, top: 0 };
      bagWinDrag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top };
      els.bagWindow.classList.add("dragging");
      ev.preventDefault();
    });
    window.addEventListener("mousemove", ev => {
      if (!bagWinDrag) return;
      moveBagWindow(ev.clientX - bagWinDrag.dx, ev.clientY - bagWinDrag.dy);
    });
    window.addEventListener("mouseup", () => {
      if (!bagWinDrag) return;
      bagWinDrag = null;
      els.bagWindow.classList.remove("dragging");
      saveBagPos();
    });
  }

  /* ---------------- 强化界面 ---------------- */
  // 安定值：null 表示源站写「無安定值」，按 0 处理（+0→+1 仍是 100%，之后按等级递减）
  function enhanceSafe(itemId) {
    const e = (DATA.equipEnchant || {})[String(itemId)];
    return e && e.safe != null ? Number(e.safe) : 0;
  }

  // 成功率：当前等级 < 安定值 → 100%；否则 1/(当前等级+1)；祝福卷轴固定 1%
  function enhanceRate(itemId, level, scrollId) {
    if (scrollId === BLESS_SCROLL) return 5;
    const safe = enhanceSafe(itemId);
    if (level < safe) return 100;
    return 100 / (level + 1);
  }

  // 某强化等级下的属性汇总（基础 + 该档强化属性 + 祝福属性）
  function enhanceStatMap(item, level, blessed) {
    const merged = new Map();
    const add = (key, val) => {
      if (!key) return;
      merged.set(key, (merged.get(key) || 0) + toInt(val, 0));
    };
    for (const a of item.attrs || []) if (a && a.key) add(a.key, a.value);
    if (level > 0) {
      const lv = enchantLevelOf(item.id, level);
      if (lv && lv.attrs) for (const [k, v] of Object.entries(lv.attrs)) add(k, v);
    }
    if (blessed && Array.isArray(item.blessAttrs)) {
      for (const a of item.blessAttrs) {
        if (a && a.key) add(a.key, a.value);
      }
    }
    return merged;
  }

  // 某强化等级下的触发效果（基础 + 该档强化，同名概率相加）
  function enhanceTriggerMap(item, level) {
    const map = new Map();
    const add = t => {
      if (!t || !t.name) return;
      const c = t.chance == null ? null : Number(t.chance);
      const cur = map.get(t.name);
      if (!cur) {
        map.set(t.name, { name: t.name, chance: c, when: t.when, desc: t.desc });
      } else if (c != null) {
        cur.chance = (cur.chance == null ? 0 : cur.chance) + c;
      }
    };
    if (Array.isArray(item.triggers)) item.triggers.forEach(add);
    if (level > 0) {
      const lv = enchantLevelOf(item.id, level);
      if (lv && Array.isArray(lv.triggers)) lv.triggers.forEach(add);
    }
    return map;
  }

  function enhanceStatsHtml(item, level, blessed) {
    const map = enhanceStatMap(item, level, blessed);
    if (!map.size) return '<div class="enh-empty">无属性</div>';
    return [...map.entries()]
      .map(([k, v]) => `<div>${GEAR_NAME[k] || k} <span class="plus">${v >= 0 ? "+" : ""}${v}${isPctAttr(k) ? "%" : ""}</span></div>`)
      .join("");
  }

  // 强化界面专用：和对比表比，有变化的值才绿，没变化的白字
  function compareStatsHtml(map, cmp) {
    if (!map.size) return '<div class="enh-empty">无属性</div>';
    return [...map.entries()]
      .map(([k, v]) => {
        const changed = cmp ? (cmp.get(k) || 0) !== v : false;
        return `<div>${GEAR_NAME[k] || k} <span class="${changed ? "plus" : ""}">${v >= 0 ? "+" : ""}${v}${isPctAttr(k) ? "%" : ""}</span></div>`;
      })
      .join("");
  }

  // 只显示祝福会加的属性
  function blessStatsHtml(item) {
    const list = (item.blessAttrs || []).filter(a => a && a.key);
    if (!list.length) return '<div class="enh-empty">无祝福属性</div>';
    return list
      .map(m => `<div>${GEAR_NAME[m.key] || m.name} <span class="plus">${m.value >= 0 ? "+" : ""}${m.value}${(m.pct || isPctAttr(m.key)) ? "%" : ""}</span></div>`)
      .join("");
  }

  function openEnhance(key) {
    const item = keyItem(key);
    if (!item || item.type !== 3) return;
    enhanceKey = key;
    // 判断这个实例在装备栏还是背包（装备栏强化失败会直接消失）
    enhanceSource = Object.values(equipment).includes(key) ? "equip" : "bag";
    enhanceScroll = null;
    renderEnhance();
    if (els.enhanceModal) els.enhanceModal.classList.remove("is-hidden");
  }

  function closeEnhance() {
    if (els.enhanceModal) els.enhanceModal.classList.add("is-hidden");
    enhanceKey = null;
    enhanceScroll = null;
  }

  function enhanceScrollList(item) {
    const slot = item.slot === "weapon" ? "weapon" : "armor";
    return ENHANCE_SCROLLS[slot] || [];
  }

  function renderEnhance() {
    const key = enhanceKey;
    if (!key) return;
    const { id, enhance, bless } = parseKey(key);
    const item = ITEMS[id];
    if (!item) return;
    const maxed = enhance >= ENHANCE_MAX;
    // 装备已祝福：自动退出祝福卷轴的选择
    if (bless && enhanceScroll === BLESS_SCROLL) enhanceScroll = null;
    const blessMode = enhanceScroll === BLESS_SCROLL;
    if (els.enhCompare) els.enhCompare.classList.toggle("bless-mode", blessMode);
    if (els.enhAfterTitle) els.enhAfterTitle.textContent = blessMode ? "祝福属性" : "强化后属性";

    if (els.enhIcon) els.enhIcon.src = iconSrc(item);
    // 图标角标：强化 +N 绿、祝福 ★ 金（与装备栏 / 背包 / 详情一致）
    if (els.enhIconBadge) els.enhIconBadge.innerHTML = enhLabelHtml(key);
    if (els.enhName) {
      els.enhName.textContent = itemLabel(key);
      els.enhName.style.color = QCOLOR[item.quality] || "#fff";
    }
    const beforeMap = enhanceStatMap(item, enhance, !!bless);
    // 触发效果（武器技能）也按左右两栏显示，格式与普通属性一致
    const beforeTrig = enhanceTriggerMap(item, enhance);
    const afterTrig = enhanceTriggerMap(item, enhance + 1);
    const trigLineHtml = (t, changed) => {
      const when = t.when ? `${t.when}发动：` : "发动：";
      return `<div>${when}${t.name} <span class="${changed ? "plus" : ""}">${t.chance}%</span></div>`;
    };
    const beforeTrigHtml = [...beforeTrig.values()]
      .filter(t => t.chance != null)
      .map(t => trigLineHtml(t, false))
      .join("");
    const afterTrigHtml = [...afterTrig.values()]
      .filter(t => t.chance != null)
      .map(t => {
        const b = beforeTrig.get(t.name);
        return trigLineHtml(t, !!b && b.chance !== t.chance);
      })
      .join("");

    if (els.enhBefore) {
      const html = (beforeMap.size ? compareStatsHtml(beforeMap, null) : "") + beforeTrigHtml;
      els.enhBefore.innerHTML = html || '<div class="enh-empty">无属性</div>';
    }
    if (els.enhAfter) {
      const isBlessSel = enhanceScroll === BLESS_SCROLL;
      if (isBlessSel) {
        // 祝福：只显示祝福会加的属性
        els.enhAfter.innerHTML = blessStatsHtml(item);
      } else if (maxed) {
        els.enhAfter.innerHTML = '<div class="enh-empty">已达强化上限</div>';
      } else {
        const afterMap = enhanceStatMap(item, enhance + 1, !!bless);
        const statsHtml = afterMap.size ? compareStatsHtml(afterMap, beforeMap) : "";
        const html = statsHtml + afterTrigHtml;
        els.enhAfter.innerHTML = html || '<div class="enh-empty">无属性</div>';
      }
    }

    // 卷轴格子
    if (els.enhScrolls) {
      els.enhScrolls.innerHTML = "";
      for (const sid of enhanceScrollList(item)) {
        const s = ITEMS[sid];
        if (!s) continue;
        const cnt = countItem(sid);
        const isBless = sid === BLESS_SCROLL;
        const blessBlocked = isBless && !!bless;   // 已祝福：不能再用祝福卷轴
        const disabled = cnt <= 0;
        const cell = document.createElement("div");
        cell.className = "enh-scroll" + (enhanceScroll === sid ? " selected" : "") + (disabled || blessBlocked ? " empty" : "");
        cell.innerHTML = `<img src="${iconSrc(s)}" alt="">` + (cnt > 0 ? `<span class="cnt">${cnt}</span>` : "");
        cell.title = s.name + (blessBlocked ? "（装备已祝福，不能再用）" : "");
        cell.addEventListener("click", () => {
          if (blessBlocked) {
            showToast("装备已祝福");
            return;
          }
          if (disabled) return;
          enhanceScroll = sid;
          renderEnhance();
        });
        els.enhScrolls.appendChild(cell);
      }
    }

    // 强化按钮
    if (els.enhDo) {
      const canDo = (enhanceScroll === BLESS_SCROLL || !maxed) && !!enhanceScroll && countItem(enhanceScroll) > 0;
      if (!enhanceScroll) {
        els.enhDo.textContent = maxed ? "已达强化上限" : "请选择卷轴";
      } else {
        const rate = enhanceRate(id, enhance, enhanceScroll);
        const verb = enhanceScroll === BLESS_SCROLL ? "祝福" : "强化";
        els.enhDo.textContent = `${Math.round(rate)}% ${verb}`;
      }
      els.enhDo.disabled = !canDo;
    }
  }

  // 背包里移除 1 个实例键
  function takeBagKey(key) {
    const n = state.bag.get(key) || 0;
    if (n <= 0) return false;
    if (n === 1) state.bag.delete(key);
    else state.bag.set(key, n - 1);
    return true;
  }

  function addBagKey(key, n = 1) {
    state.bag.set(key, (state.bag.get(key) || 0) + n);
  }

  // 从背包扣 1 张卷轴（不足时看收获区）
  function takeScroll(scrollId) {
    for (const [k, n] of state.bag) {
      if (parseKey(k).id === String(scrollId) && n > 0) {
        if (n === 1) state.bag.delete(k);
        else state.bag.set(k, n - 1);
        return true;
      }
    }
    for (const [k, n] of state.harvest) {
      if (parseKey(k).id === String(scrollId) && n > 0) {
        if (n === 1) state.harvest.delete(k);
        else state.harvest.set(k, n - 1);
        return true;
      }
    }
    return false;
  }

  async function doEnhance() {
    const key = enhanceKey;
    if (!key || !enhanceScroll) return;
    const { id, enhance, bless } = parseKey(key);
    const item = ITEMS[id];
    if (!item || enhance >= ENHANCE_MAX) return;
    if (countItem(enhanceScroll) <= 0) {
      showToast("没有可用的卷轴");
      return;
    }
    const scroll = enhanceScroll;
    const isBless = scroll === BLESS_SCROLL;
    const isArtisan = ARTISAN_SCROLLS.has(scroll);
    const rate = enhanceRate(id, enhance, scroll);

    // 二次确认（祝福卷轴没有弹窗；100% 成功率的安定强化也不会失败，不用确认）
    if (!isBless && rate < 100) {
      const msg = isArtisan
        ? `强化成功率为${Math.round(rate)}%，强化失败装备不会消失，是否继续？`
        : `强化成功率为${Math.round(rate)}%，<span class="confirm-danger">强化失败装备将会消失</span>，是否继续？`;
      const yes = await gameConfirm(msg);
      if (!yes) return;
    }

    if (!takeScroll(scroll)) {
      showToast("没有可用的卷轴");
      return;
    }

    const success = Math.random() * 100 < rate;
    const onEquip = enhanceSource === "equip";
    const slotOfItem = item.slot;
    if (success) {
      // 祝福卷轴：加祝福；普通：+1 强化等级
      const newKey = isBless ? itemKey(id, enhance, 1) : itemKey(id, enhance + 1, bless);
      if (onEquip && slotOfItem && equipment[slotOfItem] === key) {
        equipment[slotOfItem] = newKey;   // 装备栏直接换实例键
      } else {
        takeBagKey(key);
        addBagKey(newKey, 1);
      }
      state.lastEnhanceKey = newKey;
      enhanceKey = newKey;
      enhanceSource = onEquip ? "equip" : "bag";
      showToast(isBless ? `祝福成功！${qName(itemLabel(newKey), item.quality)}` : `强化成功！${qName(itemLabel(newKey), item.quality)}`);
    } else if (!isBless && !isArtisan) {
      // 普通卷轴失败：装备消失（装备栏里的直接消失）
      if (onEquip && slotOfItem && equipment[slotOfItem] === key) {
        delete equipment[slotOfItem];
      } else {
        takeBagKey(key);
      }
      enhanceKey = null;
      showToast("强化失败，装备消失了");
    } else {
      showToast(isBless ? "祝福失败，装备没有变化" : "强化失败，装备没有消失");
    }

    recalcStats();
    renderBag();
    renderBagPanel();
    renderEquipView();
    renderPlayer();
    if (enhanceKey) renderEnhance();
    else closeEnhance();
  }

  // 通用：按住拖动滚动（全局隐藏了滚动条，用拖动 / 滚轮 / 触摸代替）
  function enableDragScroll(el) {
    if (!el || !el.addEventListener) return;
    let drag = null;
    el.addEventListener("mousedown", ev => {
      if (ev.button !== 0) return;
      drag = { y: ev.clientY, top: el.scrollTop || 0, moved: false };
    });
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("mousemove", ev => {
        if (!drag) return;
        const dy = ev.clientY - drag.y;
        if (!drag.moved && Math.abs(dy) > 4) drag.moved = true;
        if (drag.moved) {
          el.scrollTop = drag.top - dy;
          ev.preventDefault();
        }
      });
      window.addEventListener("mouseup", () => {
        if (drag && drag.moved) {
          el.dataset.dragged = "1";
          setTimeout(() => { delete el.dataset.dragged; }, 0);
        }
        drag = null;
      });
    }
    // 拖动结束的那一次 click 不当作点击
    el.addEventListener("click", ev => {
      if (el.dataset.dragged) {
        ev.stopPropagation();
        ev.preventDefault();
      }
    }, true);
  }

  // 游戏内确认框（替代容易被拦截的 window.confirm）
  let confirmResolve = null;
  function gameConfirm(msg) {
    return new Promise(resolve => {
      if (!els.confirmModal || !els.confirmText) {
        resolve(true);
        return;
      }
      confirmResolve = resolve;
      // 只接受内部生成的文案（强化确认里有 .confirm-danger 高亮标记）
      els.confirmText.innerHTML = msg;
      els.confirmModal.classList.remove("is-hidden");
    });
  }
  function closeConfirm(result) {
    if (els.confirmModal) els.confirmModal.classList.add("is-hidden");
    if (confirmResolve) {
      const fn = confirmResolve;
      confirmResolve = null;
      fn(result);
    }
  }
  if (els.confirmOk) els.confirmOk.addEventListener("click", () => closeConfirm(true));
  if (els.confirmCancel) els.confirmCancel.addEventListener("click", () => closeConfirm(false));
  if (els.confirmModal) {
    els.confirmModal.addEventListener("click", ev => {
      if (ev.target === els.confirmModal) closeConfirm(false);
    });
  }

  // 强化界面的事件绑定
  if (els.enhDo) els.enhDo.addEventListener("click", doEnhance);
  if (els.enhanceClose) els.enhanceClose.addEventListener("click", closeEnhance);
  if (els.enhanceModal) {
    els.enhanceModal.addEventListener("click", ev => {
      if (ev.target === els.enhanceModal) closeEnhance();
    });
  }

  /* ---------------- 道具详情 ---------------- */
  const TYPE_NAME = { 1: "材料", 2: "可使用", 3: "装备", 4: "消耗品", 5: "其他" };

  // 技能表里登记过的技能书道具（book / books 字段）→ 类型标签显示「技能书」
  const SKILL_BOOK_IDS = new Set();
  for (const s of DATA.skills || []) {
    if (s.book != null) SKILL_BOOK_IDS.add(String(s.book));
    for (const b of s.books || []) SKILL_BOOK_IDS.add(String(b));
  }

  // 道具详情的类型标签（技能书单独显示）
  function itemTypeLabel(item) {
    if (item.type === 3) return item.slot ? `装备 · ${slotName(item.slot)}` : "装备";
    if (SKILL_BOOK_IDS.has(String(item.id))) return "技能书";
    if (item.type === 4) return "消耗品";
    if (item.type === 2 && /技能书|魔法书/.test(item.name || "")) return "技能书";
    return TYPE_NAME[item.type] || "材料";
  }

  /* ---------------- 背包面板 ---------------- */
  let bagTab = "equip";
  let bagSorted = false;
  let lastEquippedId = null;   // 最近穿戴的装备：在「已装备」组里排第一
  let bagEquipOpen = false;    // 「已装备」组默认折叠

  // 分类：装备（type 3）/ 消耗品（type 4）/ 其他（type 2 可使用 + type 5 强化卷轴）/ 材料（type 1）
  // 召唤 BOSS 相关的 type 2 道具（召唤符/支配符/次元钥匙/藏宝图/BOSS 兑换物）归入「消耗品」
  const SUMMON_KINDS = new Set(["summonBoss", "dominateBoss", "keyBoss", "treasureMap"]);
  const BOSS_EXCHANGE = new Set(["2651", "2652", "2653", "2654", "2655", "2656", "2657", "2658", "2659", "2660", "2661", "2662"]);
  function itemKind(item) {
    if (item.type === 3) return "equip";
    if (item.type === 4) return "consumable";
    if (item.type === 2) {
      const k = item.use && item.use.kind;
      if (SUMMON_KINDS.has(k) || k === "permanent" || BOSS_EXCHANGE.has(String(item.id))) return "consumable";
    }
    if (item.type === 2 || item.type === 5) return "other";
    return "material";
  }

  function renderBagPanel() {
    const makeCell = (key, count, markE) => {
      const item = keyItem(key);
      const cell = document.createElement("div");
      cell.className = "bag-cell q" + item.quality + (parseKey(key).bless ? " blessed" : "");
      if (parseKey(key).bless) cell.style.setProperty("--sweep-phase", `-${Date.now() % 4900}ms`);
      const suffix = keySuffix(key);
      // 已装备 / 勾选了自动使用的消耗品，都打上 E 标志
      const showE = markE || (item.type === 4 && state.autoUse.has(String(item.id)));
      cell.innerHTML =
        (showE ? '<span class="bag-e">E</span>' : "") +
        `<img src="${iconSrc(item)}" alt="">` +
        (suffix ? `<span class="enh">${enhLabelHtml(key)}</span>` : "") +
        (count > 1 ? `<span class="bag-count">${count}</span>` : "");
      cell.title = itemLabel(key) + (item.type === 4 && state.autoUse.has(String(item.id)) ? "（自动使用中）" : "");
      // 支配符冷却：黑色扇形遮罩（360° → 0°），冷却中点击提示剩余时间
      const cdUntil = item.use && item.use.kind === "dominateBoss"
        ? (state.dominateCooldowns.get(String(item.id)) || 0) : 0;
      if (cdUntil > Date.now()) {
        const mask = document.createElement("div");
        mask.className = "cd-mask";
        mask.dataset.until = String(cdUntil);
        cell.appendChild(mask);
      }
      cell.addEventListener("click", () => {
        const until = item.use && item.use.kind === "dominateBoss"
          ? (state.dominateCooldowns.get(String(item.id)) || 0) : 0;
        if (until > Date.now()) { showToast(`冷却中，剩余${fmtCd(until - Date.now())}`); return; }
        showItemDetail(key, true, !!markE, "bag");
      });
      return cell;
    };

    const appendSection = (title, cells) => {
      if (!cells.length) return;
      const sec = document.createElement("div");
      sec.className = "bag-section";
      if (title) {
        const t = document.createElement("div");
        t.className = "bag-section-title";
        t.textContent = title;
        sec.appendChild(t);
      }
      const box = document.createElement("div");
      box.className = "bag-cells";
      for (const c of cells) box.appendChild(c);
      sec.appendChild(box);
      els.bagGrid.appendChild(sec);
    };

    const sortByQuality = arr => arr.sort((a, b) => {
      const ia = keyItem(a.key);
      const ib = keyItem(b.key);
      return (ib.quality || 0) - (ia.quality || 0) ||
        (ib.value || 0) - (ia.value || 0) ||
        String(ia.id).localeCompare(String(ib.id)) ||
        parseKey(a.key).enhance - parseKey(b.key).enhance;
    });

    els.bagGrid.innerHTML = "";

    if (bagTab === "equip") {
      // 已装备：默认按部位顺序；刚穿上的那件排到第一位
      const eqKeys = [];
      for (const slot of EQUIP_SLOTS) {
        const key = equipment[slot.key];
        if (key && keyItem(key)) eqKeys.push(key);
      }
      const recent = eqKeys.indexOf(lastEquippedId);
      if (recent > 0) {
        eqKeys.splice(recent, 1);
        eqKeys.unshift(lastEquippedId);
      }
      // 已装备组：可折叠，打开面板时默认收起
      const eqSec = document.createElement("div");
      eqSec.className = "bag-section";
      const eqTitle = document.createElement("div");
      eqTitle.className = "bag-section-title bag-toggle";
      eqTitle.textContent = `${bagEquipOpen ? "▾" : "▸"} 已装备（${eqKeys.length}）`;
      eqTitle.addEventListener("click", () => {
        bagEquipOpen = !bagEquipOpen;
        renderBagPanel();
      });
      eqSec.appendChild(eqTitle);
      if (bagEquipOpen && eqKeys.length) {
        const box = document.createElement("div");
        box.className = "bag-cells";
        for (const key of eqKeys) box.appendChild(makeCell(key, 1, true));
        eqSec.appendChild(box);
      }
      els.bagGrid.appendChild(eqSec);

      // 背包里的装备：只列未穿在身上的
      let bagArr = [];
      for (const [key, count] of state.bag) {
        const it = keyItem(key);
        if (it && it.type === 3) bagArr.push({ key, count });
      }
      if (bagSorted) sortByQuality(bagArr);
      appendSection("背包", bagArr.map(x => makeCell(x.key, x.count, false)));
      // 空分类不渲染占位文字：面板尺寸固定，空着即可
    } else {
      let arr = [];
      for (const [key, count] of state.bag) {
        const it = keyItem(key);
        if (it && itemKind(it) === bagTab) arr.push({ key, count });
      }
      if (bagSorted) sortByQuality(arr);
      appendSection(null, arr.map(x => makeCell(x.key, x.count, false)));
    }

    els.bagTabs.querySelectorAll(".bag-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === bagTab);
    });
    els.bagPanelGold.textContent = fmt(state.player.gold);
  }

  function openBagPanel() {
    bagTab = "equip";
    bagSorted = false;
    bagEquipOpen = false;   // 每次打开都默认折叠「已装备」
    renderBagPanel();
    els.bagPanel.classList.remove("is-hidden");
    applyBagPos();          // 打开后套用上次拖动的位置（此时才有真实尺寸）
  }

  function closeBagPanel() {
    els.bagPanel.classList.add("is-hidden");
  }

  // 点「背包」按钮：没打开就打开，已打开就收起
  function toggleBagPanel() {
    if (els.bagPanel.classList.contains("is-hidden")) openBagPanel();
    else closeBagPanel();
  }

  /* ---------------- 商店 ---------------- */
  const SHOP_TABS = [
    { key: "grocery", name: "杂货店", slogan: "欢迎，这里出售各种常见的冒险物资" },
    { key: "blacksmith", name: "铁匠铺", slogan: "都是每天新鲜出炉！记得来看看！" },
    { key: "blackmarket", name: "黑市", slogan: "只要有钱...没有买不到的东西" },
    { key: "alchemy", name: "炼金工房", slogan: "想试试自己的运气吗？" },
  ];
  const SHOP_REFRESH_MS = 24 * 3600 * 1000;
  // 铁匠铺按品质的定价区间
  const BLACKSMITH_PRICE = {
    2: [2000, 4000],
    3: [30000, 100000],
    4: [800000, 2000000],
    5: [50000000, 100000000],
  };
  let shopTab = "grocery";

  // 有商店售价的道具（item.shop > 0）
  const shopGoods = () => Object.values(ITEMS).filter(it => Number(it.shop) > 0);

  const shopClock = totalSec => {
    const s = Math.max(0, Math.floor(totalSec));
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
      .map(n => String(n).padStart(2, "0")).join(":");
  };

  // 铁匠铺库存：从装备表随机抽 20 件（绿 12 / 蓝 6 / 红 2；30% 变成 1 红 1 紫）
  function rollBlacksmithStock(now = Date.now()) {
    const pool = {};
    for (const it of Object.values(ITEMS)) {
      if (it.type !== 3) continue;
      if (it.slot === "transform" || it.slot === "doll") continue;   // 卡片不进铁匠铺
      (pool[it.quality] || (pool[it.quality] = [])).push(it);
    }
    const counts = { 2: 12, 3: 6, 4: 2 };
    if (Math.random() < 0.3) { counts[4] = 1; counts[5] = 1; }
    const items = [];
    for (const q of [2, 3, 4, 5]) {
      const need = counts[q] || 0;
      const list = (pool[q] || []).slice();
      for (let i = 0; i < need && list.length; i++) {
        const idx = Math.floor(Math.random() * list.length);
        const it = list.splice(idx, 1)[0];
        const [lo, hi] = BLACKSMITH_PRICE[q];
        items.push({ id: it.id, price: lo + Math.floor(Math.random() * (hi - lo + 1)), quality: q });
      }
    }
    return { next: now + SHOP_REFRESH_MS, items };
  }

  // 取当前库存；过期（或没有）就重新生成并写档。key: "blacksmith" / "blackmarket"
  function ensureShopStock(key, rollFn) {
    const now = Date.now();
    state.shopStock = state.shopStock || {};
    const s = state.shopStock[key];
    if (s && Array.isArray(s.items) && s.items.length && Number(s.next) > now) return s;
    state.shopStock[key] = rollFn(now);
    saveState();
    return state.shopStock[key];
  }
  const ensureBlacksmithStock = () => ensureShopStock("blacksmith", rollBlacksmithStock);
  const ensureBlackMarketStock = () => ensureShopStock("blackmarket", rollBlackMarketStock);

  const shuffleArr = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

  // 黑市：20 格，先放固定部分，再用宝箱 / 时间石 / 金属板 / 龙鳞填满
  const BLACKMARKET_PLATE_IDS = ["1470", "1568", "1522"];      // 白金 / 黄金 / 奥里哈鲁根
  const BLACKMARKET_DRAGON_IDS = ["1499", "1539", "1552", "1566"]; // 水 / 地 / 风 / 火 龙鳞
  const BLACKMARKET_BLACK_PLATE = "1488";                       // 黑色米索莉，固定 1 个
  const BLACKMARKET_SMITH_SCROLLS = ["2518", "2520"];           // 两种工匠卷轴，各 1

  function blackMarketPools() {
    const gear = { 4: [], 5: [] }, card = { 4: [], 5: [] }, book = { 4: [], 5: [] };
    const boxes = [], gems = [], plates = [], dragons = [];
    for (const it of Object.values(ITEMS)) {
      if (it.type === 3) {
        const isCard = it.slot === "transform" || it.slot === "doll";
        if (it.quality === 4 || it.quality === 5) (isCard ? card : gear)[it.quality].push(it);
        continue;
      }
      if (it.skill) {
        if (it.quality === 4 || it.quality === 5) book[it.quality].push(it);
        continue;
      }
      if (it.type === 2 && it.use) {
        // 黑市不卖神话品质（q6）的东西
        if (it.quality >= 6) continue;
        if (it.use.kind === "timeGem") gems.push(it);
        else if (CRAFT_BOX_KINDS.has(it.use.kind)) boxes.push(it);
        continue;
      }
      if (it.type === 1) {
        if (BLACKMARKET_PLATE_IDS.includes(String(it.id))) plates.push(it);
        if (BLACKMARKET_DRAGON_IDS.includes(String(it.id))) dragons.push(it);
      }
    }
    return { gear, card, book, boxes, gems, plates, dragons };
  }

  function rollBlackMarketStock(now = Date.now()) {
    const P = blackMarketPools();
    const items = [];
    // 黑市定价：
    //   变身 / 娃娃卡箱：普通 × 10、幸运 × 2
    //   其他箱子（宝箱）：普通 × 2、幸运 × 1
    //   其余道具：普通 × 20、幸运 × 5
    const isBoxItem = it => it && it.type === 2 && it.use && CRAFT_BOX_KINDS.has(it.use.kind);
    const isCardBoxItem = it => {
      if (!it || it.type !== 2 || !it.use) return false;
      if (it.use.kind === "cardBox") return true;
      if (it.use.kind === "bundle") {
        return (it.use.items || []).some(x => {
          const sub = ITEMS[String(x.id)];
          return sub && (sub.slot === "transform" || sub.slot === "doll");
        });
      }
      return false;
    };
    // 工匠卷轴（2518 / 2520）也按箱子的 5/1 比例
    const isSmithScrollItem = it => it && (String(it.id) === "2518" || String(it.id) === "2520");
    // 补充组：万能药 / 纯白万能药 / 三种制作秘笈 / 祝福赋予卷轴 —— 10 / 1
    const BLACKMARKET_10_1 = new Set(["2722", "1554", "2595", "1373", "1348", "2600"]);
    const priceMult = (it, lucky) => {
      // 变身/娃娃卡箱、技能书箱：普通 × 10、幸运 × 2
      if (isCardBoxItem(it) || (it && it.type === 2 && it.use && it.use.kind === "skillBookBox")) {
        return lucky ? 2 : 10;
      }
      if (isBoxItem(it)) return lucky ? 1 : 5;
      if (isSmithScrollItem(it)) return lucky ? 1 : 5;
      if (it && BLACKMARKET_10_1.has(String(it.id))) return lucky ? 1 : 10;
      return lucky ? 5 : 20;
    };
    const add = (it, count) => {
      if (!it) return;
      if (it.quality >= 6) return;   // 黑市不出现神话品质
      // 非普通品质的道具库存只能是 1，只有普通品质才可能刷多个
      const qty = it.quality === 1 ? count : 1;
      const base = Math.max(1, Math.round(Number(it.value) || 0));
      items.push({
        id: String(it.id),
        count: qty,
        sold: 0,
        price: base * priceMult(it, false),
        quality: it.quality,
        lucky: false,
      });
    };

    // 红装（非卡片）固定 2 件
    for (const it of shuffleArr(P.gear[4]).slice(0, 2)) add(it, 1);
    // 紫装（非卡片）50% 刷 1 件
    if (Math.random() < 0.5) add(P.gear[5][Math.floor(Math.random() * P.gear[5].length)], 1);
    // 卡片：70% 红 / 30% 紫，1 件
    const cardPool = Math.random() < 0.7 ? P.card[4] : P.card[5];
    add(cardPool[Math.floor(Math.random() * cardPool.length)], 1);
    // 红色技能书 3 件（不重复）
    for (const it of shuffleArr(P.book[4]).slice(0, 3)) add(it, 1);
    // 紫色技能书 1 件
    add(P.book[5][Math.floor(Math.random() * P.book[5].length)], 1);

    // 填充池：宝箱 1~3 个 / 时间石 3~5 个 / 金属板 3~5 个 / 龙鳞 1~3 个 / 黑色米索莉 1 个 / 工匠卷轴各 1 个
    const filler = [];
    for (const it of P.boxes) filler.push({ it, lo: 1, hi: 3 });
    for (const it of P.gems) filler.push({ it, lo: 3, hi: 5 });
    for (const it of P.plates) filler.push({ it, lo: 3, hi: 5 });
    for (const it of P.dragons) filler.push({ it, lo: 1, hi: 3 });
    if (ITEMS[BLACKMARKET_BLACK_PLATE]) filler.push({ it: ITEMS[BLACKMARKET_BLACK_PLATE], lo: 1, hi: 1 });
    for (const id of BLACKMARKET_SMITH_SCROLLS) {
      if (ITEMS[id]) filler.push({ it: ITEMS[id], lo: 1, hi: 1 });
    }
    // 补充组（黑市定价 10 / 1）：万能药、纯白的万能药 1~3 个；三种制作秘笈各 1 个；祝福赋予卷轴 2~5 个
    for (const id of ["2722", "1554"]) if (ITEMS[id]) filler.push({ it: ITEMS[id], lo: 1, hi: 3 });
    for (const id of ["2595", "1373", "1348"]) if (ITEMS[id]) filler.push({ it: ITEMS[id], lo: 1, hi: 1 });
    if (ITEMS["2600"]) filler.push({ it: ITEMS["2600"], lo: 2, hi: 5 });

    const need = Math.max(0, 20 - items.length);
    for (const f of shuffleArr(filler).slice(0, need)) add(f.it, randInt(f.lo, f.hi));

    // 每天随机一个商品是幸运商品（普通道具 × 5、箱子 × 1）
    if (items.length) {
      const idx = Math.floor(Math.random() * items.length);
      const g = items[idx];
      g.lucky = true;
      g.price = Math.max(1, Math.round(Number(ITEMS[g.id].value) || 0)) * priceMult(ITEMS[g.id], true);
    }

    return { next: now + SHOP_REFRESH_MS, items };
  }

  function openShopPanel() {
    shopTab = "grocery";
    renderShopTabs();
    renderShopGoods();
    if (els.shopPanel) els.shopPanel.classList.remove("is-hidden");
  }

  function closeShopPanel() {
    if (els.shopPanel) els.shopPanel.classList.add("is-hidden");
    // 关闭界面后清掉炼金产物展示
    alchemyResultId = null;
    alchemySlots = [null, null, null];
  }

  function renderShopTabs() {
    if (els.shopTabs) {
      els.shopTabs.querySelectorAll(".shop-tab").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.shop === shopTab);
      });
    }
    // 顶部宣传板：每个商店一句风味文本
    const tab = SHOP_TABS.find(t => t.key === shopTab);
    if (els.shopBannerText) els.shopBannerText.textContent = tab ? tab.slogan : "";
    if (els.shopRefresh) {
      els.shopRefresh.classList.toggle("is-hidden", shopTab !== "blacksmith" && shopTab !== "blackmarket");
    }
    updateShopTimer();
  }

  // 铁匠铺 / 黑市的刷新倒计时（每秒刷新）
  function updateShopTimer() {
    if (!els.shopRefresh) return;
    if (shopTab !== "blacksmith" && shopTab !== "blackmarket") return;
    if (els.shopPanel && els.shopPanel.classList.contains("is-hidden")) return;
    const stock = shopTab === "blacksmith" ? ensureBlacksmithStock() : ensureBlackMarketStock();
    els.shopRefresh.textContent = `刷新倒计时 ${shopClock((Number(stock.next) - Date.now()) / 1000)}`;
  }

  function shopCell(it, price, opts = {}) {
    const { sold = false, onBuy = null } = opts;
    const cell = document.createElement("div");
    cell.className = "shop-item" + (sold ? " is-sold" : (state.player.gold >= price ? "" : " is-lack"));

    // 图标：点它查看只读详情（阻止冒泡，不触发购买）
    const iconWrap = document.createElement("div");
    iconWrap.className = "shop-item-icon";
    const img = document.createElement("img");
    img.src = iconSrc(it);
    img.alt = "";
    iconWrap.appendChild(img);
    iconWrap.addEventListener("click", (ev) => {
      ev.stopPropagation();
      showItemDetail(itemKey(it.id), false, false, "view");
    });
    cell.appendChild(iconWrap);

    const nameEl = document.createElement("div");
    nameEl.className = "shop-item-name q" + it.quality;
    nameEl.textContent = it.name;
    cell.appendChild(nameEl);

    const typeEl = document.createElement("span");
    typeEl.className = "shop-item-type";
    typeEl.textContent = TYPE_NAME[it.type] || "道具";
    cell.appendChild(typeEl);

    const priceEl = document.createElement("div");
    priceEl.className = "shop-item-price";
    priceEl.innerHTML = `<img class="coin-ico" src="icons/coin.png" alt=""><b>${fmt(price)}</b>`;
    cell.appendChild(priceEl);

    if (sold) {
      const tag = document.createElement("span");
      tag.className = "shop-item-sold";
      tag.textContent = "已售出";
      cell.appendChild(tag);
    } else {
      // 卡片其他区域：购买
      cell.addEventListener("click", () => (onBuy ? onBuy() : openShopBuy(it, price)));
    }
    return cell;
  }

  function renderShopGoods() {
    if (!els.shopGrid) return;
    els.shopGrid.innerHTML = "";
    if (els.shopGold) els.shopGold.textContent = fmt(state.player.gold);
    const isAlchemy = shopTab === "alchemy";
    if (els.alchemyPanel) els.alchemyPanel.classList.toggle("is-hidden", !isAlchemy);
    // 炼金工房用不到金币，隐藏底部金币栏
    const shopFoot = els.shopPanel ? els.shopPanel.querySelector(".shop-foot") : null;
    if (shopFoot) shopFoot.classList.toggle("is-hidden", isAlchemy);
    const open = shopTab === "grocery" || shopTab === "blacksmith" || shopTab === "blackmarket";
    els.shopGrid.classList.toggle("is-hidden", !open);
    if (els.shopEmpty) els.shopEmpty.classList.toggle("is-hidden", open || isAlchemy);
    if (isAlchemy) { renderAlchemyPanel(); return; }
    if (!open) return;
    if (shopTab === "grocery") {
      const goods = shopGoods().sort((a, b) => (Number(a.shop) - Number(b.shop)) || (a.quality - b.quality));
      for (const it of goods) els.shopGrid.appendChild(shopCell(it, Number(it.shop) || 0));
    } else if (shopTab === "blacksmith") {
      const stock = ensureBlacksmithStock();
      // 高品质在前；同品质按价格从低到高
      const list = stock.items.slice().sort((a, b) => (b.quality - a.quality) || (a.price - b.price));
      for (const g of list) {
        const it = ITEMS[g.id];
        if (!it) continue;
        els.shopGrid.appendChild(shopCell(it, g.price, {
          sold: !!g.sold,
          // 铁匠铺每件只卖一次：先弹确认窗，确定后才成交并标记已售出
          onBuy: () => openBlacksmithBuy(it, g),
        }));
      }
    } else {
      const stock = ensureBlackMarketStock();
      // 幸运商品置顶，其余按品质高→低、价格低→高；神话（q6）一律不展示（含旧存档残留）
      const list = stock.items
        .filter(g => {
          const it = ITEMS[g.id];
          return it && it.quality < 6;
        })
        .sort((a, b) =>
          (b.lucky ? 1 : 0) - (a.lucky ? 1 : 0) || (b.quality - a.quality) || (a.price - b.price));
      for (const g of list) {
        const it = ITEMS[g.id];
        if (!it) continue;
        els.shopGrid.appendChild(marketCell(it, g));
      }
    }
  }

  // 黑市格子：显示数量 / 剩余 / 幸运标记，单价为每个的价格
  function marketCell(it, g) {
    const left = Math.max(0, g.count - (g.sold || 0));
    const soldOut = left <= 0;
    const cell = document.createElement("div");
    cell.className = "shop-item market-item"
      + (soldOut ? " is-sold" : (state.player.gold >= g.price ? "" : " is-lack"))
      + (g.lucky ? " is-lucky" : "");

    const iconWrap = document.createElement("div");
    iconWrap.className = "shop-item-icon";
    const img = document.createElement("img");
    img.src = iconSrc(it);
    img.alt = "";
    iconWrap.appendChild(img);
    iconWrap.addEventListener("click", (ev) => {
      ev.stopPropagation();
      showItemDetail(itemKey(it.id), false, false, "view");
    });
    cell.appendChild(iconWrap);

    if (g.lucky) {
      const tag = document.createElement("span");
      tag.className = "market-lucky";
      tag.textContent = "幸运";
      cell.appendChild(tag);
    }

    const nameEl = document.createElement("div");
    nameEl.className = "shop-item-name q" + it.quality;
    nameEl.textContent = it.name;
    cell.appendChild(nameEl);

    const typeEl = document.createElement("span");
    typeEl.className = "shop-item-type";
    typeEl.textContent = TYPE_NAME[it.type] || "道具";
    cell.appendChild(typeEl);

    const countEl = document.createElement("div");
    countEl.className = "market-count" + (soldOut ? " lack" : "");
    countEl.textContent = soldOut ? "已售完" : (left < g.count ? `库存 ${left}/${g.count}` : `库存：${g.count}`);
    cell.appendChild(countEl);

    const priceEl = document.createElement("div");
    priceEl.className = "shop-item-price";
    priceEl.innerHTML = `<img class="coin-ico" src="icons/coin.png" alt=""><b>${fmt(g.price)}</b>`;
    cell.appendChild(priceEl);

    if (!soldOut) cell.addEventListener("click", () => openBlackMarketBuy(it, g));
    return cell;
  }

  // 黑市购买：单价 × 数量，库存有限（可分批买，卖完为止）
  function openBlackMarketBuy(it, g) {
    const left = Math.max(0, g.count - (g.sold || 0));
    if (left <= 0) return;
    const price = Number(g.price) || 0;
    if (price <= 0) return;
    const affordable = Math.floor(state.player.gold / price);
    const maxCount = Math.min(left, affordable);
    if (maxCount <= 0) { showToast("金币不足"); return; }
    openQtyDialog({
      title: "购买数量",
      hint: `单价 ${fmt(price)} 金币 · 剩余 ${left} 个${g.lucky ? " · 幸运商品" : ""}`,
      maxCount,
      onConfirm: (count) => {
        const buy = Math.max(1, Math.min(left, toInt(count, 1), Math.floor(state.player.gold / price)));
        if (buy <= 0 || state.player.gold < price * buy) { showToast("金币不足"); return; }
        state.player.gold -= price * buy;
        grantItem(it.id, buy);
        g.sold = (g.sold || 0) + buy;
        saveState();
        renderShopGoods();
        renderBag();
        renderPlayer();
        showToast(`购买成功：${qName(it.name, it.quality)} ×${buy}，花费 ${fmt(price * buy)} 金币`);
      },
    });
  }

  // 铁匠铺：每次只卖 1 件，但仍走「数量弹窗 → 确定」的二次确认
  function openBlacksmithBuy(it, g) {
    if (g.sold) return;
    const price = Number(g.price) || 0;
    if (price <= 0) return;
    if (state.player.gold < price) { showToast("金币不足"); return; }
    openQtyDialog({
      title: "购买确认",
      hint: `是否花费 ${fmt(price)} 金币购买${qName(it.name, it.quality)}？`,
      maxCount: 1,
      onConfirm: () => {
        if (g.sold) return;
        if (state.player.gold < price) { showToast("金币不足"); return; }
        state.player.gold -= price;
        grantItem(it.id, 1);
        g.sold = true;
        saveState();
        renderShopGoods();
        renderBag();
        renderPlayer();
        showToast(`购买成功：${qName(it.name, it.quality)}，花费 ${fmt(price)} 金币`);
      },
    });
  }

  // 购买：数量弹窗，单次最多 999，且不超过当前金币能买的量
  function openShopBuy(it, price) {
    price = Number(price) || 0;
    if (price <= 0) return;
    const affordable = Math.floor(state.player.gold / price);
    const maxCount = Math.min(999, affordable);
    if (maxCount <= 0) { showToast("金币不足"); return; }
    openQtyDialog({
      title: "购买数量",
      hint: `${it.name} · 单价 ${fmt(price)} 金币 · 最多 ${maxCount} 个`,
      maxCount,
      onConfirm: (count) => {
        const n = Math.max(1, Math.min(999, toInt(count, 1), Math.floor(state.player.gold / price)));
        if (n <= 0 || state.player.gold < price * n) { showToast("金币不足"); return; }
        state.player.gold -= price * n;
        grantItem(it.id, n);
        renderShopGoods();
        renderBag();
        renderPlayer();
        saveState();
        showToast(`购买成功：${qName(it.name, it.quality)} ×${n}，花费 ${fmt(price * n)} 金币`);
      },
    });
  }

  /* ---------------- 炼金工房 ---------------- */
  const ALCHEMY_STONE_BY_Q = { 3: "2792", 4: "2791", 5: "2790", 6: "2789" };
  let alchemySlots = [null, null, null];
  let alchemyKind = "equip";
  let alchemyResultId = null;
  let alchemyBusy = false;          // 炼金特效播放中
  let alchemyPopPending = false;    // 产物出现时播一次弹入动画
  let alchemyPreviewQ = 3;          // 掉落预览当前品质
  let alchemyPreviewOpen = false;   // 掉落预览是否展开

  const isBookItem = it => !!(it && it.skill);
  const alchemyPool = (q, isBook) => Object.values(ITEMS).filter(it =>
    isBook
      ? (isBookItem(it) && it.quality === q)
      : (it.type === 3 && !["transform", "doll"].includes(it.slot) && it.quality === q));

  // 背包里可炼金的道具（未装备；装备 q3~q5、技能书 q4~q5）
  function alchemyCandidates() {
    const out = [];
    for (const [key, cnt] of state.bag) {
      if (!(cnt > 0)) continue;
      if (Object.values(equipment).includes(key)) continue;   // 已装备不显示
      const { id } = parseKey(key);
      const it = ITEMS[id];
      if (!it) continue;
      const isBook = isBookItem(it);
      if (isBook) {
        if (it.quality < 4 || it.quality > 5) continue;
        if (alchemyKind !== "book") continue;
      } else {
        if (it.type !== 3 || ["transform", "doll"].includes(it.slot)) continue;
        if (it.quality < 3 || it.quality > 5) continue;
        if (alchemyKind !== "equip") continue;
      }
      out.push({ key, id, item: it, isBook, count: cnt });
    }
    out.sort((a, b) => b.item.quality - a.item.quality || String(a.item.name).localeCompare(String(b.item.name), "zh"));
    return out;
  }

  const alchemyUsedOf = key => alchemySlots.filter(s => s && s.key === key).length;
  const alchemyFirst = () => alchemySlots.find(Boolean) || null;

  function alchemyCanPlace(entry) {
    const first = alchemyFirst();
    if (first && (first.quality !== entry.item.quality || first.isBook !== entry.isBook)) return false;
    return alchemyUsedOf(entry.key) < entry.count;
  }

  function renderAlchemyPanel() {
    if (!els.alchemyPanel) return;
    els.alchemyPanel.querySelectorAll(".alchemy-slot").forEach(slotEl => {
      const idx = Number(slotEl.dataset.slot);
      slotEl.innerHTML = "";
      const s = alchemySlots[idx];
      slotEl.classList.toggle("filled", !!s);
      if (s && ITEMS[s.id]) {
        const img = document.createElement("img");
        img.src = iconSrc(ITEMS[s.id]);
        img.alt = "";
        slotEl.appendChild(img);
      }
    });
    if (els.alchemyResult) {
      els.alchemyResult.innerHTML = "";
      els.alchemyResult.classList.toggle("filled", !!alchemyResultId);
      if (alchemyResultId && ITEMS[alchemyResultId]) {
        const img = document.createElement("img");
        img.src = iconSrc(ITEMS[alchemyResultId]);
        img.alt = "";
        img.style.cursor = "pointer";
        img.title = "点击查看道具详情";
        img.addEventListener("click", ev => {
          ev.stopPropagation();
          showItemDetail(itemKey(alchemyResultId), false, false, "view");
        });
        els.alchemyResult.appendChild(img);
        if (alchemyPopPending) {
          alchemyPopPending = false;
          els.alchemyResult.classList.remove("pop");
          void els.alchemyResult.offsetWidth;
          els.alchemyResult.classList.add("pop");
        }
      }
    }
    if (els.alchemyKinds) {
      els.alchemyKinds.querySelectorAll(".alchemy-kind").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.kind === alchemyKind);
      });
    }
    if (els.alchemyStart) els.alchemyStart.disabled = alchemySlots.filter(Boolean).length < 3;
    if (els.alchemyGrid) {
      els.alchemyGrid.innerHTML = "";
      const list = alchemyCandidates();
      if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "alchemy-empty";
        empty.textContent = alchemyKind === "book" ? "背包里没有可炼金的技能书（红/紫）" : "背包里没有可炼金的装备（蓝/红/紫）";
        els.alchemyGrid.appendChild(empty);
        return;
      }
      for (const entry of list) {
        const cell = document.createElement("div");
        const can = alchemyCanPlace(entry);
        cell.className = "alchemy-item" + (can ? "" : " is-dim");
        const img = document.createElement("img");
        img.src = iconSrc(entry.item);
        img.alt = "";
        cell.appendChild(img);
        // 强化/祝福标记（+N / ★），与背包一致
        const kv = parseKey(entry.key);
        if (kv.enhance > 0 || kv.bless) {
          const tag = document.createElement("span");
          tag.className = "enh";
          tag.innerHTML = enhLabelHtml(entry.key);
          cell.appendChild(tag);
        }
        const cnt = document.createElement("span");
        cnt.className = "alchemy-cnt";
        cnt.textContent = "×" + entry.count;
        cell.appendChild(cnt);
        if (can) {
          cell.addEventListener("click", () => {
            const idx = alchemySlots.findIndex(s => !s);
            if (idx < 0) return;
            alchemySlots[idx] = { key: entry.key, id: entry.id, quality: entry.item.quality, isBook: entry.isBook };
            alchemyResultId = null;   // 重新放料即清掉上次的产物展示
            renderAlchemyPanel();
          });
        }
        els.alchemyGrid.appendChild(cell);
      }
    }
  }

  // 炼金开始：消耗 3 件，按概率产出
  // 掉落预览弹窗：按品质分页签，列出该品质炼金的全部可能结果
  function renderAlchemyPreview(open) {
    const modal = els.alchemyPreviewModal;
    if (!modal) return;
    alchemyPreviewOpen = open === undefined ? !alchemyPreviewOpen : !!open;
    modal.classList.toggle("is-hidden", !alchemyPreviewOpen);
    if (!alchemyPreviewOpen) return;
    if (els.alchemyPreviewTabs) {
      els.alchemyPreviewTabs.querySelectorAll(".alchemy-preview-tab").forEach(btn => {
        const q = Number(btn.dataset.q);
        btn.classList.toggle("active", q === alchemyPreviewQ);
        btn.classList.remove("q1", "q2", "q3", "q4", "q5", "q6");
        btn.classList.add("q" + q);
      });
    }
    if (!els.alchemyPreviewBody) return;
    els.alchemyPreviewBody.innerHTML = "";
    const q = alchemyPreviewQ;
    const stone = ITEMS[ALCHEMY_STONE_BY_Q[q]];
    const nextStone = ITEMS[ALCHEMY_STONE_BY_Q[q + 1]];
    const COLOR_TEXT = { 3: "蓝色", 4: "红色", 5: "紫色", 6: "神话" };
    const typeWord = qq => (qq <= 3 ? "装备" : "装备/技能书");
    const rows = [
      { pct: "65%", text: `获得 1 个 <span class="q${q}">${COLOR_TEXT[q] || ""}</span>${typeWord(q)}`, icon: null },
      { pct: "20%", text: stone ? `获得 ${qName(stone.name, stone.quality)} ×1` : "—", icon: stone },
      { pct: q >= 5 ? "15%" : "10%", text: nextStone ? `获得 ${qName(nextStone.name, nextStone.quality)} ×1` : "—", icon: nextStone },
    ];
    if (q < 5) {
      rows.push({
        pct: "5%",
        // 超大成功的类型跟随押注类型：蓝色只能押装备，所以给「红色装备」而不是「红色装备/技能书」
        text: `获得 1 个 <span class="q${q + 1}">${COLOR_TEXT[q + 1] || ""}</span>${typeWord(q)}`,
        icon: null,
      });
    }
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "alchemy-prev-row";
      const pctEl = document.createElement("b");
      pctEl.textContent = r.pct;
      row.appendChild(pctEl);
      if (r.icon) {
        const img = document.createElement("img");
        img.src = iconSrc(r.icon);
        img.alt = "";
        img.title = "点击查看";
        img.style.cursor = "pointer";
        img.addEventListener("click", ev => {
          ev.stopPropagation();
          showItemDetail(itemKey(r.icon.id), false, false, "view");
        });
        row.appendChild(img);
      }
      const textEl = document.createElement("span");
      textEl.className = "alchemy-prev-text";
      textEl.innerHTML = r.text;
      row.appendChild(textEl);
      els.alchemyPreviewBody.appendChild(row);
    }
  }

  // 炼金开始：先播「3 个材料旋转飞向中央」特效，特效结束后再结算并提示
  function doAlchemy() {
    const filled = alchemySlots.filter(Boolean);
    if (filled.length < 3 || alchemyBusy) return;
    const q = filled[0].quality;
    const isBook = filled[0].isBook;
    const roll = Math.random();
    let outcome;
    if (q >= 5) {
      // 传说不触发超大成功，5% 并入大成功
      outcome = roll < 0.65 ? "fail" : roll < 0.85 ? "success" : "great";
    } else {
      outcome = roll < 0.65 ? "fail" : roll < 0.85 ? "success" : roll < 0.95 ? "great" : "super";
    }
    let prod = null;
    if (outcome === "fail") {
      const pool = alchemyPool(q, isBook);
      prod = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    } else if (outcome === "success") {
      prod = ITEMS[ALCHEMY_STONE_BY_Q[q]] || null;
    } else if (outcome === "great") {
      prod = ITEMS[ALCHEMY_STONE_BY_Q[q + 1]] || null;
    } else {
      const pool = alchemyPool(q + 1, isBook);
      prod = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }
    if (!prod) prod = ITEMS[ALCHEMY_STONE_BY_Q[q]] || null;

    alchemyBusy = true;
    if (els.alchemyStart) els.alchemyStart.disabled = true;

    // 特效：三个槽位图标旋转着飞到中央产物格并淡出
    const resultEl = els.alchemyResult;
    let cx = 0, cy = 0;
    if (resultEl && resultEl.getBoundingClientRect) {
      const rr = resultEl.getBoundingClientRect();
      cx = rr.left + rr.width / 2;
      cy = rr.top + rr.height / 2;
    }
    const imgs = els.alchemyPanel
      ? Array.from(els.alchemyPanel.querySelectorAll(".alchemy-slot.filled img"))
      : [];
    let animated = 0;
    for (const img of imgs) {
      if (typeof img.animate !== "function" || !img.getBoundingClientRect) continue;
      const r = img.getBoundingClientRect();
      const dx = cx - (r.left + r.width / 2);
      const dy = cy - (r.top + r.height / 2);
      img.animate([
        { transform: "translate(0,0) rotate(0deg) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) rotate(540deg) scale(.15)`, opacity: 0 },
      ], { duration: 620, easing: "cubic-bezier(.4,.1,.6,.9)", fill: "forwards" });
      animated++;
    }

    const finish = () => {
      for (const s of filled) {
        const n = (state.bag.get(s.key) || 0) - 1;
        if (n > 0) state.bag.set(s.key, n); else state.bag.delete(s.key);
      }
      if (prod) grantItem(prod.id, 1);
      alchemyResultId = prod ? String(prod.id) : null;
      alchemySlots = [null, null, null];
      alchemyBusy = false;
      alchemyPopPending = true;
      saveState();
      renderBag();
      renderShopGoods();
      showToast(`炼金成功！获得 ${prod ? qName(prod.name, prod.quality) : "无产物"}`);
    };
    if (animated > 0) setTimeout(finish, 660); else finish();
  }

  /* ---------------- 制作系统（三栏 UI） ---------------- */
  const craftRecipes = () => (DATA.recipes || []);
  let craftRecipe = null;   // 当前选中的配方
  let craftTab = "equip";   // 一级页签
  let craftGroup = null;    // 二级分类
  let craftQty = 1;         // 制作数量
  let craftChoices = null;  // 选择组选中的选项索引（-1 = 未选）
  let craftChoiceOpen = null; // 选择组是否展开（true = 显示候选）

  const CRAFT_TABS = [
    { key: "equip", name: "装备" },
    { key: "box", name: "宝箱" },
    { key: "material", name: "材料" },
    { key: "other", name: "其他" },
  ];
  // type 2 里这些 use.kind 归到「宝箱」，技能书 / 时间宝石 / 万能药等归「其他」
  const CRAFT_BOX_KINDS = new Set(["box", "qualityEquip", "cardBox", "bundle", "choose", "skillBookBox"]);
  const CRAFT_SLOT_NAME = {
    weapon: "武器", body: "衣服", head: "头部", gloves: "手套", shoes: "鞋子",
    pants: "裤子", shoulder: "披风", offhand: "副手", belt: "腰带",
    earring: "耳环", necklace: "项链", ring: "戒指", transform: "变身", doll: "娃娃",
  };
  const CRAFT_USE_NAME = {
    box: "箱子", qualityEquip: "装备箱", cardBox: "卡片箱", bundle: "礼包",
    choose: "选择箱", teleport: "传送", permanent: "万能药", timeGem: "时间宝石",
    skillBookBox: "技能书箱", other: "其他",
  };

  // 炼金石（2789~2792）：以它们为材料的配方统一归到「其他 → 炼金石」
  const STONE_IDS = new Set(["2789", "2790", "2791", "2792"]);
  const isStoneRecipe = rec => !!(rec && (rec.groups || []).some(g => g.some(o => STONE_IDS.has(String(o.id)))));

  const craftTabOf = (item, rec) => {
    if (!item) return "other";
    if (isStoneRecipe(rec)) return "other";            // 炼金石兑换配方 → 其他（二级分类「炼金石」）
    if (item.type === 3) return "equip";
    if (item.type === 1) return "material";
    if (item.type === 2) {
      if (item.skill) return "other";                 // 技能书 → 其他
      const kind = item.use && item.use.kind;
      if (CRAFT_BOX_KINDS.has(kind)) return "box";    // 箱子类 → 宝箱
      return "other";                                 // 时间宝石 / 万能药 / 传送 → 其他
    }
    return "other";
  };

  const craftKeyOf = (item, rec) => {
    if (!item) return "all";
    if (craftTab === "equip") return item.slot || "other";
    if (craftTab === "box") return (item.use && item.use.kind) || "other";
    if (craftTab === "other") {
      if (isStoneRecipe(rec)) return "stone";
      if (item.skill) return "skillbook";
      if (item.use && item.use.kind === "timeGem") return "timegem";
      // 召唤 / 支配符咒单独一栏
      if (item.use && (item.use.kind === "summonBoss" || item.use.kind === "dominateBoss")) return "charm";
      if (item.type === 5) return "enhance";
      return "other";
    }
    return "all";
  };

  const CRAFT_OTHER_NAME = { stone: "炼金石", skillbook: "技能书", timegem: "时间宝石", charm: "傲慢与信念之塔", enhance: "强化道具", other: "其他" };
  const craftGroupName = (key) => {
    if (craftTab === "equip") return CRAFT_SLOT_NAME[key] || "其他";
    if (craftTab === "box") return CRAFT_USE_NAME[key] || "其他";
    if (craftTab === "other") return CRAFT_OTHER_NAME[key] || "其他";
    return "全部";
  };

  function craftVisibleRecipes() {
    const out = [];
    for (const rec of craftRecipes()) {
      const it = ITEMS[String(rec.id)];
      if (!it) continue;
      if (craftTabOf(it, rec) !== craftTab) continue;
      if (craftGroup && craftKeyOf(it, rec) !== craftGroup) continue;
      out.push({ rec, it });
    }
    return out;
  }

  // 当前最多能连续制作几次（材料 + 金币双重限制）
  // invCount：可选的「道具ID → 数量」预聚合表；传入时直接查表，不再逐个 countItem 扫描背包
  function craftMaxTimes(rec, invCount) {
    const have = invCount ? (id) => invCount.get(String(id)) || 0 : countItem;
    let times = Infinity;
    for (const group of rec.groups) {
      let best = 0;
      for (const o of group) best = Math.max(best, Math.floor(have(o.id) / o.count));
      times = Math.min(times, best);
    }
    const gold = rec.gold || 0;
    if (gold > 0) times = Math.min(times, Math.floor(state.player.gold / gold));
    if (!Number.isFinite(times)) return 0;
    return Math.max(0, times);
  }

  function craftCheck(rec, qty) {
    const picks = [];
    const missingGroups = [];
    const unselected = [];
    rec.groups.forEach((group, gi) => {
      let opt = null;
      if (group.length === 1) {
        opt = group[0];
      } else {
        const sel = craftChoices ? craftChoices[gi] : -1;
        if (sel == null || sel < 0) {
          unselected.push(gi);
          return;
        }
        opt = group[sel];
      }
      if (opt && countItem(opt.id) >= opt.count * qty) picks.push({ option: opt, gi });
      else missingGroups.push(group);
    });
    const gold = (rec.gold || 0) * qty;
    return { picks, missingGroups, unselected, gold, goldOk: state.player.gold >= gold };
  }

  function renderCraftTabs() {
    if (!els.craftTabs) return;
    els.craftTabs.querySelectorAll(".craft-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === craftTab);
    });
  }

  function renderCraftGroups() {
    if (!els.craftGroups) return;
    els.craftGroups.innerHTML = "";
    const counts = new Map();
    for (const rec of craftRecipes()) {
      const it = ITEMS[String(rec.id)];
      if (!it || craftTabOf(it, rec) !== craftTab) continue;
      const k = craftKeyOf(it, rec);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    if (!counts.size) return;
    const makeBtn = (key, label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "craft-group" + (craftGroup === key ? " active" : "");
      btn.textContent = label;
      btn.addEventListener("click", () => {
        // 再点一次当前分类 = 取消筛选（不显示「全部」按钮）
        craftGroup = craftGroup === key ? null : key;
        renderCraftGroups();
        renderCraftList();
      });
      els.craftGroups.appendChild(btn);
    };
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [k, n] of sorted) makeBtn(k, `${craftGroupName(k)}（${n}）`);
  }

  function renderCraftList() {
    if (!els.craftList) return;
    els.craftList.innerHTML = "";
    const rows = craftVisibleRecipes();
    // 性能：先把背包 + 收获区聚合成「ID → 数量」一次，再让每个配方只算一次可做次数。
    // 之前排序比较器里直接调 craftMaxTimes，而它内部每次 countItem 都要全量扫描背包并 parseKey，
    // 399 配方 ⇒ 4000+ 次扫描（实测约 0.9 秒卡顿）。
    const invCount = new Map();
    for (const map of [state.bag, state.harvest]) {
      for (const [k, c] of map) {
        const id = parseKey(k).id;
        invCount.set(id, (invCount.get(id) || 0) + c);
      }
    }
    const timesCache = new Map();
    const timesOf = rec => {
      let t = timesCache.get(rec);
      if (t === undefined) { t = craftMaxTimes(rec, invCount); timesCache.set(rec, t); }
      return t;
    };
    rows.sort((a, b) => {
      const ta = timesOf(a.rec);
      const tb = timesOf(b.rec);
      const ca = ta > 0 ? 1 : 0;
      const cb = tb > 0 ? 1 : 0;
      if (ca !== cb) return cb - ca;          // 能做的排前面
      const qa = a.it.quality || 1;
      const qb = b.it.quality || 1;
      if (qa !== qb) return qb - qa;
      return tb - ta;
    });
    for (const { rec, it } of rows) {
      const times = timesOf(rec);
      const outCount = Math.max(1, Number(rec.count) || 1);
      const row = document.createElement("div");
      row.className = "craft-row" + (times > 0 ? "" : " lack") + (craftRecipe === rec ? " active" : "");
      row.innerHTML = `<span class="craft-row-icon"><img src="${iconSrc(it)}" alt="">` +
        (outCount > 1 ? `<span class="craft-count">×${outCount}</span>` : "") + `</span>` +
        `<span class="craft-row-name" style="color:${QCOLOR[it.quality] || "#fff"}">${esc(it.name)}</span>` +
        `<span class="craft-row-times${times > 0 ? "" : " lack"}">${times > 0 ? "可做 " + times : "材料不足"}</span>`;
      const iconWrap = row.children[0];
      // 图标不再响应点击（手机上容易误触打开道具详情），统一点整行选择配方
      if (iconWrap) iconWrap.style.pointerEvents = "none";
      row.addEventListener("click", () => selectCraftRecipe(rec, row));
      els.craftList.appendChild(row);
    }
    if (els.craftHint) {
      const available = rows.filter(r => timesOf(r.rec) > 0).length;
      els.craftHint.textContent = `共 ${rows.length} 个配方（可做 ${available}）`;
    }
  }

  function selectCraftRecipe(rec, row) {
    craftRecipe = rec;
    craftQty = 1;
    // 选择组默认未选、展开；选中后自动折叠
    craftChoices = rec.groups.map(g => (g.length > 1 ? -1 : 0));
    craftChoiceOpen = rec.groups.map(g => g.length > 1);
    if (els.craftList) {
      els.craftList.querySelectorAll(".craft-row").forEach(r => r.classList.remove("active"));
      if (row) row.classList.add("active");
    }
    if (els.craftEmpty) els.craftEmpty.classList.add("is-hidden");
    if (els.craftContent) els.craftContent.classList.remove("is-hidden");
    if (els.craftMain) els.craftMain.classList.add("detail-open");
    renderCraftDetail();
  }

  function closeCraftDetail() {
    craftRecipe = null;
    craftQty = 1;
    craftChoices = null;
    craftChoiceOpen = null;
    if (els.craftContent) els.craftContent.classList.add("is-hidden");
    if (els.craftEmpty) els.craftEmpty.classList.remove("is-hidden");
    if (els.craftMain) els.craftMain.classList.remove("detail-open");
    if (els.craftList) els.craftList.querySelectorAll(".craft-row").forEach(r => r.classList.remove("active"));
  }

  function renderCraftDetail() {
    const rec = craftRecipe;
    if (!rec) return;
    const it = ITEMS[String(rec.id)];
    if (!it) return;
    if (els.craftIcon) els.craftIcon.src = iconSrc(it);
    if (els.craftName) {
      els.craftName.textContent = it.name;
      els.craftName.style.color = QCOLOR[it.quality] || "#fff";
    }
    if (els.craftType) els.craftType.textContent = TYPE_NAME[it.type] || "制作";
    const outCount = Math.max(1, Number(rec.count) || 1);
    const rateVal = Number(rec.rate) || 100;
    if (els.craftRate) {
      if (rateVal < 100) {
        els.craftRate.textContent = `成功率：${rateVal}%`;
        els.craftRate.classList.remove("is-hidden");
      } else {
        els.craftRate.classList.add("is-hidden");
      }
    }
    // 产出数量直接标在产物图标上（不再用「产出 ×N」气泡）
    const iconWrap = els.craftIcon ? els.craftIcon.parentElement : null;
    if (iconWrap) {
      let badge = [...iconWrap.children].find(c => (c.className || "").includes("craft-count"));
      if (outCount > 1) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "craft-count";
          iconWrap.appendChild(badge);
        }
        badge.textContent = "×" + outCount;
      } else if (badge) {
        badge.remove();
      }
    }
    if (els.craftMats) {
      els.craftMats.innerHTML = "";
      rec.groups.forEach((group, gi) => {
        if (group.length === 1) {
          const o = group[0];
          const mit = ITEMS[String(o.id)];
          const need = o.count * craftQty;
          const have = countItem(o.id);
          const ok = have >= need;
          const row = document.createElement("div");
          row.className = "craft-mat";
          row.innerHTML =
            (mit ? `<img src="${iconSrc(mit)}" alt="">` : "") +
            `<span class="craft-mat-name"${mit ? ` style="color:${QCOLOR[mit.quality] || "#fff"}"` : ""}>` +
            (mit ? esc(mit.name) : `未知道具 ${esc(String(o.id))}`) + `</span>` +
            `<span class="craft-mat-count ${ok ? "ok" : "bad"}">${have}/${need}</span>`;
          // 材料图标可点开只读详情
          const matIcon = [...row.children].find(c => c.tagName === "IMG");
          if (mit && matIcon) bindItemClick(matIcon, itemKey(mit.id), false, "view");
          els.craftMats.appendChild(row);
        } else {
          const chosen = craftChoices ? craftChoices[gi] : -1;
          const open = craftChoiceOpen ? craftChoiceOpen[gi] : true;
          if (chosen >= 0 && !open) {
            // 已选且折叠：只显示选中的材料，点整行可展开重选
            const o = group[chosen];
            const mit = ITEMS[String(o.id)];
            const need = o.count * craftQty;
            const have = countItem(o.id);
            const ok = have >= need;
            const row = document.createElement("div");
            row.className = "craft-mat craft-chosen";
            row.innerHTML =
              (mit ? `<img src="${iconSrc(mit)}" alt="">` : "") +
              `<span class="craft-mat-name craft-chosen-name"${mit ? ` style="color:${QCOLOR[mit.quality] || "#fff"}"` : ""}>` +
              (mit ? esc(mit.name) : `未知道具 ${esc(String(o.id))}`) + `</span>` +
              `<span class="craft-reselect"></span>` +
              `<span class="craft-mat-count ${ok ? "ok" : "bad"}">${have}/${need}</span>`;
            const matIcon = [...row.children].find(c => c.tagName === "IMG");
            if (mit && matIcon) bindItemClick(matIcon, itemKey(mit.id), false, "view");
            row.addEventListener("click", () => {
              craftChoiceOpen[gi] = true;
              renderCraftDetail();
            });
            els.craftMats.appendChild(row);
          } else {
            // 展开：列出全部候选，点选后自动折叠
            const box = document.createElement("div");
            box.className = "craft-choice";
            const title = document.createElement("div");
            title.className = "craft-choice-title";
            title.textContent = "选择材料";
            box.appendChild(title);
            group.forEach((o, oi) => {
              const mit = ITEMS[String(o.id)];
              const need = o.count * craftQty;
              const have = countItem(o.id);
              const ok = have >= need;
              const selected = craftChoices && craftChoices[gi] === oi;
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = "craft-option" + (selected ? " active" : "");
              btn.innerHTML =
                (mit ? `<img src="${iconSrc(mit)}" alt="">` : "") +
                `<span class="craft-option-name"${mit ? ` style="color:${QCOLOR[mit.quality] || "#fff"}"` : ""}>` +
                (mit ? esc(mit.name) : `未知道具 ${esc(String(o.id))}`) + `</span>` +
                `<span class="craft-mat-count ${ok ? "ok" : "bad"}">${have}/${need}</span>`;
              // 选项里的图标：只读详情（不触发选中）
              const optIcon = [...btn.children].find(c => c.tagName === "IMG");
              if (mit && optIcon) bindItemClick(optIcon, itemKey(mit.id), false, "view");
              btn.addEventListener("click", () => {
                craftChoices[gi] = oi;
                craftChoiceOpen[gi] = false;
                renderCraftDetail();
              });
              box.appendChild(btn);
            });
            els.craftMats.appendChild(box);
          }
        }
      });
      // 金币也放进材料区（不参与「材料不足」判定）
      const goldCost = (rec.gold || 0) * craftQty;
      if (goldCost > 0) {
        const goldRow = document.createElement("div");
        goldRow.className = "craft-mat craft-gold-row";
        goldRow.innerHTML = `<img src="icons/coin.png" alt="">` +
          `<span class="craft-mat-name" style="color:#f0c674">金币</span>` +
          `<span class="craft-mat-count ${state.player.gold >= goldCost ? "ok" : "bad"}">${fmt(state.player.gold)}/${fmt(goldCost)}</span>`;
        els.craftMats.appendChild(goldRow);
      }
    }
    if (els.craftQty) els.craftQty.textContent = craftQty;
    if (els.craftGold) {
      const gold = (rec.gold || 0) * craftQty;
      els.craftGold.textContent = fmt(gold);
      els.craftGold.style.color = state.player.gold >= gold ? "" : "#ff7a7a";
    }
    if (els.craftDo) {
      const check = craftCheck(rec, craftQty);
      const needSelect = check.unselected && check.unselected.length > 0;
      const can = !needSelect && check.missingGroups.length === 0 && check.goldOk;
      els.craftDo.disabled = !can;
      els.craftDo.textContent = needSelect ? "选择材料"
        : (can ? "制作" : (check.missingGroups.length ? "材料不足" : "金币不足"));
    }
    if (els.craftWallet) els.craftWallet.textContent = fmt(state.player.gold);
  }

  function setCraftQty(n) {
    const max = craftRecipe ? craftMaxTimes(craftRecipe) : 1;
    craftQty = Math.min(Math.max(1, n), Math.max(1, max));
    renderCraftDetail();
  }

  function doCraft() {
    const rec = craftRecipe;
    if (!rec) return;
    const qty = craftQty;
    const check = craftCheck(rec, qty);
    if (check.unselected && check.unselected.length) { showToast("请先选择材料"); return; }
    if (check.missingGroups.length) { showToast("材料不足"); return; }
    if (!check.goldOk) { showToast("金币不足"); return; }
    const out = ITEMS[String(rec.id)];
    if (check.gold > 0) state.player.gold -= check.gold;
    for (const p of check.picks) {
      for (let i = 0; i < p.option.count * qty; i++) takeItem(p.option.id);
    }
    const outCount = Math.max(1, Number(rec.count) || 1) * qty;
    const rate = rec.rate || 100;
    const success = Math.random() * 100 < rate;
    if (!success) {
      showToast("制作失败，材料已消耗");
      renderBag();
      saveState();
      renderCraftDetail();
      return;
    }
    grantItem(rec.id, outCount);
    showToast(`制作成功，获得${qName(out.name, out.quality)}${outCount > 1 ? " ×" + outCount : ""}`);
    renderBag();
    saveState();
    renderCraftDetail();
    openReward([{ id: String(rec.id), count: outCount }]);
  }

  function openCraftPanel() {
    craftTab = "equip";
    craftGroup = null;
    craftRecipe = null;
    craftQty = 1;
    if (els.craftContent) els.craftContent.classList.add("is-hidden");
    if (els.craftEmpty) els.craftEmpty.classList.remove("is-hidden");
    if (els.craftMain) els.craftMain.classList.remove("detail-open");
    renderCraftTabs();
    renderCraftGroups();
    renderCraftList();
    if (els.craftWallet) els.craftWallet.textContent = fmt(state.player.gold);
    if (els.craftPanel) els.craftPanel.classList.remove("is-hidden");
  }

  if (els.bagPanel) els.bagPanel.classList.add("is-hidden");   // 启动时确保收起
  if (els.shopPanel) els.shopPanel.classList.add("is-hidden");
  if (els.craftPanel) els.craftPanel.classList.add("is-hidden");
  // 点灰色遮罩（面板空白处）关闭
  if (els.craftPanel) {
    els.craftPanel.addEventListener("click", (ev) => {
      if (ev.target === els.craftPanel) els.craftPanel.classList.add("is-hidden");
    });
  }
  if (els.shopPanel) {
    els.shopPanel.addEventListener("click", (ev) => {
      if (ev.target === els.shopPanel) closeShopPanel();
    });
  }
  if (els.craftBtn) els.craftBtn.addEventListener("click", openCraftPanel);
  if (els.craftClose) els.craftClose.addEventListener("click", () => els.craftPanel.classList.add("is-hidden"));
  if (els.craftBack) els.craftBack.addEventListener("click", closeCraftDetail);
  if (els.craftDo) els.craftDo.addEventListener("click", doCraft);
  // 产物图标：只读详情
  if (els.craftIcon) {
    els.craftIcon.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (craftRecipe) showItemDetail(itemKey(craftRecipe.id), false, false, "view");
    });
  }
  if (els.craftQtyMinus) els.craftQtyMinus.addEventListener("click", () => setCraftQty(craftQty - 1));
  if (els.craftQtyPlus) els.craftQtyPlus.addEventListener("click", () => setCraftQty(craftQty + 1));
  if (els.craftQtyMax) els.craftQtyMax.addEventListener("click", () => setCraftQty(craftRecipe ? craftMaxTimes(craftRecipe) : 1));
  if (els.craftTabs) {
    els.craftTabs.querySelectorAll(".craft-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        craftTab = btn.dataset.tab;
        craftGroup = null;
        renderCraftTabs();
        renderCraftGroups();
        renderCraftList();
        if (craftRecipe && craftTabOf(ITEMS[String(craftRecipe.id)], craftRecipe) !== craftTab) closeCraftDetail();
      });
    });
  }
  // 全局隐藏滚动条后，这些列表支持按住拖动滚动
  [els.logList, els.statsList, els.skillGrid, els.choiceList, els.areaPicker, els.sourceList, els.dropPreview, els.craftList, els.craftDetail]
    .forEach(enableDragScroll);
  if (els.bagClose) els.bagClose.addEventListener("click", closeBagPanel);
  // 注意：背包是非模态浮层，点外面既不关闭也不拦截，只有右上角 × 能关
  if (els.bagTabs) {
    els.bagTabs.querySelectorAll(".bag-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        bagTab = btn.dataset.tab;
        renderBagPanel();
      });
    });
  }
  if (els.bagSort) {
    els.bagSort.addEventListener("click", () => {
      bagSorted = true;
      renderBagPanel();
    });
  }

  // 背包网格：隐藏滚动条，按住拖动滚动（手机上就是直接滑）
  let bagDrag = null;
  if (els.bagGrid) {
    els.bagGrid.addEventListener("mousedown", ev => {
      if (ev.button !== 0) return;
      bagDrag = { y: ev.clientY, top: els.bagGrid.scrollTop || 0, moved: false };
    });
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("mousemove", ev => {
        if (!bagDrag) return;
        const dy = ev.clientY - bagDrag.y;
        if (!bagDrag.moved && Math.abs(dy) > 4) bagDrag.moved = true;
        if (bagDrag.moved) {
          els.bagGrid.scrollTop = bagDrag.top - dy;
          ev.preventDefault();
        }
      });
      window.addEventListener("mouseup", () => {
        if (bagDrag && bagDrag.moved) {
          // 拖动结束的那一次 click 不当作「点开道具」
          els.bagGrid.dataset.dragged = "1";
          setTimeout(() => { delete els.bagGrid.dataset.dragged; }, 0);
        }
        bagDrag = null;
      });
    }
    els.bagGrid.addEventListener("click", ev => {
      if (els.bagGrid.dataset.dragged) {
        ev.stopPropagation();
        ev.preventDefault();
      }
    }, true);
  }


  // 点击道具格 → 打开详情。origin 记录「从哪个箱子点开」：bag / harvest 才允许操作，
  // 其它（掉落预览等）默认 "view" 只读。
  function bindItemClick(cell, key, owned = true, origin = "view") {
    cell.addEventListener("click", ev => {
      ev.stopPropagation();
      showItemDetail(key, owned, false, origin);
    });
  }

  function openSource(itemId) {
    const srcText = (DATA.skillSources || {})[String(itemId)];
    if (!srcText || !els.sourceModal || !els.sourceList) return;
    if (els.sourceTitle) els.sourceTitle.textContent = "获得来源";
    els.sourceList.innerHTML = "";
    for (const line of srcText.split("、")) {
      const text = line.trim();
      if (!text) continue;
      const row = document.createElement("div");
      row.className = "source-item";
      row.textContent = text;
      els.sourceList.appendChild(row);
    }
    els.sourceModal.classList.remove("is-hidden");
  }

  // 箱子内容预览：概率箱显示道具概率；选择型/固定礼包只列道具；装备箱显示品质概率
  // 概率显示：低概率多给几位小数，避免 0.0%
  function fmtPercent(p) {
    if (!(p > 0)) return "0%";
    if (p >= 0.1) return p.toFixed(1) + "%";
    if (p >= 0.01) return p.toFixed(2) + "%";
    if (p >= 0.001) return p.toFixed(3) + "%";
    return "<0.001%";
  }

  function openBoxPreview(item) {
    const use = item.use || {};
    const kind = use.kind;
    if (!els.sourceModal || !els.sourceList) return;

    // 装备箱：只给品质概率（具体装备从装备表随机）
    if (kind === "equipBox" || kind === "qualityEquip") {
      const rates = use.rates || {};
      if (!Object.keys(rates).length) return;
      if (els.sourceTitle) els.sourceTitle.textContent = "可开出品质";
      els.sourceList.innerHTML = "";
      for (const [q, pct] of Object.entries(rates)) {
        const row = document.createElement("div");
        row.className = "source-item box-preview-row";
        row.innerHTML =
          `<span class="box-preview-name q${q}">${QUALITY_NAMES[Number(q)] || q}</span>` +
          `<span class="box-preview-pct">${Number(pct).toFixed(2).replace(/\.?0+$/, "")}%</span>`;
        els.sourceList.appendChild(row);
      }
      els.sourceModal.classList.remove("is-hidden");
      return;
    }

    const isRandom = kind === "box";
    const raw = isRandom
      ? ((DATA.boxes || {})[String(item.id)] || [])
      : (kind === "choose" ? (use.options || [])
        : (kind === "bundle" ? (use.items || []) : []));
    if (!raw.length) return;
    const total = isRandom
      ? raw.reduce((s, r) => s + (Number(r.weight) || 0), 0) || 1
      : 0;
    if (els.sourceTitle) {
      els.sourceTitle.textContent = isRandom ? "可开出道具" : "可获得道具";
    }
    els.sourceList.innerHTML = "";
    for (const r of raw) {
      if (r.id === "金币" || r.id === "gold") {
        const row = document.createElement("div");
        row.className = "source-item box-preview-row";
        row.innerHTML = `<img class="box-preview-icon" src="icons/coin.png" alt="">` +
          `<span class="box-preview-name q6">金币</span>` +
          `<span class="box-preview-count">×${goldShort(r.count || 1)}</span>` +
          (isRandom ? `<span class="box-preview-pct">${fmtPercent((Number(r.weight) || 0) / total * 100)}</span>` : "");
        els.sourceList.appendChild(row);
        continue;
      }
      const it = ITEMS[String(r.id)];
      if (!it) continue;
      const count = r.count || 1;
      const row = document.createElement("div");
      row.className = "source-item box-preview-row";
      row.innerHTML =
        `<img class="box-preview-icon" src="${iconSrc(it)}" alt="">` +
        `<span class="box-preview-name q${it.quality}">${esc(it.name)}</span>` +
        (count > 1 ? `<span class="box-preview-count">×${count}</span>` : "") +
        (isRandom ? `<span class="box-preview-pct">${fmtPercent((Number(r.weight) || 0) / total * 100)}</span>` : "");
      // 点预览里的道具可以看详情（只读），层级由 showItemDetail 动态提高
      row.addEventListener("click", () => showItemDetail(itemKey(it.id), false));
      els.sourceList.appendChild(row);
    }
    els.sourceModal.classList.remove("is-hidden");
  }

  function closeSource() {
    if (els.sourceModal) els.sourceModal.classList.add("is-hidden");
  }

  function hideItemDetail() {
    els.itemModal.classList.remove("show");
    els.itemModal.style.zIndex = "";
  }

  function addItemAction(label, primary, onClick, disabled = false, extraClass = "") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item-btn" + (primary ? " primary" : "") + (extraClass ? " " + extraClass : "");
    btn.textContent = label;
    btn.disabled = !!disabled;
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      if (!disabled) onClick();
    });
    els.itemActions.appendChild(btn);
  }

  // 套装栏：成员与效果，已穿戴的部件 / 已激活的档位显示绿字
  // 默认收起（只有标题行），点标题展开
  let itemSetOpen = false;
  let detailOrigin = "bag";   // 当前详情是从哪个箱子点开的：bag / harvest
  let itemNameIdx = null;
  // 套装成员名比较：源站用「X(刻印)」，本地道具名可能已去掉「(刻印)」，比较时统一去掉后缀
  const setMemberKey = (name) => String(name || "").replace(/\(刻印\)$/, "");
  function itemNameIndex() {
    if (!itemNameIdx) {
      // 规范化名 → 本地道具的显示名
      itemNameIdx = new Map();
      for (const it of Object.values(ITEMS)) {
        const key = setMemberKey(it.name);
        if (!itemNameIdx.has(key)) itemNameIdx.set(key, it.name);
      }
    }
    return itemNameIdx;
  }

  function renderItemSet(item) {
    const box = els.itemSet;
    if (!box) return;
    const set = item && item.type === 3 ? item.set : null;
    const local = itemNameIndex();
    // 源站成员名可能带「(刻印)」→ 映射成本地真实存在的道具名，只显示本地有的部件（同一件去重）
    const members = set && Array.isArray(set.members)
      ? [...new Set(set.members.map((m) => local.get(setMemberKey(m))).filter(Boolean))]
      : [];
    if (!set || !members.length) {
      box.innerHTML = "";
      box.classList.add("is-hidden");
      return;
    }
    box.classList.remove("is-hidden");
    const equippedNames = new Set();
    for (const slot of EQUIP_SLOTS) {
      const key = equipment[slot.key];
      if (!key) continue;
      const it = keyItem(key);
      if (it) equippedNames.add(it.name);
    }
    const sig = set.members.join("|");
    let count = 0;
    for (const slot of EQUIP_SLOTS) {
      const key = equipment[slot.key];
      if (!key) continue;
      const it = keyItem(key);
      if (it && it.set && Array.isArray(it.set.members) && it.set.members.join("|") === sig) count++;
    }
    const html = [];
    html.push(`<div class="set-title set-toggle">${itemSetOpen ? "▾" : "▸"} 套装（${count}/${members.length}）</div>`);
    if (itemSetOpen) {
      // 每件装备单独一行
      for (const m of members) {
        const on = equippedNames.has(m);
        html.push(`<div class="set-member ${on ? "on" : "off"}">${esc(m)}</div>`);
      }
      // 每个档位一行标题，每条属性再单独一行（用游戏内属性名展示）
      for (const b of set.bonuses || []) {
        const active = count >= Number(b.count);
        html.push(`<div class="set-bonus-title ${active ? "on" : "off"}">${b.count} 件套：</div>`);
        for (const line of b.lines || []) {
          const a = parseSetBonusLine(line);
          const text = a && a.key
            ? `${a.name} ${a.value >= 0 ? "+" : ""}${a.value}${a.pct ? "%" : ""}`
            : line;
          html.push(`<div class="set-bonus-line ${active ? "on" : "off"}">${esc(text)}</div>`);
        }
      }
    }
    box.innerHTML = html.join("");
    const title = box.querySelector(".set-toggle") || box.children[0];
    if (title && title.addEventListener) {
      title.addEventListener("click", ev => {
        ev.stopPropagation();
        itemSetOpen = !itemSetOpen;
        renderItemSet(item);
      });
    }
  }

  // 材料 → 使用它的配方；产物 → 制作它的配方
  const matRecipes = new Map();
  const prodRecipes = new Map();
  for (const rec of (DATA.recipes || [])) {
    const pid = String(rec.id);
    if (!prodRecipes.has(pid)) prodRecipes.set(pid, []);
    prodRecipes.get(pid).push(rec);
    for (const g of rec.groups || []) for (const o of g) {
      const k = String(o.id);
      if (!matRecipes.has(k)) matRecipes.set(k, []);
      if (!matRecipes.get(k).includes(rec)) matRecipes.get(k).push(rec);
    }
  }

  // 跳到制作界面并选中该配方
  function jumpToCraft(rec) {
    const it = ITEMS[String(rec.id)];
    if (!it || !els.craftPanel) return;
    hideItemDetail();
    // 来源弹窗 450 比制作面板高，跳转前先关掉，避免挡住制作界面
    if (els.sourceModal) els.sourceModal.classList.add("is-hidden");
    craftTab = craftTabOf(it, rec);
    craftGroup = craftKeyOf(it, rec);   // 聚焦到该道具所属分类，避免左右对不上
    els.craftPanel.classList.remove("is-hidden");
    renderCraftTabs();
    renderCraftGroups();
    renderCraftList();
    selectCraftRecipe(rec);
    // 把选中的配方滚动到可见区域
    const activeRow = els.craftList ? els.craftList.querySelector(".craft-row.active") : null;
    if (activeRow && activeRow.scrollIntoView) activeRow.scrollIntoView({ block: "center" });
  }

  // 详情页「制作配方」：折叠显示
  //   该道具作为材料参与的配方（用途）
  //   该道具作为产物的配方（怎么制作它）
  function renderItemRecipes(item) {
    if (!els.itemRecipes) return;
    els.itemRecipes.innerHTML = "";
    const asMat = matRecipes.get(String(item.id)) || [];
    const asProd = prodRecipes.get(String(item.id)) || [];
    if (!asMat.length && !asProd.length) { els.itemRecipes.classList.add("is-hidden"); return; }

    const addSection = (label, recs, buildRow) => {
      const title = document.createElement("div");
      title.className = "item-recipes-title";
      const head = open => `${open ? "▾" : "▸"} ${label}（${recs.length}）`;
      title.textContent = head(false);
      const body = document.createElement("div");
      body.className = "item-recipes-body";
      body.style.display = "none";   // 默认折叠
      title.addEventListener("click", ev => {
        ev.stopPropagation();
        const open = body.style.display !== "block";
        body.style.display = open ? "block" : "none";
        title.textContent = head(open);
      });
      els.itemRecipes.appendChild(title);
      els.itemRecipes.appendChild(body);
      for (const rec of recs) buildRow(rec, body);
    };

    // ① 作为材料：列出能做出什么
    if (asMat.length) {
      addSection("用途", asMat, (rec, body) => {
        const prod = ITEMS[String(rec.id)];
        if (!prod) return;
        const row = document.createElement("div");
        row.className = "item-recipe-row";
        row.innerHTML = `<img src="${iconSrc(prod)}" alt="">` +
          `<span class="item-recipe-name" style="color:${QCOLOR[prod.quality] || "#fff"}">${esc(prod.name)}</span>` +
          `<span class="item-recipe-go">▸</span>`;
        row.addEventListener("click", ev => { ev.stopPropagation(); jumpToCraft(rec); });
        body.appendChild(row);
      });
    }

    // ② 作为产物：列出制作它需要的材料（带图标）
    if (asProd.length) {
      addSection("配方", asProd, (rec, body) => {
        const row = document.createElement("div");
        row.className = "item-recipe-row";
        const matsWrap = document.createElement("span");
        matsWrap.className = "item-recipe-mats";
        (rec.groups || []).forEach((g, gi) => {
          if (gi > 0) matsWrap.appendChild(document.createTextNode(" + "));
          g.forEach((o, oi) => {
            if (oi > 0) matsWrap.appendChild(document.createTextNode(" / "));
            const sub = ITEMS[String(o.id)];
            if (sub) {
              const img = document.createElement("img");
              img.className = "item-recipe-mat-icon";
              img.src = iconSrc(sub);
              img.alt = "";
              matsWrap.appendChild(img);
            }
            matsWrap.appendChild(document.createTextNode((sub ? sub.name : o.id) + "×" + o.count));
          });
        });
        const gold = rec.gold || 0;
        if (gold > 0) {
          const coin = document.createElement("img");
          coin.className = "item-recipe-mat-icon";
          coin.src = "icons/coin.png";
          coin.alt = "";
          matsWrap.appendChild(document.createTextNode(" + "));
          matsWrap.appendChild(coin);
          matsWrap.appendChild(document.createTextNode(`金币 ${fmt(gold)}`));
        }
        row.appendChild(matsWrap);
        const go = document.createElement("span");
        go.className = "item-recipe-go";
        go.textContent = "▸";
        row.appendChild(go);
        row.addEventListener("click", ev => { ev.stopPropagation(); jumpToCraft(rec); });
        body.appendChild(row);
      });
    }

    els.itemRecipes.classList.remove("is-hidden");
  }

  function showItemDetail(key, owned = true, fromEquip = false, origin = "view") {
    const parsed = parseKey(key);
    const item = ITEMS[parsed.id];
    if (!item) return;
    // 从「内容预览」弹窗点开详情时，详情要盖在预览弹窗之上
    const previewOpen = els.sourceModal && !els.sourceModal.classList.contains("is-hidden");
    els.itemModal.style.zIndex = previewOpen ? "520" : "";
    // 只有从「背包」「收获区」「装备区」点开才允许操作；掉落预览、生效 buff 图标、
    // 技能材料图标等入口一律只读，不渲染任何操作按钮。
    const interactive = owned && (origin === "bag" || origin === "harvest" || origin === "equip");
    // 记住详情来源（背包 / 收获区），出售时按它决定从哪个箱子扣
    detailOrigin = origin === "harvest" ? "harvest" : "bag";
    itemSetOpen = false;   // 每次打开详情，套装栏默认收起
    const enhance = parsed.enhance;
    const suffix = keySuffix(key);

    els.itemIcon.src = iconSrc(item);
    // 图标左上/左下角标：+N 绿色、★ 金色
    if (els.itemIcon && els.itemIcon.parentElement) {
      const wrap = els.itemIcon.parentElement;
      let badge = null;
      for (const ch of wrap.children || []) {
        if (ch && String(ch.className || "").split(" ").includes("enh")) { badge = ch; break; }
      }
      const label = enhLabelHtml(key);
      if (!label) {
        if (badge && badge.parentElement) badge.parentElement.removeChild(badge);
      } else {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "enh";
          wrap.appendChild(badge);
        }
        badge.innerHTML = label;
      }
    }
    els.itemName.textContent = itemLabel(key);
    els.itemName.style.color = QCOLOR[item.quality] || "#fff";
    els.itemType.textContent =
      item.type === 3
        ? (item.slot ? `装备 · ${slotName(item.slot)}` : "装备")
        : (TYPE_NAME[item.type] || TYPE_NAME[1]);
    // 安定值气泡：装备显示（变身/娃娃卡不显示）
    if (els.itemSafe) {
      const isCardSlot = item.type === 3 && (item.slot === "transform" || item.slot === "doll");
      if (item.type === 3 && !isCardSlot) {
        els.itemSafe.textContent = `安定值：${enhanceSafe(item.id)}`;
        els.itemSafe.classList.remove("is-hidden");
      } else {
        els.itemSafe.classList.add("is-hidden");
      }
    }

    // 持有数量（只算背包里的同一实例，不含收获区）显示在名字右边；物品价值放右下角
    if (els.itemHold) {
      const inBag = state.bag.get(key) || 0;
      const isEquipped = Object.values(equipment).includes(key);
      els.itemHold.textContent = isEquipped ? "已装备" : `持有：${inBag}`;
    }
    if (els.itemValue) {
      els.itemValue.innerHTML = `<img src="icons/coin.png" alt="">${fmt(item.value || 0)}`;
    }

    // 装备属性：基础属性 + 该强化等级的属性（同名相加）；防御等级 / 攻击力用白字
    // 装备属性来自 attrs；消耗品（type 4）显示 use 里的限时增益
    const baseAttrs = item.type === 3 && Array.isArray(item.attrs) ? item.attrs
      : (item.type === 4 && item.use && Array.isArray(item.use.attrs) ? item.use.attrs : []);
    const lv = item.type === 3 ? enchantLevelOf(item.id, enhance) : null;
    // 百分比属性（敏捷+5%）和固定值（敏捷+5）分开存，避免互相覆盖
    const merged = new Map();
    for (const a of baseAttrs) {
      if (!a || !a.key) continue;
      const mk = a.pct ? `${a.key}%` : a.key;
      merged.set(mk, { key: a.key, name: a.name, value: toInt(a.value, 0), pct: !!a.pct });
    }
    if (lv && lv.attrs) {
      for (const [k, v] of Object.entries(lv.attrs)) {
        const cur = merged.get(k);
        merged.set(k, {
          key: k,
          name: cur ? cur.name : (GEAR_NAME[k] || k),
          value: (cur ? cur.value : 0) + toInt(v, 0),
          pct: false,
        });
      }
    }
    // 祝福属性（祝福过的装备才显示）
    if (parsed.bless && Array.isArray(item.blessAttrs)) {
      for (const a of item.blessAttrs) {
        if (!a || !a.key) continue;
        const mk = a.pct ? `${a.key}%` : a.key;
        const cur = merged.get(mk);
        merged.set(mk, {
          key: a.key,
          name: a.name || GEAR_NAME[a.key] || a.key,
          value: (cur ? cur.value : 0) + toInt(a.value, 0),
          pct: !!a.pct,
        });
      }
    }
    const attrs = [...merged.values()];

    // 触发效果：基础 + 强化（同名概率相加）
    const trigMap = new Map();
    const addTrig = t => {
      if (!t || !t.name) return;
      const cur = trigMap.get(t.name);
      if (!cur) {
        trigMap.set(t.name, { name: t.name, chance: t.chance == null ? null : Number(t.chance), when: t.when, desc: t.desc });
      } else if (t.chance != null) {
        cur.chance = (cur.chance == null ? 0 : cur.chance) + Number(t.chance);
      }
    };
    if (item.type === 3 && Array.isArray(item.triggers)) item.triggers.forEach(addTrig);
    if (lv && Array.isArray(lv.triggers)) lv.triggers.forEach(addTrig);
    const triggers = [...trigMap.values()];
    // 没有属性的装备（源站本来就没属性）就不显示属性区，也不放占位文案
    const hasAttr = (item.type === 3 && (attrs.length > 0 || triggers.length > 0))
      || (item.type === 4 && attrs.length > 0);
    els.itemAttrs.innerHTML = "";
    els.itemAttrs.classList.toggle("show", hasAttr);
    if (hasAttr) {
        // 双手武器：在「攻击力」上方用默认白字标一行「双手武器」
        let twoHandedDone = false;
        const addTwoHanded = () => {
          if (!item.twoHanded || twoHandedDone) return;
          const line = document.createElement("div");
          line.className = "attr-line base";
          line.textContent = "双手武器";
          els.itemAttrs.appendChild(line);
          twoHandedDone = true;
        };
        // 消耗品：属性区顶部写「N分钟内，」，具体增益列在下面
        if (item.type === 4) {
          const head = document.createElement("div");
          head.className = "attr-line base";
          const mins = Math.max(1, Math.round(((item.use && item.use.seconds) || 900) / 60));
          head.textContent = `${mins}分钟内，`;
          els.itemAttrs.appendChild(head);
        }
        if (!attrs.some(a => a.key === "atk")) addTwoHanded();
        // 攻击力 / 防御等级排在最前面，其余绿字属性按原顺序跟在后面
        const ordered = [
          ...attrs.filter(a => a.key === "atk"),
          ...attrs.filter(a => a.key === "def"),
          ...attrs.filter(a => a.key !== "atk" && a.key !== "def"),
        ];

        for (const a of ordered) {
          if (a.key === "atk") addTwoHanded();
          const line = document.createElement("div");
          line.className = "attr-line";
          // 防御等级、攻击力是基础数值，用默认白字；其余加成保持绿字
          if (a.key === "def" || a.key === "atk") line.classList.add("base");
          // 负数直接显示「属性 -N」，不要出现「+-2」；百分比属性显示「+5%」
          const num = toInt(a.value, 0);
          const sign = num < 0 ? "-" : "+";
          const unit = (a.pct || isPctAttr(a.key)) ? "%" : "";
          line.textContent = `${GEAR_NAME[a.key] || a.name || a.key} ${sign}${Math.abs(num)}${unit}`;
          els.itemAttrs.appendChild(line);
        }
        for (const t of triggers) {
          const line = document.createElement("div");
          line.className = "attr-line trigger";
          // 有概率的是「发动：xxx N%」；无概率的标签类（贯通效果 / HP吸收 / MP吸收）直接显示原文
          if (t.chance == null) {
            line.textContent = t.name;
          } else {
            const when = t.when ? `${t.when}发动：` : "发动：";
            line.textContent = `${when}${t.name} ${t.chance}%`;
          }
          // 点击展开实际效果；优先用配置里的 desc，其次按名字找同名技能的描述
          const skill = t.name
            ? (DATA.skills || []).find(s => s.name === t.name)
            : null;
          const descText = t.desc || (skill && skill.desc) || "效果待配置";
          let panel = null;
          line.addEventListener("click", ev => {
            ev.stopPropagation();
            if (!panel) {
              panel = document.createElement("div");
              panel.className = "trigger-desc";
              panel.textContent = descText;
              line.appendChild(panel);
            }
            const open = panel.style.display !== "block";
            panel.style.display = open ? "block" : "none";
          });
          els.itemAttrs.appendChild(line);
        }
    }

    // 技能书：描述统一为「用于学习和强化X」，X 用技能品质色
    const bookSkill = item.skill ? SKILL_BY_ID.get(String(item.skill)) : SKILL_BY_BOOK.get(String(item.id));
    if (bookSkill) {
      els.itemDesc.innerHTML = `用于学习和强化<span class="q${bookSkill.quality}">${esc(bookSkill.name)}</span>`;
      els.itemDesc.classList.remove("is-hidden");
    } else if (String(item.desc || "").trim()) {
      // 风味文本用「/段落/」包裹 → 与技能书一致，渲染成灰色斜体说明
      els.itemDesc.innerHTML = esc(item.desc)
        .replace(/\n/g, "<br>")
        .replace(/\/([^/<>]+)\//g, (m, inner) => `<span class="desc-note">${inner.trim()}</span>`);
      els.itemDesc.classList.remove("is-hidden");
    } else {
      // 没有说明文本：说明区不显示
      els.itemDesc.textContent = "";
      els.itemDesc.classList.add("is-hidden");
    }

    // 套装：成员 + 已激活档位
    renderItemSet(item);

    // 制作配方预览（该道具作为材料）
    renderItemRecipes(item);

    // 获得来源 / 箱子内容预览（两个入口并排）
    const srcText = (DATA.skillSources || {})[item.id];
    const useKind = item.use ? item.use.kind : "";
    const hasRandomRows = useKind === "box" && (((DATA.boxes || {})[String(item.id)] || []).length > 0);
    const hasFixedRows = useKind === "choose" || useKind === "bundle";
    const hasQualityRows = useKind === "equipBox" || useKind === "qualityEquip";
    if (els.itemSource) {
      let links = "";
      if (srcText) links += '<span class="item-source-link" data-act="source">获得来源 ▸</span>';
      if (hasRandomRows || hasFixedRows || hasQualityRows) {
        links += '<span class="item-source-link" data-act="box">内容预览 ▸</span>';
      }
      els.itemSource.innerHTML = links;
      els.itemSource.classList.toggle("is-hidden", !links);
      els.itemSource.onclick = links ? (ev) => {
        const act = ev && ev.target && ev.target.dataset ? ev.target.dataset.act : "source";
        if (act === "box") openBoxPreview(item);
        else openSource(item.id);
      } : null;
    }

    // 按钮：只有从背包 / 收获区点开才给操作；其它入口只展示信息
    els.itemActions.innerHTML = "";
    els.itemActions.classList.toggle("is-hidden", !interactive);
    if (!interactive) {
      // 只读来源：不渲染任何按钮
    } else if (item.type === 2) {
      const skill = SKILL_BY_BOOK.get(String(item.id));
      const has = countItem(item.id) > 0;
      if (skill) {
        addItemAction("使用", has, () => useSkillBook(item, skill), !has);
      } else if (item.use) {
        // 特殊道具（传送卷轴 / 万能药 / 箱子）
        addItemAction("使用", has, () => useSpecialItem(item), !has);
      } else {
        addItemAction("使用", true, () => {
          showToast(`「${esc(item.name)}」的使用功能尚未开放`);
        });
      }
    } else if (item.type === 4) {
      // 消耗品：手动使用 + 「自动使用」勾选（参考技能激活的勾选样式）
      const has = countItem(item.id) > 0;
      addItemAction("使用", has && !!item.use, () => {
        if (!item.use) {
          showToast(`「${esc(item.name)}」还没有配置增益效果`);
          return;
        }
        if (useConsumable(item.id)) {
          showToast(`使用了「${esc(item.name)}」`);
          renderBag();
        } else {
          showToast("背包里没有这个道具");
        }
      }, !has || !item.use);
      const auto = state.autoUse.has(String(item.id));
      // 勾选框形式：未勾选 = 黄色「自动使用 □」，勾选后 = 绿色「自动使用中 ☑」
      addItemAction(auto ? "自动使用中 ☑" : "自动使用 □", false, () => {
        if (auto) {
          state.autoUse.delete(String(item.id));
          // 取消勾选时把「已用完」的置灰提示一起清掉
          const cur = state.consumables.get(String(item.id));
          if (cur && cur.exhausted) state.consumables.delete(String(item.id));
        } else {
          state.autoUse.add(String(item.id));
          // 勾选后如果当前还没生效、背包里也有货，就立刻先吃一个开始计时
          if (!state.consumables.has(String(item.id)) && findBagItemKey(item.id)) {
            useConsumable(item.id);
          }
        }
        saveState();
        renderBag();                 // 收获区格子上的 E 标志
        renderBagPanel();            // 背包面板里的 E 标志
        renderActiveBuffs();         // 标题区的生效图标
        showItemDetail(key, owned, false, detailOrigin);  // 重绘按钮状态（保留来源）
      }, false, auto ? "on" : "auto");
    } else if (item.type === 3) {
      const slotKey = item.slot;
      // 装备：第一个按钮是「强化」（背包和已装备的都支持；变身/娃娃卡不能强化）
      const isCardSlot = slotKey === "transform" || slotKey === "doll";
      if (!isCardSlot && (countKey(key) > 0 || fromEquip)) {
        addItemAction("强化", true, () => openEnhance(key));
      }
      // 只有「从装备格点开」才算已装备；背包里的同款道具应该显示「装备」
      const equipped = fromEquip && !!slotKey && equipment[slotKey] === key;
      const slotOk = !!slotKey && EQUIP_SLOTS.some(s => s.key === slotKey);
      const wItem = equipment["weapon"] ? keyItem(equipment["weapon"]) : null;
      const offhandBlocked = slotKey === "offhand" && wItem && wItem.twoHanded;
      if (equipped) {
        addItemAction("卸下", false, () => unequipSlot(slotKey));
      } else if (!slotOk) {
        addItemAction("部位未配置", false, () => {}, true);
      } else if (offhandBlocked) {
        addItemAction("双手武器占用", false, () => {}, true);
      } else if (countKey(key) > 0) {
        addItemAction("装备", false, () => equipItem(key), false, "equip");
      } else {
        addItemAction("未拥有", false, () => {}, true);
      }
    }

    // 出售：只能卖「点开的那个箱子」里的数量——收获区点开最多卖收获区那格，
    // 背包点开最多卖背包里的同款。其它入口（buff 图标 / 技能材料等）背包优先。
    if (owned) {
      const from = sellableOrigin(key);
      if (from) addItemAction("出售", false, () => openSellModal(key, from), false, "sell");
    }

    els.itemModal.classList.add("show");
    // 显示后再套用上次关窗的位置（此时才有真实尺寸）
    applyItemCardPos();
  }

  /* ---------------- 收获 / 出售 ---------------- */
  // 收获动画：收获区里的道具 / 金币图标飞向左上角「背包」按钮，飞到后缩小消失。
  // 纯视觉，失败或环境不支持（无 DOM / 减少动效）时静默跳过，不影响收获本身。
  function flyHarvestToBag() {
    if (typeof document === "undefined" || !document.body) return;
    if (!els.bag || !els.bagBtn) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof els.bagBtn.getBoundingClientRect !== "function") return;
    if (typeof els.bag.querySelectorAll !== "function") return;
    const target = els.bagBtn.getBoundingClientRect();
    if (!target || !target.width) return;
    const cells = [...els.bag.querySelectorAll(".bag-item")];
    if (!cells.length) return;
    const tx = target.left + target.width / 2;
    const ty = target.top + target.height / 2;
    const MAX_FLY = 60;                                  // 太多就不逐个飞，等距抽样
    const step = Math.max(1, Math.ceil(cells.length / MAX_FLY));
    let order = 0;
    for (let i = 0; i < cells.length; i += step) {
      const cell = cells[i];
      const img = typeof cell.querySelector === "function" ? cell.querySelector("img") : null;
      if (!img || typeof cell.getBoundingClientRect !== "function") continue;
      const r = cell.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const clone = document.createElement("div");
      clone.className = "fly-item";
      clone.style.left = r.left + "px";
      clone.style.top = r.top + "px";
      clone.style.width = r.width + "px";
      clone.style.height = r.height + "px";
      const icon = document.createElement("img");
      icon.src = img.getAttribute("src") || "";
      clone.appendChild(icon);
      document.body.appendChild(clone);
      const dx = tx - (r.left + r.width / 2);
      const dy = ty - (r.top + r.height / 2);
      const delay = order++ * 16;                        // 依次起飞，像一串流光
      const done = () => { if (clone.parentNode) clone.parentNode.removeChild(clone); };
      if (typeof clone.animate === "function") {
        const anim = clone.animate([
          { transform: "translate(0px, 0px) scale(1)", opacity: 1, offset: 0 },
          { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 26}px) scale(.72)`, opacity: .92, offset: .55 },
          { transform: `translate(${dx}px, ${dy}px) scale(.16)`, opacity: 0, offset: 1 },
        ], { duration: 620, delay, easing: "cubic-bezier(.35,0,.55,1)", fill: "forwards" });
        anim.onfinish = done;
        anim.oncancel = done;
        setTimeout(done, delay + 620 + 400);             // 兜底：动画被中断也要移除
      } else {
        done();
      }
    }
    // 到达后给背包按钮一个轻微脉冲，强化「收到了」的反馈
    if (els.bagBtn.classList) {
      els.bagBtn.classList.remove("fly-pulse");
      void els.bagBtn.offsetWidth;                       // 强制重排，重复点击也能重播
      els.bagBtn.classList.add("fly-pulse");
      setTimeout(() => els.bagBtn.classList.remove("fly-pulse"), 700);
    }
  }

  // 收获：把收获区的东西和金币收下，挂机时间清零
  function harvestAll() {
    if (state.harvest.size === 0 && state.harvestGold <= 0) return;
    flyHarvestToBag();                                  // 先抓格子位置再清空
    for (const [id, n] of state.harvest) {
      state.bag.set(id, (state.bag.get(id) || 0) + n);
    }
    state.harvest.clear();
    state.player.gold += state.harvestGold;
    state.harvestGold = 0;
    state.elapsedBase = 0;
    state.sessionStart = Date.now();
    renderBag();
    renderPlayer();
    renderTimer();
    if (els.bagPanel && !els.bagPanel.classList.contains("is-hidden")) renderBagPanel();
    saveState();
    showToast("已移动战利品至仓库");
  }

  // 出售只针对「点开的那个箱子」：收获区点开只卖收获区，背包点开只卖背包
  function originCount(key, origin) {
    return (origin === "harvest" ? state.harvest : state.bag).get(key) || 0;
  }
  // 出售来源：优先用详情来源；该箱子没有同款时（buff 图标 / 技能材料等入口）回退到另一个箱子
  function sellableOrigin(key) {
    if (originCount(key, detailOrigin) > 0) return detailOrigin;
    const other = detailOrigin === "harvest" ? "bag" : "harvest";
    return originCount(key, other) > 0 ? other : null;
  }

  // 出售：弹窗里选数量，确认后只从来源箱子扣掉并折算金币
  let sellTarget = null;
  let sellOrigin = "bag";   // bag / harvest：这次出售从哪个箱子扣
  let sellQty = 1;
  let sellMax = 1;

  function openSellModal(key, origin = "bag") {
    const have = originCount(key, origin);
    if (have <= 0) return;
    sellTarget = key;
    sellOrigin = origin === "harvest" ? "harvest" : "bag";
    sellMax = have;
    sellQty = 1;
    renderSellModal();
    if (els.sellModal) els.sellModal.classList.remove("is-hidden");
  }

  function renderSellModal() {
    if (!sellTarget) return;
    const it = keyItem(sellTarget);
    if (!it) return;
    if (els.sellName) els.sellName.textContent = itemLabel(sellTarget);
    if (els.sellCount) els.sellCount.textContent = String(sellQty);
    if (els.sellGain) els.sellGain.textContent = fmt(Math.round((it.value || 0) * sellQty));
    if (els.sellMinus) els.sellMinus.disabled = sellQty <= 1;
    if (els.sellPlus) els.sellPlus.disabled = sellQty >= sellMax;
  }

  function closeSellModal() {
    if (els.sellModal) els.sellModal.classList.add("is-hidden");
    sellTarget = null;
    sellOrigin = "bag";
  }

  function confirmSell() {
    if (!sellTarget) return;
    const key = sellTarget;
    const it = keyItem(key);
    if (!it) { closeSellModal(); return; }
    // 只从来源箱子扣：收获区点开只卖收获区，背包点开只卖背包，不会波及另一个箱子
    const map = sellOrigin === "harvest" ? state.harvest : state.bag;
    const have = map.get(key) || 0;
    const sold = Math.min(have, sellQty);
    if (sold <= 0) { closeSellModal(); return; }
    if (have - sold > 0) map.set(key, have - sold);
    else map.delete(key);
    const gain = Math.round((it.value || 0) * sold);
    state.player.gold += gain;
    renderBag();
    renderPlayer();
    if (els.bagPanel && !els.bagPanel.classList.contains("is-hidden")) renderBagPanel();
    hideItemDetail();
    closeSellModal();
    saveState();
    showToast(`出售「${qName(itemLabel(key), it.quality)}」×${sold}，获得 ${fmt(gain)} 金币`);
  }

  /* ---------------- 更换怪物 ---------------- */
  function buildAreaPicker() {
    els.areaPickerInner.innerHTML = "";
    for (const group of areaGroups) {
      // 「次元钥匙 / 血盟突袭」只能通过次元钥匙道具挑战，不是可进入的挂机地区
      if (group.cat === "次元钥匙") continue;
      const title = document.createElement("div");
      title.className = "area-group-title";
      title.textContent = group.cat;
      els.areaPickerInner.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "area-grid";
      for (const a of group.list) {
        const unlocked = areaUnlocked(state.player.level, a.minLevel);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "area-item" +
          (a.name === state.area ? " active" : "") +
          (unlocked ? "" : " locked");
        btn.title = unlocked
          ? `${a.name} · ${a.count} 只怪`
          : `需要 Lv${a.minLevel - AREA_LOCK_GAP} 才能进入（当前 Lv${state.player.level}）`;
        if (!unlocked) {
          btn.disabled = true;
          btn.innerHTML =
            `<span class="area-name">${esc(a.label)}</span><span class="area-lv">🔒 Lv${a.minLevel}</span>`;
        } else {
          btn.innerHTML =
            `<span class="area-name">${esc(a.label)}</span><span class="area-lv">Lv${a.minLevel}</span>`;
        }
        btn.addEventListener("click", ev => {
          ev.stopPropagation();
          selectArea(a.name);
        });
        grid.appendChild(btn);
      }
      els.areaPickerInner.appendChild(grid);
    }
  }

  function selectArea(name) {
    const info = areaInfo.find(a => a.name === name);
    // 锁定地区 / 次元钥匙地区不允许进入（次元钥匙只用于道具挑战 BOSS）
    if (!info || info.name === "次元钥匙" || !areaUnlocked(state.player.level, info.minLevel)) return;
    state.area = name;
    els.areaPicker.classList.remove("open");
    renderArea();
    buildAreaPicker();
    startBattle();
    saveState();
  }

  function openAreaPicker() {
    buildAreaPicker();
    els.areaPicker.classList.add("open");
    const active = els.areaPickerInner.querySelector(".area-item.active");
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "center" });
  }

  /* ---------------- 绑定 ---------------- */
  els.areaBtn.addEventListener("click", ev => {
    ev.stopPropagation();
    if (els.areaPicker.classList.contains("open")) {
      els.areaPicker.classList.remove("open");
    } else {
      openAreaPicker();
    }
  });
  // 点在面板空白处不关闭，点面板外才关闭
  els.areaPicker.addEventListener("click", ev => ev.stopPropagation());
  document.addEventListener("click", () => els.areaPicker.classList.remove("open"));

  // 装备详情 / 属性详情：切换左侧面板的三个视图（尺寸一致）
  els.equipBtn.addEventListener("click", showEquipPanel);
  els.statsBtn.addEventListener("click", showStatsPanel);
  els.equipBack.addEventListener("click", showPlayerPanel);
  els.statsBack.addEventListener("click", showPlayerPanel);

  // 属性详情翻页：左右小箭头
  if (els.statsPrev) els.statsPrev.addEventListener("click", ev => { ev.stopPropagation(); turnStatsPage(-1); });
  if (els.statsNext) els.statsNext.addEventListener("click", ev => { ev.stopPropagation(); turnStatsPage(1); });

  // 勇者信息版左侧的 HP / 攻击力 / 防御等级：点击属性名弹出说明气泡
  for (const [id, key] of [["statHpTip", "hp"], ["statAtkTip", "atk"], ["statDefTip", "def"]]) {
    const el = $(id);
    const def = STAT_DEFS.find(d => d.key === key);
    if (!el || !def) continue;
    el.addEventListener("click", ev => {
      ev.stopPropagation();
      showStatTip(el, def.tip);
    });
  }

  // MP 单独一个说明气泡，不占属性详情的 8 行
  const mpTipEl = $("statMpTip");
  if (mpTipEl) {
    mpTipEl.addEventListener("click", ev => {
      ev.stopPropagation();
      showStatTip(mpTipEl, "释放技能时会消耗法力值，没有法力值时无法使用技能");
    });
  }

  // 点页面空白处关闭属性说明气泡
  document.addEventListener("click", () => els.statTip.classList.remove("show"));

  els.sellBtn.addEventListener("click", harvestAll);

  // 自动出售：白色 / 绿色装备
  function renderAutoSell() {
    if (els.autoSellWhite) els.autoSellWhite.checked = !!state.autoSell.white;
    if (els.autoSellGreen) els.autoSellGreen.checked = !!state.autoSell.green;
  }
  if (els.autoSellBtn) els.autoSellBtn.addEventListener("click", () => {
    renderAutoSell();
    els.autoSellModal.classList.remove("is-hidden");
  });
  if (els.autoSellClose) els.autoSellClose.addEventListener("click", () => els.autoSellModal.classList.add("is-hidden"));
  // 点弹窗外面关闭（无遮罩）
  document.addEventListener("click", (e) => {
    if (!els.autoSellModal || els.autoSellModal.classList.contains("is-hidden")) return;
    const t = e.target;
    if (els.autoSellModal.contains && els.autoSellModal.contains(t)) return;
    if (t === els.autoSellBtn || (els.autoSellBtn && els.autoSellBtn.contains && els.autoSellBtn.contains(t))) return;
    els.autoSellModal.classList.add("is-hidden");
  });
  if (els.autoSellWhite) els.autoSellWhite.addEventListener("change", () => {
    state.autoSell.white = !!els.autoSellWhite.checked;
    renderAutoSell();
    saveState();
  });
  if (els.autoSellGreen) els.autoSellGreen.addEventListener("change", () => {
    state.autoSell.green = !!els.autoSellGreen.checked;
    renderAutoSell();
    saveState();
  });

  // 背包（勇者信息版内）/ 制作 / 商店
  if (els.bagBtn) els.bagBtn.addEventListener("click", toggleBagPanel);
  // 商店：打开面板 / 关闭 / 页签切换
  if (els.shopBtn) els.shopBtn.addEventListener("click", openShopPanel);
  if (els.shopClose) els.shopClose.addEventListener("click", closeShopPanel);

  // 怪物图鉴 / 冒险手册：右上角入口 + 面板开关
  const openGuidePanel = panel => {
    if (!panel) return;
    els.areaPicker.classList.remove("open");
    panel.classList.remove("is-hidden");
  };
  const closeGuidePanel = panel => {
    if (panel) panel.classList.add("is-hidden");
  };

  // 怪物图鉴：大类 → 地区 → 怪物卡片（只列普通怪与首领，精英副本不进图鉴）
  const bestiaryState = { cat: null, area: null };
  function renderBestiary() {
    const catsEl = els.bestiaryCats, areasEl = els.bestiaryAreas, mobsEl = els.bestiaryMobs;
    if (!catsEl || !areasEl || !mobsEl) return;
    if (!bestiaryState.cat || !areaGroups.some(g => g.cat === bestiaryState.cat)) {
      bestiaryState.cat = areaGroups[0].cat;
    }
    catsEl.innerHTML = "";
    for (const g of areaGroups) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bestiary-cat" + (g.cat === bestiaryState.cat ? " active" : "");
      b.innerHTML = `<span class="bc-name">${esc(g.cat)}</span><span class="bc-meta">${g.list.length} 个地区</span>`;
      b.addEventListener("click", () => {
        bestiaryState.cat = g.cat;
        bestiaryState.area = g.list[0] ? g.list[0].name : null;
        renderBestiary();
      });
      catsEl.appendChild(b);
    }
    const group = areaGroups.find(g => g.cat === bestiaryState.cat) || areaGroups[0];
    const areas = group ? group.list : [];
    if (!bestiaryState.area || !areas.some(a => a.name === bestiaryState.area)) {
      bestiaryState.area = areas[0] ? areas[0].name : null;
    }
    areasEl.innerHTML = "";
    for (const a of areas) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bestiary-area" + (a.name === bestiaryState.area ? " active" : "");
      const lv = a.mobMin === a.mobMax ? `Lv${a.mobMin}` : `Lv${a.mobMin}~${a.mobMax}`;
      b.innerHTML = `<span class="ba-name">${esc(a.label)}</span><span class="ba-lv">${lv}</span>`;
      b.addEventListener("click", () => {
        bestiaryState.area = a.name;
        renderBestiary();
      });
      areasEl.appendChild(b);
    }
    mobsEl.innerHTML = "";
    const cur = areas.find(a => a.name === bestiaryState.area);
    const list = (areaMap.get(bestiaryState.area) || []).slice().sort((x, y) =>
      (y.boss ? 1 : 0) - (x.boss ? 1 : 0) || y.level - x.level || x.name.localeCompare(y.name, "zh"));
    if (!list.length) {
      mobsEl.innerHTML = `<div class="guide-empty">该地区暂无怪物</div>`;
      return;
    }
    const head = document.createElement("div");
    head.className = "bestiary-mobs-head";
    head.innerHTML = `<span>${esc(cur ? cur.label : "")}</span><span>${list.length} 只</span>`;
    mobsEl.appendChild(head);
    const grid = document.createElement("div");
    grid.className = "bestiary-grid";
    for (const m of list) {
      const card = document.createElement("div");
      card.className = "bestiary-mob" + (m.boss ? " boss" : "");
      const dropIds = [...new Set(m.drops || [])]
        .filter(id => ITEMS[id])
        .sort((a, b) => ITEMS[b].quality - ITEMS[a].quality || String(a).localeCompare(String(b)));
      const drops = dropIds.map(id => {
        const it = ITEMS[id];
        if (!it) return "";
        return `<span class="bestiary-drop q${it.quality}" data-item="${it.id}" title="${esc(it.name)}"><img src="${iconSrc(it)}" alt="" loading="lazy"></span>`;
      }).join("");
      card.innerHTML = `
        <div class="bm-top">
          <span class="bm-name${m.boss ? " boss" : ""}">${m.boss ? "[首领] " : ""}${esc(m.name)}</span>
          <span class="bm-lv">Lv${m.level}</span>
        </div>
        <div class="bm-stats">
          <span>HP <b>${m.hp}</b></span>
          <span>攻击 <b>${m.atk}</b></span>
          <span>防御等级 <b>${m.def}</b></span>
        </div>
        <div class="bm-drops-wrap">
          <div class="bm-drops">${drops}</div>
          <button class="bestiary-more is-hidden" type="button">展开全部</button>
        </div>
      `;
      grid.appendChild(card);
    }
    mobsEl.appendChild(grid);
    // 掉落图标可点：打开只读道具详情
    grid.querySelectorAll(".bestiary-drop").forEach(el => {
      const it = ITEMS[el.dataset.item];
      if (it) bindItemClick(el, itemKey(it.id), false, "view");
    });
    // 掉落图标实际超出一行时才显示「展开全部」；展开后可收起
    grid.querySelectorAll(".bm-drops-wrap").forEach(wrap => {
      const dropsEl = wrap.querySelector(".bm-drops");
      const moreBtn = wrap.querySelector(".bestiary-more");
      if (!dropsEl || !moreBtn) return;
      if (dropsEl.scrollWidth > dropsEl.clientWidth + 1) moreBtn.classList.remove("is-hidden");
      moreBtn.addEventListener("click", ev => {
        ev.stopPropagation();
        const expanded = dropsEl.classList.toggle("expanded");
        moreBtn.textContent = expanded ? "收起" : "展开全部";
      });
    });
  }

  if (els.bestiaryBtn) els.bestiaryBtn.addEventListener("click", () => {
    openGuidePanel(els.bestiaryPanel);
    renderBestiary();
  });
  if (els.bestiaryClose) els.bestiaryClose.addEventListener("click", () => closeGuidePanel(els.bestiaryPanel));
  if (els.bestiaryPanel) els.bestiaryPanel.addEventListener("click", ev => {
    if (ev.target === els.bestiaryPanel) closeGuidePanel(els.bestiaryPanel);
  });
  // 冒险手册：书本 + 左侧页签 + 右侧内容（文字 / 列表 / 图片）
  const MANUAL_PAGES = [
    {
      id: "goal", title: "冒险目标", ico: "🎯", hero: "manual/bg_1.jpg",
      body: [
        { type: "p", text: "本游戏支持网页游玩，手机游玩建议横屏进行操作。", cls: "manual-red" },
        { type: "p", text: "网页版地址：https://xlz114514.github.io/lineage/", cls: "manual-url" },
        { type: "p", text: "欢迎来到亚丁大陆，勇士！" },
        { type: "p", text: "这片大陆拥有无尽的财富，强大的力量，危险的怪物，等待着勇士们创造属于自己的传奇故事。" },
        { type: "p", text: "这本冒险手册能够帮助初次踏入冒险的勇士熟悉基本的生存技巧和操作，以帮助勇士更好的存活下来，您随时可以在界面的右上角找到冒险手册并重新阅读它。" },
        { type: "p", text: "建议您先尝试通过狩猎30级以下地区的怪物收集齐一身基础的装备，并尽可能地使用怪物掉落的强化卷轴将装备强化至安全等级，这能够帮助你轻松的征服初始地区。毕竟，真正邪恶的怪物们并不是赤手空拳的冒险者能应付的。" },
        { type: "p", text: "如果您在冒险途中有幸获得了稀有物品，不要犹豫，合理使用，将它们化作力量，征服更强大的敌人吧！" },
        { type: "p", text: "愿殷海萨女神的祝福与您同在。" },
        { type: "p", text: "累计击杀怪物： XXXXX 只" },
        { type: "p", text: "累计获得战利品价值：XXXXXX 金币" },
        { type: "p", text: "本游戏可以进行离线游玩，最多保存24小时收益" },
        { type: "p", text: "制作者：花火   摸鱼群：399897529（请注明来意）" },
      ],
    },
    {
      id: "attr", title: "属性", ico: "📊", hero: "manual/bg_1.jpg",
      body: [
        { type: "p", text: "属性 决定了你的角色强度，你可以在勇士信息版上找到查看属性详情的入口。" },
        { type: "img", src: "manual/doc_1.png" },
        { type: "img", src: "manual/doc_2.png" },
        { type: "p", text: "这个界面会展示您的各项属性，您可以通过点击属性的图标来查看这项属性的作用。" },
        { type: "p", text: "属性可以通过装备，技能或者万能药进行提升。" },
        { type: "p", text: "游戏初期，建议您先以提高攻击力和防御等级为目标。" },
      ],
    },
    {
      id: "monster", title: "怪物", ico: "👹", hero: "manual/bg_2.jpg",
      body: [
        { type: "p", text: "怪物 是您从亚丁大陆获取资源的主要途径。您无时无刻都在与怪物们进行战斗。" },
        { type: "img", src: "manual/doc_3.png" },
        { type: "p", text: "您可以在界面的右边查看到怪物的所有信息，也可以通过查看怪物图鉴浏览所有怪物的资料。与怪物的战斗是自动进行的。战斗结束后，勇者会立刻搜寻新的怪物，恢复状态，并开始新的战斗。" },
        { type: "img", src: "manual/doc_4.png" },
        { type: "p", text: "您可以在日志区域查看与怪物战斗的过程。" },
        { type: "p", text: "普通怪物有小概率变异为精英，精英怪物更加强大，但必定会掉落宝物。" },
        { type: "p", text: "如果本地区有首领，您随时都有极小概率遇到本地区的首领，首领极为强大，但奖励也同等丰厚。" },
        { type: "p", text: "您可以通过上方的选择地区更换您战斗的地区，建议您选择适合自己等级的地区。" },
      ],
    },
    {
      id: "equip", title: "装备", ico: "🛡", hero: "manual/bg_2.jpg",
      body: [
        { type: "p", text: "装备 是您提高属性的主要手段，一位强大的勇士离不开精良的装备。" },
        { type: "p", text: "您可以通过装备详情按钮查看您正在穿戴的装备，也可以从背包内查看您正在装备的物品。" },
        { type: "img", src: "manual/doc_5.png" },
        { type: "img", src: "manual/doc_6.png" },
        { type: "p", text: "装备主要通过怪物掉落和制作获得，如果您获得了强大的装备，请一定要对装备进行强化和祝福，强化和祝福所需要的道具可以从各种怪物，制作和商店获取。" },
        { type: "p", text: "强化超过安定值后有概率失败。" },
        { type: "p", text: "多余的装备可以出售，或是在商店-炼金工房中尝试进行炼金。" },
      ],
    },
    {
      id: "item", title: "道具", ico: "🧪", hero: "manual/bg_2.jpg",
      body: [
        { type: "p", text: "道具 是游戏内所有物品的统称。怪物掉落的道具会进入界面下方的收货区，收货区的道具虽然也可以使用，但是背包内的道具才能参与制作。" },
        { type: "img", src: "manual/doc_7.png" },
        { type: "p", text: "道具大致分为装备，消耗品，材料和其他4种，其中装备主要用于提供您的基础属性。消耗品主要用于在一定时间内提高您的属性。材料主要用于制作新的道具。其他类别的道具多种多样，还请您多多探索。" },
        { type: "img", src: "manual/doc_8.png" },
        { type: "p", text: "点击任意道具的图标可以查看道具的详情，您可以在道具详情界面查看道具的说明，道具的用途和道具的获取来源，以及出售道具。请多加利用这个功能。" },
        { type: "p", text: "您可以任意拖动道具和背包窗口，以适应您的习惯。" },
      ],
    },
    {
      id: "skill", title: "技能", ico: "✨", hero: "manual/bg_2.jpg",
      body: [
        { type: "p", text: "技能 是勇士能够掌握的独特技艺。您可以从各种途径获得多种多样的技能书。使用技能书可以学习和强化对应的技能。" },
        { type: "p", text: "您可以通过技能入口打开技能图鉴。" },
        { type: "img", src: "manual/doc_9.png" },
        { type: "img", src: "manual/doc_10.png" },
        { type: "p", text: "技能分为主动技能和被动技能2种。勇者只能同时装备5个主动技能和5个被动技能。您正在装备的技能会显示在“我的技能”栏位。您随时可以在技能详情界面激活和取消您已经掌握的技能。" },
        { type: "p", text: "被动技能只要激活了就可以生效。主动技能在满足条件的时候会主动触发，消耗法力值并产生一些效果，如果您的法力值不足，您将无法释放主动技能。" },
      ],
    },
    {
      id: "craft", title: "制作", ico: "🔨", hero: "manual/bg_1.jpg",
      body: [
        { type: "p", text: "制作 是一种通过消耗材料以合成其他道具的过程。" },
        { type: "p", text: "您可以点击制作按钮打开制作列表。" },
        { type: "img", src: "manual/doc_11.png" },
        { type: "img", src: "manual/doc_12.png" },
        { type: "p", text: "如果您有足够的材料，可以消耗材料并制作多种多样的道具。部分制作配方可以选择不同的材料，部分物品的配方不止一种。" },
        { type: "p", text: "制作 可以生产出许多狩猎中难以获得的强大物品，请多加利用。" },
      ],
    },
    {
      id: "shop", title: "商店", ico: "🏪", hero: "manual/bg_1.jpg",
      body: [
        { type: "p", text: "商店 包含了多种功能，您可以将金币或者多余的物资在这里换成更加有用的资源，有时甚至可以获得巨大的惊喜！" },
        { type: "p", text: "您可以点击商店按钮打开商店界面。" },
        { type: "img", src: "manual/doc_13.png" },
        { type: "img", src: "manual/doc_14.png" },
        { type: "p", text: "杂货店：您可以在这里无限量购买各种药剂和杂货，药剂可以在一定时间提高您的战斗力。" },
        { type: "p", text: "铁匠铺：您可以在这里购买到各种装备，每天都会刷新，偶尔会出现强力的装备。" },
        { type: "p", text: "黑市：您可以在这里购买到大量平时难以获得的稀缺物品，它们价格昂贵，并且每天都会刷新。" },
        { type: "p", text: "炼金工房：您可以在这里将多余的装备和技能书进行炼金，有时候会获得难以置信的丰厚奖励。" },
      ],
    },
  ];
  const manualState = { page: null };
  function renderManual(pageId) {
    const pages = MANUAL_PAGES;
    const page = pages.find(p => p.id === pageId) || pages[0];
    manualState.page = page.id;
    if (els.manualTabs) {
      els.manualTabs.innerHTML = "";
      for (const p of pages) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "manual-tab" + (p.id === page.id ? " active" : "");
        b.innerHTML = `<span class="manual-tab-ico">${p.ico || ""}</span>${esc(p.title)}`;
        b.addEventListener("click", () => renderManual(p.id));
        els.manualTabs.appendChild(b);
      }
    }
    if (els.manualHero) {
      els.manualHero.innerHTML = page.hero ? `<img src="${page.hero}" alt="">` : esc(page.title);
    }
    if (!els.manualContent) return;
    els.manualContent.innerHTML = "";
    if (!page.body || !page.body.length) {
      els.manualContent.innerHTML = '<div class="manual-empty">这一页还在书写中……</div>';
      return;
    }
    for (const item of page.body) {
      if (item.type === "title") {
        const h = document.createElement("h3");
        h.textContent = item.text;
        els.manualContent.appendChild(h);
      } else if (item.type === "p") {
        const p = document.createElement("p");
        let text = item.text;
        if (text.includes("累计击杀怪物")) {
          text = `累计击杀怪物： ${fmt(state.kills || 0)} 只`;
        } else if (text.includes("累计获得战利品价值")) {
          text = `累计获得战利品价值：${fmt(state.lootValue || 0)} 金币`;
        }
        p.textContent = text;
        if (item.cls) p.className = item.cls;
        els.manualContent.appendChild(p);
      } else if (item.type === "list") {
        const ul = document.createElement("ul");
        for (const li of item.items) {
          const el = document.createElement("li");
          el.textContent = li;
          ul.appendChild(el);
        }
        els.manualContent.appendChild(ul);
      } else if (item.type === "img") {
        const img = document.createElement("img");
        img.src = item.src;
        img.alt = item.alt || "";
        els.manualContent.appendChild(img);
      }
    }
  }

  if (els.adventureBtn) els.adventureBtn.addEventListener("click", () => {
    openGuidePanel(els.adventurePanel);
    renderManual(manualState.page);
  });
  if (els.adventureClose) els.adventureClose.addEventListener("click", () => closeGuidePanel(els.adventurePanel));
  if (els.adventurePanel) els.adventurePanel.addEventListener("click", ev => {
    if (ev.target === els.adventurePanel) closeGuidePanel(els.adventurePanel);
  });

  // 炼金工房：开始 / 掉落预览 / 分类 / 槽位取出
  if (els.alchemyStart) els.alchemyStart.addEventListener("click", doAlchemy);
  if (els.alchemyPreview) {
    // 真机上偶发 click 丢失：同时监听 touchend，保证「掉落预览」一定能打开
    const openPreview = (ev) => {
      if (ev) ev.preventDefault();
      renderAlchemyPreview(true);
    };
    els.alchemyPreview.addEventListener("click", openPreview);
    els.alchemyPreview.addEventListener("touchend", openPreview);
  }
  if (els.alchemyPreviewClose) {
    els.alchemyPreviewClose.addEventListener("click", () => renderAlchemyPreview(false));
  }
  if (els.alchemyPreviewModal) {
    els.alchemyPreviewModal.addEventListener("click", (ev) => {
      if (ev.target === els.alchemyPreviewModal) renderAlchemyPreview(false);
    });
  }
  if (els.alchemyPreviewTabs) {
    els.alchemyPreviewTabs.querySelectorAll(".alchemy-preview-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        alchemyPreviewQ = Number(btn.dataset.q);
        renderAlchemyPreview(true);
      });
    });
  }
  if (els.alchemyKinds) {
    els.alchemyKinds.querySelectorAll(".alchemy-kind").forEach(btn => {
      btn.addEventListener("click", () => {
        alchemyKind = btn.dataset.kind;
        renderAlchemyPanel();
      });
    });
  }
  if (els.alchemyPanel) {
    els.alchemyPanel.querySelectorAll(".alchemy-slot").forEach(slotEl => {
      slotEl.addEventListener("click", () => {
        const idx = Number(slotEl.dataset.slot);
        if (alchemySlots[idx]) {
          alchemySlots[idx] = null;
          renderAlchemyPanel();
        }
      });
    });
  }
  if (els.shopTabs) {
    els.shopTabs.querySelectorAll(".shop-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        shopTab = btn.dataset.shop;
        renderShopTabs();
        renderShopGoods();
      });
    });
  }
  document.querySelectorAll(".loot-btn").forEach(btn => {
    if (btn.dataset.panel === "制作" || btn.id === "shopBtn") return;
    btn.addEventListener("click", () => {
      showToast(`「${btn.dataset.panel}」功能尚未开放`);
    });
  });

  // 道具详情：只能点 × 关闭；点其他道具图标会直接切换成那个道具的详情
  els.itemCard.addEventListener("click", ev => ev.stopPropagation());
  els.itemClose.addEventListener("click", ev => {
    ev.stopPropagation();
    hideItemDetail();
  });

  // 出售弹窗：数量加减 / 全部 / 取消 / 确认
  if (els.sellMinus) els.sellMinus.addEventListener("click", () => {
    sellQty = Math.max(1, sellQty - 1);
    renderSellModal();
  });
  if (els.sellPlus) els.sellPlus.addEventListener("click", () => {
    sellQty = Math.min(sellMax, sellQty + 1);
    renderSellModal();
  });
  if (els.sellMax) els.sellMax.addEventListener("click", () => {
    sellQty = sellMax;
    renderSellModal();
  });
  if (els.sellCancel) els.sellCancel.addEventListener("click", closeSellModal);
  if (els.sellConfirm) els.sellConfirm.addEventListener("click", confirmSell);
  if (els.sellModal) {
    els.sellModal.addEventListener("click", ev => {
      if (ev.target === els.sellModal) closeSellModal();
    });
  }
  // 获得来源弹窗：点遮罩关闭
  if (els.sourceModal) {
    els.sourceModal.addEventListener("click", ev => {
      if (ev.target === els.sourceModal) closeSource();
    });
  }
  // 选择弹窗（万能药 / 灵药箱）
  if (els.choiceClose) els.choiceClose.addEventListener("click", closeChoice);
  if (els.choiceMinus) els.choiceMinus.addEventListener("click", () => setChoiceQty(choiceQtyValue - 1));
  if (els.choicePlus) els.choicePlus.addEventListener("click", () => setChoiceQty(choiceQtyValue + 1));
  if (els.choiceMax) els.choiceMax.addEventListener("click", () => setChoiceQty(choiceMaxCount));
  if (els.choiceConfirm) els.choiceConfirm.addEventListener("click", confirmChoice);
  // 开箱结果弹窗
  if (els.rewardClose) els.rewardClose.addEventListener("click", closeReward);
  if (els.rewardOk) els.rewardOk.addEventListener("click", closeReward);
  if (els.rewardModal) {
    els.rewardModal.addEventListener("click", ev => {
      if (ev.target === els.rewardModal) closeReward();
    });
  }
  if (els.choiceModal) {
    els.choiceModal.addEventListener("click", ev => {
      if (ev.target === els.choiceModal) closeChoice();
    });
  }
  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape") {
      hideItemDetail();
      closeSource();
      els.statTip.classList.remove("show");
      showPlayerPanel();
    }
  });

  window.addEventListener("beforeunload", saveState);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // 记录进入后台的时刻；后台不再跑战斗，回前台时统一补结算
      if (!hiddenAt) hiddenAt = Date.now();
      lastTickAt = hiddenAt;
      saveState();
    } else {
      resumeFromHidden();
    }
  });

  /* ---------------- 启动 ---------------- */
  // 调试入口：URL 带 ?give=物品ID,物品ID 时，启动后把这些道具直接放进背包（每次刷新都会加）
  function applyDebugGive() {
    let search = "";
    try {
      search = (typeof location !== "undefined" && location && location.search) || "";
    } catch (e) {
      return;   // 测试桩里没有 location
    }
    const m = String(search).match(/[?&]give=([^&]+)/);
    if (!m) return;
    const ids = decodeURIComponent(m[1]).split(",").map(s => s.trim()).filter(Boolean);
    let added = 0;
    for (const id of ids) {
      const item = ITEMS[id];
      if (!item) continue;
      const key = itemKey(item.id, 0, 0);
      state.bag.set(key, (state.bag.get(key) || 0) + 1);
      added++;
    }
    if (added) {
      saveState();
      renderBag();
    }
  }

  // 调试入口：URL 带 ?resetshop=1 时清空铁匠铺 / 黑市库存，下次打开商店重新进货
  function applyDebugResetShop() {
    let search = "";
    try {
      search = (typeof location !== "undefined" && location && location.search) || "";
    } catch (e) {
      return;
    }
    if (!/[?&]resetshop=1/.test(String(search))) return;
    state.shopStock = null;
    saveState();
    showToast("商店库存已重置，重新进货");
  }

  const saved = loadSave();
  const isNewPlayer = !saved;
  if (saved) applySave(saved);
  else recalcStats();   // 无存档时也走一遍汇总，保证 base → 最终属性一致
  applyDebugGive();
  applyDebugResetShop();
  resumeAutoConsumables();   // 自动使用：读档后补吃已过期的 buff

  buildAreaPicker();
  startBattle();
  renderBag();
  renderPlayer();
  renderActiveBuffs();
  renderTimer();
  showPlayerPanel();   // 初始固定显示勇者信息版（不依赖 HTML 上的 class）
  renderAutoSell();

  // 第一次游玩：新手礼包（长剑 + 2000 金币）+ 自动打开冒险手册
  const skipNewbie = !!(typeof window !== "undefined" && window && window.__noNewbie);
  if (isNewPlayer && !skipNewbie) {
    state.player.gold = 2000;
    state.bag.set(itemKey("77"), 1);   // 长剑
    renderPlayer();
    renderBag();
    saveState();
    openGuidePanel(els.adventurePanel);
    renderManual(manualState.page);
  }

  if (saved) {
    // activeAt 是最后一次真正战斗/进入后台的时间；旧存档没有这个字段，回退到 savedAt。
    // 存档里的 elapsed 已经包含 activeAt → savedAt 这段真实时间，
    // 先扣掉再让 settleOffline 从 activeAt 重新补，避免计时器翻倍。
    const activeAt = saved.activeAt || saved.savedAt;
    const savedAt = saved.savedAt || activeAt;
    const saveGap = Math.max(0, (savedAt - activeAt) / 1000);
    // 只有真的会结算（>= 60 秒）时才扣 saveGap；不足 60 秒不补掉落，
    // 计时器也不应该被扣掉。
    if ((Date.now() - activeAt) / 1000 >= 60 && saveGap > 0) {
      state.elapsedBase = Math.max(0, state.elapsedBase - saveGap);
    }
    settleOffline(activeAt, state.area);
  }

  setInterval(tick, 1000);
  setInterval(renderTimer, 1000);
  setInterval(saveState, 10000);
  setInterval(tickCooldownMasks, 1000);
  setInterval(updateShopTimer, 1000);
})();

