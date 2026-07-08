/* ============================================================
 *  data.js —— 数据层（UMD）
 *  内置默认配表（与 data/*.csv 同步）+ CSV 解析 / 热加载。
 *  热加载采用「可变 state 对象」：reload() 重赋值 state.*，
 *  其余模块在「调用时」读取 state.*，因此热加载对全局即时生效。
 * ============================================================ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    global.RULES_DATA = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  /* ---------- 默认配表（与 CSV 配表一致）---------- */
  const DEFAULTS = {
    TERRAIN: {
      plain:{name:'平原',move:1.0,atk:1.0,def:1.0,cav:1.15,inf:1.0,arch:1.0,eng:0.9,scout:1.0,ambush:0,flood:0,choke:0,marchDmg:0,color:'#cfe8a9'},
      hill:{name:'丘陵',move:0.8,atk:1.0,def:1.15,cav:0.9,inf:1.1,arch:1.1,eng:1.0,scout:0.9,ambush:0.1,flood:0,choke:0,marchDmg:0,color:'#bcd99a'},
      mountain:{name:'山地',move:0.6,atk:0.9,def:1.3,cav:0.7,inf:1.15,arch:1.0,eng:0.8,scout:0.8,ambush:0.2,flood:0,choke:1,marchDmg:0,color:'#9fae7a'},
      forest:{name:'森林',move:0.8,atk:1.0,def:1.1,cav:0.85,inf:1.0,arch:1.15,eng:0.9,scout:0.7,ambush:0.3,flood:0,choke:0,marchDmg:0,color:'#7fae6b'},
      swamp:{name:'沼泽',move:0.5,atk:0.95,def:0.95,cav:0.6,inf:0.9,arch:0.9,eng:0.7,scout:0.9,ambush:0.1,flood:0.2,choke:0,marchDmg:0.06,color:'#a8b18c'},
      river:{name:'河流',move:0.1,atk:1.0,def:1.0,cav:0.5,inf:0.8,arch:1.0,eng:1.2,scout:0.6,ambush:0,flood:1,choke:0,marchDmg:0,color:'#7fb6d6'},
      lowland:{name:'低洼盆地',move:0.9,atk:0.95,def:0.85,cav:1.0,inf:0.95,arch:1.0,eng:0.9,scout:1.0,ambush:0,flood:0.6,choke:0,marchDmg:0,color:'#c9d8a0'},
      defile:{name:'峡谷隘口',move:0.6,atk:0.9,def:1.35,cav:0.7,inf:1.1,arch:1.0,eng:0.8,scout:0.8,ambush:0.35,flood:0,choke:1,marchDmg:0,color:'#8c9a6e'},
      city:{name:'城池关隘',move:1.0,atk:1.0,def:1.5,cav:0.9,inf:1.1,arch:1.0,eng:1.3,scout:0.9,ambush:0.05,flood:0,choke:1,marchDmg:0,color:'#d8c98c'},
      desert:{name:'荒漠戈壁',move:0.7,atk:1.0,def:1.0,cav:1.0,inf:0.9,arch:1.0,eng:0.8,scout:1.1,ambush:0,flood:0,choke:0,marchDmg:0.04,color:'#e3d6a0'},
      tundra:{name:'雪原冰原',move:0.6,atk:1.0,def:1.05,cav:0.8,inf:1.0,arch:0.95,eng:0.8,scout:0.9,ambush:0.1,flood:0,choke:0,marchDmg:0.03,color:'#dfe7ee'},
      bridge:{name:'桥梁栈道',move:1.0,atk:1.0,def:1.0,cav:0.9,inf:1.0,arch:1.0,eng:1.0,scout:1.0,ambush:0,flood:0,choke:1,marchDmg:0,color:'#c2b08a'}
    },
    WEATHER: {
      sun:{name:'晴',move:1.0,atk:1.0,def:1.0,fire:1.0,cav:1.0,scout:1.0,flood:0.0,morale:0},
      rain:{name:'雨',move:0.8,atk:1.0,def:1.0,fire:0.2,cav:0.8,scout:0.9,flood:1.5,morale:-5},
      snow:{name:'雪严寒',move:0.7,atk:1.0,def:1.0,fire:1.4,cav:0.8,scout:0.9,flood:0.5,morale:-8},
      wind:{name:'大风',move:1.0,atk:1.0,def:1.0,fire:1.5,cav:1.0,scout:1.0,flood:0.6,morale:0},
      fog:{name:'大雾',move:0.9,atk:1.0,def:1.0,fire:1.0,cav:1.0,scout:0.4,flood:1.0,morale:0},
      drought:{name:'酷暑旱',move:0.9,atk:1.0,def:1.0,fire:1.8,cav:1.0,scout:1.1,flood:0.2,morale:-6}
    },
    SEASON: {
      spring:{name:'春',grain:1.1,w:{rain:3,sun:3,fog:1,snow:1,wind:1,drought:0}},
      summer:{name:'夏',grain:1.2,w:{rain:2,sun:4,fog:1,snow:0,wind:1,drought:2}},
      autumn:{name:'秋',grain:1.0,w:{rain:2,sun:3,fog:1,snow:0,wind:2,drought:1}},
      winter:{name:'冬',grain:0.7,w:{rain:1,sun:2,fog:1,snow:4,wind:1,drought:0}}
    },
    FORMATIONS: {
      fengshi:{name:'锋矢',atk:1.2,def:0.85,morale:1.0,flank:0.9,reqInt:0},
      heyi:{name:'鹤翼',atk:1.0,def:1.0,morale:1.0,flank:1.3,reqInt:0},
      fangyuan:{name:'方圆',atk:0.9,def:1.3,morale:1.1,flank:0.9,reqInt:0},
      bazhen:{name:'八阵',atk:1.05,def:1.1,morale:1.0,flank:1.0,reqInt:90},
      yanxing:{name:'雁行',atk:1.1,def:0.95,morale:1.0,flank:1.1,reqInt:0},
      yulin:{name:'鱼鳞',atk:0.95,def:1.2,morale:1.05,flank:0.95,reqInt:0}
    },
    GENERALS: [
      {id:'cao1',name:'曹操',star:5,force:92,intellect:89,leadership:96,speed:78,style:'鹰扬',trait:'多疑',troop:'骑',suit:'S',skill:'奸雄',skillDesc:'每回合概率提升全军攻击并降低敌方防御'},
      {id:'liu1',name:'刘备',star:5,force:75,intellect:82,leadership:90,speed:70,style:'持重',trait:'仁德',troop:'步',suit:'S',skill:'仁德',skillDesc:'提升全军士气与伤兵恢复'},
      {id:'sun1',name:'孙权',star:4,force:78,intellect:84,leadership:88,speed:76,style:'奇变',trait:'沉稳',troop:'弓',suit:'A',skill:'制衡',skillDesc:'概率使敌方主动战法失效并反弹'},
      {id:'guan1',name:'关羽',star:5,force:97,intellect:75,leadership:95,speed:80,style:'鹰扬',trait:'刚烈',troop:'步',suit:'S',skill:'威震华夏',skillDesc:'对兵力最高敌军造成巨额兵刃伤害并震慑'},
      {id:'zhang1',name:'张飞',star:5,force:98,intellect:52,leadership:92,speed:85,style:'鹰扬',trait:'短虑',troop:'步',suit:'A',skill:'咆哮',skillDesc:'高概率混乱敌军前排'},
      {id:'zhao1',name:'赵云',star:5,force:96,intellect:76,leadership:93,speed:95,style:'鹰扬',trait:'沉稳',troop:'骑',suit:'S',skill:'龙胆',skillDesc:'突击多次且免疫首次控制'},
      {id:'zhu1',name:'诸葛亮',star:5,force:55,intellect:100,leadership:85,speed:72,style:'奇变',trait:'多疑',troop:'步',suit:'S',skill:'空城',skillDesc:'残血时大幅提升防御并使敌方命中下降'},
      {id:'zhou1',name:'周瑜',star:5,force:72,intellect:96,leadership:90,speed:83,style:'奇变',trait:'傲岸',troop:'弓',suit:'S',skill:'火攻',skillDesc:'火系伤害翻倍并点燃地形'},
      {id:'sima1',name:'司马懿',star:5,force:68,intellect:97,leadership:91,speed:74,style:'持重',trait:'隐忍',troop:'步',suit:'S',skill:'鹰视',skillDesc:'持续偷取敌军属性并削弱'},
      {id:'lv1',name:'吕布',star:5,force:100,intellect:35,leadership:85,speed:98,style:'鹰扬',trait:'短虑',troop:'骑',suit:'S',skill:'无双',skillDesc:'极高兵刃爆发，但易被混乱'},
      {id:'huang1',name:'黄忠',star:4,force:94,intellect:62,leadership:88,speed:79,style:'持重',trait:'老当益壮',troop:'弓',suit:'S',skill:'百步',skillDesc:'远程暴击并破防'},
      {id:'lu1',name:'陆逊',star:5,force:70,intellect:95,leadership:89,speed:80,style:'奇变',trait:'沉稳',troop:'弓',suit:'S',skill:'火烧连营',skillDesc:'火攻蔓延且施加灼烧'}
    ]
  };

  // 可变 state：热加载时只重赋值属性，不换对象 → 所有引用保持有效
  const state = {
    TERRAIN:   DEFAULTS.TERRAIN,
    WEATHER:   DEFAULTS.WEATHER,
    SEASON:    DEFAULTS.SEASON,
    FORMATIONS:DEFAULTS.FORMATIONS,
    GENERALS:  DEFAULTS.GENERALS
  };

  /* ---------- CSV 解析 / 转换 ---------- */
  function num(v, d) { const n = parseFloat(v); return isNaN(n) ? (d || 0) : n; }
  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/); if (!lines.length) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    const out = [];
    for (let i = 1; i < lines.length; i++) { const line = lines[i]; if (!line.trim()) continue;
      const vals = line.split(','); const o = {}; headers.forEach((h, j) => o[h] = (vals[j] !== undefined ? vals[j].trim() : '')); out.push(o); }
    return out;
  }
  function toTerrain(rows){ const o={}; rows.forEach(r=>{ o[r.key]={name:r.name,color:r.color,move:num(r.move,1),atk:num(r.atk,1),def:num(r.def,1),cav:num(r.cav,1),inf:num(r.inf,1),arch:num(r.arch,1),eng:num(r.eng,1),scout:num(r.scout,1),ambush:num(r.ambush,0),flood:num(r.flood,0),choke:num(r.choke,0),marchDmg:num(r.marchDmg,0)}; }); return o; }
  function toWeather(rows){ const o={}; rows.forEach(r=>{ o[r.key]={name:r.name,move:num(r.move,1),atk:num(r.atk,1),def:num(r.def,1),fire:num(r.fire,1),cav:num(r.cav,1),scout:num(r.scout,1),flood:num(r.flood,0),morale:num(r.morale,0)}; }); return o; }
  function toSeason(rows){ const o={}; rows.forEach(r=>{ o[r.key]={name:r.name,grain:num(r.grain,1),w:{rain:num(r.rain,1),sun:num(r.sun,1),fog:num(r.fog,1),snow:num(r.snow,1),wind:num(r.wind,1),drought:num(r.drought,1)}}; }); return o; }
  function toFormations(rows){ const o={}; rows.forEach(r=>{ o[r.key]={name:r.name,atk:num(r.atk,1),def:num(r.def,1),morale:num(r.morale,1),flank:num(r.flank,1),reqInt:num(r.reqInt,0)}; }); return o; }
  function toGenerals(rows){ return rows.map(r=>({id:r.id,name:r.name,star:num(r.star,4),force:num(r.force,80),intellect:num(r.intellect,80),leadership:num(r.leadership,80),speed:num(r.speed,70),style:r.style,trait:r.trait,troop:r.troop,suit:r.suit,skill:r.skill,skillDesc:r.skillDesc})); }

  // 用解析后的 CSV 覆盖内置数据（热加载）
  function reload(cfg) {
    if (cfg.terrain)   state.TERRAIN    = toTerrain(cfg.terrain);
    if (cfg.weather)   state.WEATHER    = toWeather(cfg.weather);
    if (cfg.season)    state.SEASON     = toSeason(cfg.season);
    if (cfg.formations)state.FORMATIONS = toFormations(cfg.formations);
    if (cfg.generals)  state.GENERALS   = toGenerals(cfg.generals);
    return true;
  }
  // 浏览器：从 data/ 拉取 CSV 并热加载（file:// 下 fetch 失败则 Demo 回退内置默认）
  async function loadConfigFromServer(base) {
    base = base || 'data/';
    const files = {terrain:'terrain.csv',weather:'weather.csv',season:'season.csv',formations:'formations.csv',generals:'generals.csv'};
    const cfg = {};
    for (const k in files) { const res = await fetch(base + files[k]); if (!res.ok) throw new Error('缺少 ' + files[k]); cfg[k] = parseCSV(await res.text()); }
    reload(cfg); return cfg;
  }
  // Node：从目录同步读取全部 CSV 并热加载（调平衡/校验用，等价于浏览器版 loadConfigFromServer）
  function loadCSVFromDir(dir) {
    const fs = (typeof require !== 'undefined') ? require('fs') : null;
    if (!fs) throw new Error('loadCSVFromDir 仅 Node 环境可用');
    const files = {terrain:'terrain.csv',weather:'weather.csv',season:'season.csv',formations:'formations.csv',generals:'generals.csv'};
    const cfg = {};
    for (const k in files) { cfg[k] = parseCSV(fs.readFileSync(dir + '/' + files[k], 'utf8')); }
    return reload(cfg);
  }

  return { state, DEFAULTS, num, parseCSV, reload, loadConfigFromServer, loadCSVFromDir };
});
