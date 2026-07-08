/* ============================================================
 *  rules.js —— 三国 SLG 单机版 · 纯逻辑层（无 DOM 依赖）
 *  包含：环境结算器 / 武将克制 / 战斗模拟 / 庙算 / 兵书指令
 *  浏览器：作为全局变量；Node：module.exports
 *  数据内置，与 data/*.csv 同步（Demo 离线可直接跑）
 * ============================================================ */

/* ---------- 1. 数据（与 CSV 配表一致）---------- */
let TERRAIN = {
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
};

let WEATHER = {
  sun:{name:'晴',move:1.0,atk:1.0,def:1.0,fire:1.0,cav:1.0,scout:1.0,flood:0.0,morale:0},
  rain:{name:'雨',move:0.8,atk:1.0,def:1.0,fire:0.2,cav:0.8,scout:0.9,flood:1.5,morale:-5},
  snow:{name:'雪严寒',move:0.7,atk:1.0,def:1.0,fire:1.4,cav:0.8,scout:0.9,flood:0.5,morale:-8},
  wind:{name:'大风',move:1.0,atk:1.0,def:1.0,fire:1.5,cav:1.0,scout:1.0,flood:0.6,morale:0},
  fog:{name:'大雾',move:0.9,atk:1.0,def:1.0,fire:1.0,cav:1.0,scout:0.4,flood:1.0,morale:0},
  drought:{name:'酷暑旱',move:0.9,atk:1.0,def:1.0,fire:1.8,cav:1.0,scout:1.1,flood:0.2,morale:-6}
};

let SEASON = {
  spring:{name:'春',grain:1.1,w:{rain:3,sun:3,fog:1,snow:1,wind:1,drought:0}},
  summer:{name:'夏',grain:1.2,w:{rain:2,sun:4,fog:1,snow:0,wind:1,drought:2}},
  autumn:{name:'秋',grain:1.0,w:{rain:2,sun:3,fog:1,snow:0,wind:2,drought:1}},
  winter:{name:'冬',grain:0.7,w:{rain:1,sun:2,fog:1,snow:4,wind:1,drought:0}}
};

let FORMATIONS = {
  fengshi:{name:'锋矢',atk:1.2,def:0.85,morale:1.0,flank:0.9,reqInt:0},
  heyi:{name:'鹤翼',atk:1.0,def:1.0,morale:1.0,flank:1.3,reqInt:0},
  fangyuan:{name:'方圆',atk:0.9,def:1.3,morale:1.1,flank:0.9,reqInt:0},
  bazhen:{name:'八阵',atk:1.05,def:1.1,morale:1.0,flank:1.0,reqInt:90},
  yanxing:{name:'雁行',atk:1.1,def:0.95,morale:1.0,flank:1.1,reqInt:0},
  yulin:{name:'鱼鳞',atk:0.95,def:1.2,morale:1.05,flank:0.95,reqInt:0}
};

let GENERALS = [
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
];

/* ---------- 2. 工具 ---------- */
const SUIT = {S:1.2,A:1.0,B:0.85,C:0.7};
// 将道风格 RPS：鹰扬>持重>奇变>鹰扬
const STYLE_RPS = {鹰扬:'持重',持重:'奇变',奇变:'鹰扬'};

function suitCoef(s){ return SUIT[s] || 1.0; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

/* ---------- 3. 环境结算器 ---------- */
// 输入地块地形、天气、兵种，返回综合修正
function environmentModifiers(terrainKey, weatherKey, troopType){
  const t = TERRAIN[terrainKey] || TERRAIN.plain;
  const w = WEATHER[weatherKey] || WEATHER.sun;
  const troopAtk = t[troopType] !== undefined ? t[troopType] : 1.0; // cav/inf/arch/eng
  return {
    move: t.move * w.move,
    atk: t.atk * w.atk,
    def: t.def * w.def,
    troopAtk,
    fire: w.fire,
    scout: w.scout,
    flood: w.flood * (1 + t.flood),   // 天气×地形 洪水系数
    morale: w.morale,
    ambush: t.ambush,
    choke: t.choke                    // 天险：1 表示攻击方受罚
  };
}
// 天险惩罚：攻击方打 choke 地形时攻↓
function chokePenalty(terrainKey){
  return TERRAIN[terrainKey] && TERRAIN[terrainKey].choke ? 0.6 : 1.0;
}

/* ---------- 4. 兵书指令（诡道）---------- */
// 水攻：需上游控制 + 天气 flood>0 + 目标低洼。返回伤害系数
function waterAttack(terrainKey, weatherKey){
  const w = WEATHER[weatherKey] || WEATHER.sun;
  const t = TERRAIN[terrainKey] || TERRAIN.plain;
  if (w.flood <= 0) return {ok:false, dmg:0, note:'天旱水枯，水攻无效'};
  const floodPower = w.flood * (1 + t.flood);
  return {
    ok:true,
    dmg: Math.round(800 * floodPower),
    note: `水势${(floodPower).toFixed(2)}倍，低洼敌区遭淹，持续伤亡+士气崩`
  };
}
// 空城计：残血时防御↑、敌命中↓
function emptyFort(selfSoldiers, selfMax){
  const ratio = selfSoldiers / selfMax;
  if (ratio > 0.3) return {active:false};
  const bonus = (0.3 - ratio) * 2; // 越低加成越高
  return {active:true, defMul:1 + bonus, hitDown:clamp(bonus,0,0.5), note:'空城：藏兵示弱，诱敌深入后反击'};
}
// 埋伏判定：潜伏部队是否被敌方侦察发现
function ambushDetect(terrainKey, weatherKey, enemyScout){
  const env = environmentModifiers(terrainKey, weatherKey, '步');
  const detectChance = clamp(0.3 + (1 - env.ambush) * 0.4 + (1 - env.scout) * 0.3 + enemyScout * 0.2, 0.05, 0.95);
  return Math.random() > detectChance; // true=伏击成功(未被发现)
}

/* ---------- 5. 部队构建 ---------- */
function makeUnit(generalId, soldiers, formationKey, opts){
  opts = opts || {};
  const g = GENERALS.find(x=>x.id===generalId) || GENERALS[0];
  const isBlade = g.force >= g.intellect;       // 兵刃 or 谋略
  const primary = isBlade ? g.force : g.intellect;
  const defStat = isBlade ? g.leadership : g.intellect;
  const f = FORMATIONS[formationKey] || FORMATIONS.fengshi;
  return {
    g, soldiers:Math.round(soldiers), max:soldiers,
    formation:f, isBlade, primary, defStat,
    speed:g.speed, style:g.style, morale:opts.morale||80,
    isAmbush:!!opts.isAmbush, isHidden:!!opts.isHidden, alive:true
  };
}

/* ---------- 6. 庙算（天时/地利/人和 评分）---------- */
function miaoSuan(ctx){
  const w = WEATHER[ctx.weather] || WEATHER.sun;
  const dt = TERRAIN[ctx.defTerrain] || TERRAIN.plain;
  const at = TERRAIN[ctx.attTerrain] || TERRAIN.plain;
  // 天时：天气对攻方友好度
  const tianshi = clamp(Math.round(50 + (w.atk-1)*80 + (w.def-1)*40 + (w.flood)*20), 0, 100);
  // 地利：守方地形防御越高、天险越多 → 攻方地利越低
  const dili = clamp(Math.round(50 + (dt.def-1)*100 + (dt.choke?20:0) - (at.atk-1)*30), 0, 100);
  // 人和：士气 + 同袍(粗略用将领数/统率均值)
  const renhe = clamp(Math.round(50 + (ctx.attMorale-50)*0.5 + (ctx.leadAvg-80)*0.3), 0, 100);
  const winProb = clamp(Math.round((tianshi*0.25 + (100-dili)*0.35 + renhe*0.4)), 5, 95);
  return {tianshi, dili, renhe, winProb};
}

/* ---------- 7. 战斗模拟（回合制战法演算）---------- */
function styleCoef(attStyle, defStyle){
  if (STYLE_RPS[attStyle] === defStyle) return 1.2;   // 克制 +20%
  if (STYLE_RPS[defStyle] === attStyle) return 0.85;  // 被克 -15%
  return 1.0;
}
function simulateCombat(attacker, defender, ctx){
  ctx = ctx || {};
  const terrainKey = ctx.terrain || 'plain';
  const weatherKey = ctx.weather || 'sun';
  const env = environmentModifiers(terrainKey, weatherKey, '步');
  const choke = chokePenalty(terrainKey);
  const log = [];
  // 伏击：攻方首回合先手且未被发现
  const ambush = ctx.ambush === true;
  let round = 0, maxRound = 8;
  const allUnits = ()=> [...attacker, ...defender];

  while (round < maxRound && attacker.some(u=>u.alive) && defender.some(u=>u.alive)){
    round++;
    log.push(`—— 第${round}回合 ——`);
    // 行动顺序：速度降序；伏击时攻方整体先动
    let order = allUnits().filter(u=>u.alive).sort((a,b)=> b.speed - a.speed);
    if (ambush && round===1){
      order = [...attacker.filter(u=>u.alive), ...defender.filter(u=>u.alive)].sort((a,b)=> b.speed-a.speed);
    }
    for (const u of order){
      if (!u.alive) continue;
      const foes = (attacker.includes(u)?defender:attacker).filter(x=>x.alive);
      if (!foes.length) break;
      // 选目标：兵力最高
      const target = foes.reduce((m,x)=> x.soldiers>m.soldiers?x:m, foes[0]);
      const isAttackerSide = attacker.includes(u);
      // 攻击系数
      const sCoef = styleCoef(u.style, target.style);
      const troopAtk = (TERRAIN[terrainKey][u.g.troop] !== undefined) ? TERRAIN[terrainKey][u.g.troop] : 1.0;
      let atkMul = u.formation.atk * suitCoef(u.g.suit) * env.atk * troopAtk
                   * sCoef * (u.morale/80) * (isAttackerSide?choke:1) * (u.isAmbush&&round===1?1.5:1);
      // 减伤率模型：mitigation = defStat/(defStat+K)，再乘全局伤害系数
      const K = 150;
      const DAMAGE_SCALE = 4.0;
      const mitigation = target.defStat / (target.defStat + K);
      const dmg = Math.max(1, Math.round(u.primary * atkMul * (1 - mitigation) * DAMAGE_SCALE));
      target.soldiers -= dmg;
      log.push(`${u.g.name}(${u.isBlade?'兵刃':'谋略'}) → ${target.g.name} 造成 ${dmg} 伤害（剩${Math.max(0,target.soldiers)}）`);
      // 主动战法概率触发（演示：30% 追加 50% 伤害）
      if (Math.random() < 0.3){
        const extra = Math.round(dmg*0.5);
        target.soldiers -= extra;
        log.push(`  ⚡ ${u.g.name} 发动【${u.g.skill}】追加 ${extra} 伤害`);
      }
      if (target.soldiers <= 0){ target.alive=false; target.soldiers=0; log.push(`  ☠ ${target.g.name} 败退`); }
    }
    // 水攻持续伤害（若 ctx.floodActive）
    if (ctx.floodActive){
      defender.forEach(u=>{ if(u.alive){ const d=Math.round(300*env.flood); u.soldiers-=d; if(u.soldiers<=0){u.alive=false;u.soldiers=0;log.push(`  🌊 ${u.g.name} 被水淹败退`);} } });
    }
    // 士气随损耗微调
    allUnits().forEach(u=>{ if(u.alive) u.morale = clamp(u.morale - (u.soldiers/u.max<0.5?5:0) + env.morale*0.1, 20, 100); });
  }
  const attWin = defender.every(u=>!u.alive);
  const defWin = attacker.every(u=>!u.alive);
  let result = attWin ? '攻方胜' : defWin ? '守方胜' : '超时（按剩余兵力判）';
  if (!attWin && !defWin){
    const aLeft = attacker.reduce((s,u)=>s+u.soldiers,0);
    const dLeft = defender.reduce((s,u)=>s+u.soldiers,0);
    result = aLeft>=dLeft ? '攻方胜(兵力占优)' : '守方胜(兵力占优)';
  }
  return {result, round, log, attackers:attacker.map(u=>({name:u.g.name,soldiers:u.soldiers,alive:u.alive})),
          defenders:defender.map(u=>({name:u.g.name,soldiers:u.soldiers,alive:u.alive}))};
}

/* ---------- 8. 配表热加载（CSV → 数据表）---------- */
function num(v,d){ const n=parseFloat(v); return isNaN(n)?(d||0):n; }
function parseCSV(text){
  const lines=text.trim().split(/\r?\n/); if(!lines.length) return [];
  const headers=lines[0].split(',').map(h=>h.trim());
  const out=[];
  for(let i=1;i<lines.length;i++){ const line=lines[i]; if(!line.trim()) continue;
    const vals=line.split(','); const o={}; headers.forEach((h,j)=> o[h]= (vals[j]!==undefined?vals[j].trim():'')); out.push(o); }
  return out;
}
function toTerrain(rows){ const o={}; rows.forEach(r=>{ o[r.key]={name:r.name,color:r.color,move:num(r.move,1),atk:num(r.atk,1),def:num(r.def,1),cav:num(r.cav,1),inf:num(r.inf,1),arch:num(r.arch,1),eng:num(r.eng,1),scout:num(r.scout,1),ambush:num(r.ambush,0),flood:num(r.flood,0),choke:num(r.choke,0),marchDmg:num(r.marchDmg,0)}; }); return o; }
function toWeather(rows){ const o={}; rows.forEach(r=>{ o[r.key]={name:r.name,move:num(r.move,1),atk:num(r.atk,1),def:num(r.def,1),fire:num(r.fire,1),cav:num(r.cav,1),scout:num(r.scout,1),flood:num(r.flood,0),morale:num(r.morale,0)}; }); return o; }
function toSeason(rows){ const o={}; rows.forEach(r=>{ o[r.key]={name:r.name,grain:num(r.grain,1),w:{rain:num(r.rain,1),sun:num(r.sun,1),fog:num(r.fog,1),snow:num(r.snow,1),wind:num(r.wind,1),drought:num(r.drought,1)}}; }); return o; }
function toFormations(rows){ const o={}; rows.forEach(r=>{ o[r.key]={name:r.name,atk:num(r.atk,1),def:num(r.def,1),morale:num(r.morale,1),flank:num(r.flank,1),reqInt:num(r.reqInt,0)}; }); return o; }
function toGenerals(rows){ return rows.map(r=>({id:r.id,name:r.name,star:num(r.star,4),force:num(r.force,80),intellect:num(r.intellect,80),leadership:num(r.leadership,80),speed:num(r.speed,70),style:r.style,trait:r.trait,troop:r.troop,suit:r.suit,skill:r.skill,skillDesc:r.skillDesc})); }
// 用解析后的 CSV 覆盖内置数据（实现热加载）
function reload(cfg){
  if(cfg.terrain) TERRAIN=toTerrain(cfg.terrain);
  if(cfg.weather) WEATHER=toWeather(cfg.weather);
  if(cfg.season) SEASON=toSeason(cfg.season);
  if(cfg.formations) FORMATIONS=toFormations(cfg.formations);
  if(cfg.generals) GENERALS=toGenerals(cfg.generals);
  RULES.TERRAIN=TERRAIN; RULES.WEATHER=WEATHER; RULES.SEASON=SEASON; RULES.FORMATIONS=FORMATIONS; RULES.GENERALS=GENERALS;
  return true;
}
// 浏览器：从 data/ 拉取 CSV 并热加载（file:// 下 fetch 失败则由 Demo 回退内置默认）
async function loadConfigFromServer(base){
  base = base || 'data/';
  const files={terrain:'terrain.csv',weather:'weather.csv',season:'season.csv',formations:'formations.csv',generals:'generals.csv'};
  const cfg={};
  for(const k in files){ const res=await fetch(base+files[k]); if(!res.ok) throw new Error('缺少 '+files[k]); cfg[k]=parseCSV(await res.text()); }
  reload(cfg); return cfg;
}

// Node：从目录同步读取全部 CSV 并热加载（调平衡/校验用，等价于浏览器版 loadConfigFromServer）
function loadCSVFromDir(dir){
  const fs = (typeof require!=='undefined') ? require('fs') : null;
  if(!fs) throw new Error('loadCSVFromDir 仅 Node 环境可用');
  const files={terrain:'terrain.csv',weather:'weather.csv',season:'season.csv',formations:'formations.csv',generals:'generals.csv'};
  const cfg={};
  for(const k in files){ cfg[k]=parseCSV(fs.readFileSync(dir+'/'+files[k],'utf8')); }
  return reload(cfg);
}

/* ---------- 9. 外交关系模型（纯逻辑，单机 AI 用）---------- */
// relation: 'neutral'（中立） | 'ally'（同盟：互不侵犯） | 'rival'（敌对：可“拉一个 AI 打另一个”）
function createDiplomacy(lordIds){
  const m={};
  lordIds.forEach(a=>{ m[a]={}; lordIds.forEach(b=>{ if(a!==b) m[a][b]='neutral'; }); });
  return m;
}
function getRelation(dip,a,b){ return (dip[a]&&dip[a][b])||'neutral'; }
function setRelation(dip,a,b,rel){ if(dip[a]) dip[a][b]=rel; if(dip[b]) dip[b][a]=rel; }
function isAlly(dip,a,b){ return getRelation(dip,a,b)==='ally'; }
function isRival(dip,a,b){ return getRelation(dip,a,b)==='rival'; }
function canAttack(dip,me,target){ return !isAlly(dip,me,target); }
// 评分调整：同盟→绝对不攻(-1e9)；敌对→优先(+5)；否则 0
function diploScoreAdj(dip,me,target){
  if(isAlly(dip,me,target)) return -1e9;
  if(isRival(dip,me,target)) return 5;
  return 0;
}

/* ---------- 9.1 多剧本（M3 里程碑）---------- */
// 每个剧本定义：初始诸侯、玩家起点、胜利/失败条件、脚本事件（如「讨董」自动结盟讨贼）
const SCENARIOS = [
  {id:'melee', name:'群雄逐鹿', desc:'群雄并起，凭实力逐鹿中原。',
   playerHome:[8,50], neutralMul:1, victory:{type:'land',n:60},
   lords:[
     {id:'ai_cao',name:'曹操·魏',home:[72,6], personality:'霸权', color:'#d24b4b', strength:1500, gen:['cao1','guan1','zhao1']},
     {id:'ai_liu',name:'刘备·蜀',home:[10,10], personality:'外交', color:'#4bb0d2', strength:1400, gen:['liu1','zhang1','huang1']},
     {id:'ai_sun',name:'孙权·吴',home:[40,46], personality:'稳健', color:'#5fbf6a', strength:1450, gen:['sun1','zhou1','lu1']},
     {id:'ai_dong',name:'董卓',  home:[16,50], personality:'侵略', color:'#c79a3d', strength:1600, gen:['lv1','sima1','zhang1']}
   ], events:[]},
  {id:'yellowturban', name:'黄巾之乱', desc:'黄巾势大、义军遍地，剿灭黄巾。',
   playerHome:[40,50], neutralMul:1.8, victory:{type:'land',n:50},
   lords:[
     {id:'ai_cao',name:'曹操·魏',home:[66,8], personality:'霸权', color:'#d24b4b', strength:1500, gen:['cao1','guan1','zhao1']},
     {id:'ai_liu',name:'刘备·蜀',home:[14,10], personality:'外交', color:'#4bb0d2', strength:1400, gen:['liu1','zhang1','huang1']},
     {id:'ai_sun',name:'孙权·吴',home:[66,46], personality:'稳健', color:'#5fbf6a', strength:1450, gen:['sun1','zhou1','lu1']}
   ], events:[]},
  {id:'dongzhuo', name:'讨董卓', desc:'董卓窃权、众怒难犯；第 4 时辰各路自发讨董。',
   playerHome:[40,50], neutralMul:1.2, victory:{type:'defeatLord',lordId:'ai_dong',land:55},
   lords:[
     {id:'ai_cao',name:'曹操·魏',home:[66,8], personality:'霸权', color:'#d24b4b', strength:1500, gen:['cao1','guan1','zhao1']},
     {id:'ai_liu',name:'刘备·蜀',home:[14,10], personality:'外交', color:'#4bb0d2', strength:1400, gen:['liu1','zhang1','huang1']},
     {id:'ai_sun',name:'孙权·吴',home:[66,46], personality:'稳健', color:'#5fbf6a', strength:1450, gen:['sun1','zhou1','lu1']},
     {id:'ai_dong',name:'董卓',  home:[40,44], personality:'侵略', color:'#c79a3d', strength:1850, gen:['lv1','sima1','zhang1']}
   ], events:[{at:4, type:'rivalAll', target:'ai_dong', msg:'董卓乱政！各路诸侯自发讨董，董卓成众矢之的'}]}
];
function getScenario(id){ return SCENARIOS.find(s=>s.id===id) || SCENARIOS[0]; }
function eventsDueAt(scn, time){ return (scn.events||[]).filter(e=> time>=e.at); }

/* ---------- 10. 导出 ---------- */
const RULES = {TERRAIN,WEATHER,SEASON,FORMATIONS,GENERALS,environmentModifiers,chokePenalty,
  waterAttack,emptyFort,ambushDetect,makeUnit,miaoSuan,simulateCombat,styleCoef,suitCoef,STYLE_RPS,
  parseCSV,reload,loadConfigFromServer,loadCSVFromDir,
  createDiplomacy,getRelation,setRelation,isAlly,isRival,canAttack,diploScoreAdj,
  SCENARIOS,getScenario,eventsDueAt};
if (typeof module !== 'undefined' && module.exports) module.exports = RULES;
if (typeof window !== 'undefined') window.RULES = RULES;
