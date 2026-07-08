/* ============================================================
 *  balance.js —— 自动平衡脚本（数值工具）
 *  目标：用 loadCSVFromDir 热加载 data/*.csv，跑大规模战斗模拟，
 *       标出「过强 / 过弱武将」「过防御 / 欠防御地形」，
 *       并扩展两个维度：
 *         · 阵容搭配（双将组合协同度，最强/最弱阵容）
 *         · 兵种（骑/步/弓 跨地形平均胜率，过强/过弱兵种）
 *       让调平不再靠手感，而是可复现、可对比的数据报告。
 *
 *  用法：  node tests/balance.js
 *  产物：  控制台报告 + tests/balance_report.md
 * ============================================================ */
const path = require('path');
const fs   = require('fs');
const R = require('../src/rules.js');

/* ---------- 0. 可复现随机（mulberry32）---------- */
// 平衡报告必须可复现：临时替换 Math.random 为带种子的 LCG，跑完还原。
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 0x9e3779b9;
const _origRandom = Math.random;
Math.random = mulberry32(SEED);

/* ---------- 1. 热加载配表（与浏览器 Demo 同一份 data）---------- */
const DATA_DIR = path.join(__dirname, '..', 'data');
R.loadCSVFromDir(DATA_DIR);
const GENERALS = R.GENERALS;
const TERRAIN  = R.TERRAIN;
const WEATHER  = R.WEATHER;

const N = 200;               // 每组对局重复次数（平滑技能随机触发）
const SOLDIERS = 1000;       // 基准兵力（双方相等，隔离数值差异）
const REPS = N;
const LINEUP_REPS = 40;      // 阵容维度每组对局重复（全序循环 66×65 场，控速用）

function freshUnits(aId, bId, terrainKey){
  const aG = GENERALS.find(g=>g.id===aId);
  const bG = GENERALS.find(g=>g.id===bId);
  const aF = R.chooseFormation(aG, bG, terrainKey);
  const bF = R.chooseFormation(bG, aG, terrainKey);
  // simulateCombat 的 attacker/defender 必须是「部队数组」
  return [
    [R.makeUnit(aId, SOLDIERS, aF)],
    [R.makeUnit(bId, SOLDIERS, bF)],
    aF, bF
  ];
}
function runMatch(aId, bId, terrainKey, weatherKey){
  const [att, def, aF, bF] = freshUnits(aId, bId, terrainKey);
  const res = R.simulateCombat(att, def, {terrain:terrainKey, weather:weatherKey});
  const attWin = res.result.indexOf('攻方胜') === 0;
  return {attWin, round:res.round, aF, bF};
}
// 镜像对局：同一武将（积分相等、风格自抵）置于攻守两侧，隔离地形/天气的防守偏向
function runMatchMirror(id, terrainKey, weatherKey){
  const g  = GENERALS.find(x=>x.id===id);
  const aF = R.chooseFormation(g, g, terrainKey);
  const bF = R.chooseFormation(g, g, terrainKey);
  const att = [R.makeUnit(id, SOLDIERS, aF)];
  const def = [R.makeUnit(id, SOLDIERS, bF)];
  const res = R.simulateCombat(att, def, {terrain:terrainKey, weather:weatherKey});
  return {attWin: res.result.indexOf('攻方胜') === 0, round:res.round};
}

/* ---------- 1b. 阵容 / 兵种辅助 ---------- */
// 敌方锚点：取敌方阵容中「兵刃/谋略峰值」最高者，作为本方选阵的参照对手
function bestEnemy(ids){
  return ids.map(id=>GENERALS.find(g=>g.id===id))
            .sort((a,b)=> Math.max(b.force,b.intellect) - Math.max(a.force,a.intellect))[0];
}
// 双人阵容：返回 [makeUnit(A), makeUnit(B)]（每次调用都新建，避免战斗对单位的副作用复用）。
// 阵法按「对敌方锚点」选择，与友军顺序无关 → teamOfVs(A,B) 与 teamOfVs(B,A) 等价，自参照对局正确归一到 ~50%。
function teamOfVs(aId, bId, enemyIds, terrainKey){
  const aG = GENERALS.find(g=>g.id===aId);
  const bG = GENERALS.find(g=>g.id===bId);
  const eG = bestEnemy(enemyIds);
  const aF = R.chooseFormation(aG, eG, terrainKey);
  const bF = R.chooseFormation(bG, eG, terrainKey);
  return [R.makeUnit(aId, SOLDIERS, aF), R.makeUnit(bId, SOLDIERS, bF)];
}
function runTeamMatch(teamA, teamB, terrainKey, weatherKey){
  const res = R.simulateCombat(teamA, teamB, {terrain:terrainKey, weather:weatherKey});
  return res.result.indexOf('攻方胜') === 0;
}
// 克隆同一基底武将、仅替换兵种标签，用于隔离「兵种地形加成」这一单一变量
function makeTroopUnit(baseId, troop){
  const base = GENERALS.find(g=>g.id===baseId);
  const u = R.makeUnit(baseId, SOLDIERS, R.chooseFormation(base, base, 'plain'));
  u.g = Object.assign({}, base, {troop});     // 仅覆盖 troop，其余属性（风格/兵刃谋略/统率）保持不变
  return u;
}

/* ---------- 2. 武将平衡：全序对局（A攻B + B攻A）---------- */
function evalGenerals(){
  const stats = {};
  GENERALS.forEach(g=> stats[g.id] = {atkGames:0, atkWins:0, defGames:0, defWins:0, name:g.name});
  for (let i=0;i<GENERALS.length;i++){
    for (let j=0;j<GENERALS.length;j++){
      if (i===j) continue;
      const A=GENERALS[i].id, B=GENERALS[j].id;
      for (let r=0;r<REPS;r++){
        const m = runMatch(A, B, 'plain', 'sun');
        stats[A].atkGames++; if(m.attWin) stats[A].atkWins++;
        stats[B].defGames++; if(!m.attWin) stats[B].defWins++;
      }
    }
  }
  const rows = GENERALS.map(g=>{
    const s = stats[g.id];
    const atk = s.atkGames ? s.atkWins/s.atkGames : 0;
    const def = s.defGames ? s.defWins/s.defGames : 0;
    const power = (atk+def)/2;
    return {id:g.id, name:g.name, star:g.star, force:g.force, intellect:g.intellect,
            leadership:g.leadership, style:g.style, troop:g.troop,
            atk, def, power};
  });
  // 均值 + 标准差，用于标异常
  const mean = rows.reduce((s,r)=>s+r.power,0)/rows.length;
  const variance = rows.reduce((s,r)=>s+(r.power-mean)**2,0)/rows.length;
  const std = Math.sqrt(variance);
  const OP = mean + 1.5*std, UP = mean - 1.5*std;
  rows.forEach(r=>{
    if (r.power > OP) r.flag = '⚠️ 过强';
    else if (r.power < UP) r.flag = '⚠️ 过弱';
    else r.flag = '✅ 正常';
  });
  rows.sort((a,b)=>b.power-a.power);
  return {rows, mean, std, OP, UP};
}

/* ---------- 3. 地形平衡：镜像对局（同将 vs 同将）隔离地形防御优势 ---------- */
// 用同一武将（平局倾向，基准≈50%）在各地形下对战；地形 def/choke 越高，守方胜率越偏离基准。
function evalTerrain(){
  const probe = 'cao1';             // 攻防均衡的探针武将
  const rows = [];
  for (const tk of Object.keys(TERRAIN)){
    let defWins=0, total=0, rounds=0;
    for (let r=0;r<REPS;r++){
      const m = runMatchMirror(probe, tk, 'sun');
      total++; rounds += m.round;
      if (!m.attWin) defWins++;       // 守方（B）胜
    }
    rows.push({key:tk, name:TERRAIN[tk].name, defWin:defWins/total, avgRound:rounds/total});
  }
  // 以平原为基准（地形加成≈0），其余偏离越多越偏防守。
  // 「过防御」判定：守方胜率≥85% 视为近乎无法破防（broken，需下调 def/choke）；
  // 天险本就守方占优但须可下，故不把「守方占优」一律判为过防御。
  const base = rows.find(r=>r.key==='plain').defWin;
  const mean = rows.reduce((s,r)=>s+r.defWin,0)/rows.length;
  const variance = rows.reduce((s,r)=>s+(r.defWin-mean)**2,0)/rows.length;
  const std = Math.sqrt(variance);
  const HOT = 0.85;          // 守方胜率阈值：≥85% 才算「过防御/近乎无法破防」
  const COLD = 0.10;         // 守方胜率过低（<10%）视为「欠防御/攻方碾压」
  rows.forEach(r=>{
    r.dev = r.defWin - base;
    if (r.defWin >= HOT) r.flag = '⚠️ 过防御（守方优势过大/近乎无法破防）';
    else if (r.defWin < COLD) r.flag = '⚠️ 欠防御（攻方碾压）';
    else r.flag = '✅ 正常';
  });
  rows.sort((a,b)=>b.defWin-a.defWin);
  return {rows, base, mean, std, HOT, COLD};
}

/* ---------- 4. 天气二次扫描（平原上各天气对攻防的影响）---------- */
function evalWeather(){
  const rows = [];
  for (const wk of Object.keys(WEATHER)){
    let defWins=0;
    for (let r=0;r<REPS;r++){ const m=runMatchMirror('cao1','plain',wk); if(!m.attWin) defWins++; }
    rows.push({key:wk, name:WEATHER[wk].name, defWin:defWins/REPS});
  }
  rows.sort((a,b)=>b.defWin-a.defWin);
  return rows;
}

/* ---------- 5. 阵容搭配：双将组合协同度（阵容间全序循环对战）---------- */
// 思路：枚举所有双将组合 C(12,2)=66 对，每一对 P 与其余所有组合 Q 互攻互守各 LINEUP_REPS 次。
// 由构造保证「P 攻 Q」与「Q 攻 P」各计一次，组合胜率 pairWin 的全局均值严格 = 0.5，
// 彻底消除单一参照带来的先手/序位偏置（含自参照对局也会被对称抵消）。
// 协同度 synergy = pairWin − 两将个体战力均值（>0 说明组合超出其个体之和，<0 说明属性重叠/冲突）。
// 再按 pairWin 的 ±1.5σ 标「过强/过弱阵容」。
function evalLineup(powerById){
  const ids = GENERALS.map(g=>g.id);
  const pairs = [];
  for (let i=0;i<ids.length;i++)
    for (let j=i+1;j<ids.length;j++)
      pairs.push([ids[i], ids[j]]);
  const N = pairs.length;
  const attWin = {};                       // attWin["pi_qi"] = P(pi) 作为攻方击败 Q(qi) 的次数
  pairs.forEach((_,pi)=>{ attWin[pi] = {}; });

  for (let pi=0; pi<N; pi++){
    for (let qi=0; qi<N; qi++){
      if (pi===qi) continue;
      const P = pairs[pi], Q = pairs[qi];
      let w=0;
      for (let r=0;r<LINEUP_REPS;r++){
        const att = teamOfVs(P[0], P[1], Q, 'plain');   // P 攻，按对 Q 的敌锚点选阵
        const def = teamOfVs(Q[0], Q[1], P, 'plain');   // Q 守，按对 P 的敌锚点选阵
        const res = R.simulateCombat(att, def, {terrain:'plain', weather:'sun'});
        if (res.result.indexOf('攻方胜') === 0) w++;
      }
      attWin[pi][qi] = w;
    }
  }

  const rows = [];
  for (let pi=0; pi<N; pi++){
    const [aId,bId] = pairs[pi];
    let asAtt=0, asAttGames=0, asDef=0;
    for (let qi=0; qi<N; qi++){
      if (qi===pi) continue;
      asAtt += attWin[pi][qi]; asAttGames += LINEUP_REPS;
      asDef += (LINEUP_REPS - attWin[qi][pi]);   // Q 攻 P 时 P 为守方获胜 = Q 攻方未胜
    }
    const pairWin  = (asAtt + asDef) / (2*asAttGames);
    const expected = (powerById[aId] + powerById[bId]) / 2;
    const synergy  = pairWin - expected;
    rows.push({a:aId, b:bId, nameA:GENERALS.find(g=>g.id===aId).name, nameB:GENERALS.find(g=>g.id===bId).name,
               pairWin, expected, synergy});
  }
  const mean = rows.reduce((s,r)=>s+r.pairWin,0)/rows.length;
  const variance = rows.reduce((s,r)=>s+(r.pairWin-mean)**2,0)/rows.length;
  const std = Math.sqrt(variance);
  const OP = mean + 1.5*std, UP = mean - 1.5*std;
  rows.forEach(r=>{
    if (r.pairWin > OP) r.flag = '⚠️ 过强阵容';
    else if (r.pairWin < UP) r.flag = '⚠️ 过弱阵容';
    else r.flag = '✅ 正常';
  });
  rows.sort((a,b)=>b.pairWin-a.pairWin);
  const bySyn = [...rows].sort((a,b)=>b.synergy-a.synergy);
  return {
    rows, mean, std, OP, UP,
    strongest: rows.slice(0,3),
    weakest:   rows.slice(-3),
    bestSyn:   bySyn.slice(0,3),
    worstSyn:  bySyn.slice(-3)
  };
}

/* ---------- 6. 兵种平衡：骑/步/弓 跨地形平均胜率（隔离单一变量）---------- */
// 思路：用「同一基底武将（曹操，同风格同属性）克隆出 troop=骑/步/弓」，
// 对每个 (兵种 T, 地形) 同时跑「T 为攻 vs 步为守」与「步为攻 vs T 为守」两侧、
// 取均值以抵消「攻方先手优势」偏置，从而只保留「地形兵种加成」这一变量。
// 各兵种跨地形平均胜率若偏离均值 ±1.5σ，标「过强/过弱兵种」。
function evalTroop(){
  const TROOPS = ['骑','步','弓'];
  const BASE = 'cao1';
  const matrix = {};                 // matrix[troop][terrain] = 攻防两侧均值的兵种强度
  for (const T of TROOPS){
    matrix[T] = {};
    for (const tk of Object.keys(TERRAIN)){
      let wA=0, wD=0;                // wA: T 为攻胜率；wD: T 为守胜率(=1−步为攻胜率)
      for (let r=0;r<REPS;r++){
        const attT = [makeTroopUnit(BASE, T)];
        const defI = makeTroopUnit(BASE, '步');
        const r1 = R.simulateCombat(attT, [defI], {terrain:tk, weather:'sun'});
        if (r1.result.indexOf('攻方胜') === 0) wA++;
        const attI = [makeTroopUnit(BASE, '步')];
        const defT = makeTroopUnit(BASE, T);
        const r2 = R.simulateCombat(attI, [defT], {terrain:tk, weather:'sun'});
        if (r2.result.indexOf('守方胜') === 0) wD++;   // 守方(T)胜 = 攻方(步)未胜
      }
      matrix[T][tk] = (wA + wD) / (2*REPS);
    }
  }
  const avg = {};
  for (const T of TROOPS)
    avg[T] = Object.values(matrix[T]).reduce((s,x)=>s+x,0) / Object.keys(TERRAIN).length;
  const vals = TROOPS.map(T=>avg[T]);
  const mean = vals.reduce((s,x)=>s+x,0) / vals.length;
  const variance = vals.reduce((s,x)=>s+(x-mean)**2,0) / vals.length;
  const std = Math.sqrt(variance);
  const OP = mean + 1.5*std, UP = mean - 1.5*std;
  const flags = {};
  for (const T of TROOPS)
    flags[T] = avg[T] > OP ? '⚠️ 过强兵种' : (avg[T] < UP ? '⚠️ 过弱兵种' : '✅ 正常');
  return {TROOPS, matrix, avg, mean, std, OP, UP, flags};
}

/* ---------- 5. 输出 ---------- */
function fmtPct(x){ return (x*100).toFixed(1)+'%'; }
function bar(x, scale){
  const n = Math.max(0, Math.min(scale, Math.round(x*scale)));
  return '█'.repeat(n) + '░'.repeat(scale-n);
}

function main(){
  console.log('\n=== 三国 SLG · 自动平衡报告 ===');
  console.log(`种子=${SEED.toString(16)}  重复=${REPS}/组  兵力=${SOLDIERS}\n`);

  const g = evalGenerals();
  console.log('【武将平衡】');
  console.log('排名  武将        ★  兵刃/谋略  统率  风格  攻胜率  守胜率  综合力  标记');
  g.rows.forEach((r,i)=>{
    const prim = r.style ? (r.style) : '-';
    console.log(
      String(i+1).padStart(2)+'   '+
      r.name.padEnd(5,' ')+'  '+String(r.star).padStart(1)+'   '+
      String(r.force).padStart(3)+'/'+String(r.intellect).padStart(3)+'   '+
      String(r.leadership).padStart(3)+'  '+r.style.padEnd(2)+'  '+
      fmtPct(r.atk).padStart(6)+'  '+fmtPct(r.def).padStart(6)+'  '+
      fmtPct(r.power).padStart(6)+'  '+r.flag);
  });
  console.log(`综合力均值=${fmtPct(g.mean)}  标准差=${fmtPct(g.std)}  过强阈值>${fmtPct(g.OP)}  过弱阈值<${fmtPct(g.UP)}\n`);

  const t = evalTerrain();
  console.log('【地形平衡】（平原为基准，守方胜率越高=越偏防守）');
  console.log('地形          守方胜率  偏离基准  平均回合  标记');
  t.rows.forEach(r=>{
    console.log(
      r.name.padEnd(6,' ')+'  '+fmtPct(r.defWin).padStart(6)+'  '+
      (r.dev>=0?'+':'')+fmtPct(r.dev).padStart(6)+'  '+
      r.avgRound.toFixed(1).padStart(5)+'   '+r.flag);
  });
  console.log(`平原基准=${fmtPct(t.base)}  过防御阈值>${fmtPct(t.HOT)}  欠防御阈值<${fmtPct(t.COLD)}\n`);

  const w = evalWeather();
  console.log('【天气扫描】（平原上各天气守方胜率）');
  w.forEach(r=> console.log('  '+r.name.padEnd(4,' ')+'  '+fmtPct(r.defWin)+'  '+bar(r.defWin,10)));
  console.log('');

  /* ---------- 阵容搭配 ---------- */
  const powerById = {};
  g.rows.forEach(r=> powerById[r.id] = r.power);
  const l = evalLineup(powerById);
  console.log(`【阵容搭配】（全序循环对战 ${LINEUP_REPS}/组，组合胜率均值严格=50%；协同度=组合胜率−两将个体战力均值）`);
  console.log('最强阵容TOP3：');
  l.strongest.forEach(r=> console.log('  '+r.nameA+' + '+r.nameB+'  胜率'+fmtPct(r.pairWin)+'  协同'+(r.synergy>=0?'+':'')+fmtPct(r.synergy)));
  console.log('最弱阵容TOP3：');
  l.weakest.forEach(r=> console.log('  '+r.nameA+' + '+r.nameB+'  胜率'+fmtPct(r.pairWin)+'  协同'+(r.synergy>=0?'+':'')+fmtPct(r.synergy)));
  console.log('最佳互补TOP3（协同度最高）：');
  l.bestSyn.forEach(r=> console.log('  '+r.nameA+' + '+r.nameB+'  协同'+(r.synergy>=0?'+':'')+fmtPct(r.synergy)+'  胜率'+fmtPct(r.pairWin)));
  console.log('最差互补TOP3（协同度最低）：');
  l.worstSyn.forEach(r=> console.log('  '+r.nameA+' + '+r.nameB+'  协同'+(r.synergy>=0?'+':'')+fmtPct(r.synergy)+'  胜率'+fmtPct(r.pairWin)));
  console.log(`组合胜率均值=${fmtPct(l.mean)}  标准差=${fmtPct(l.std)}  过强>${fmtPct(l.OP)}  过弱<${fmtPct(l.UP)}\n`);

  /* ---------- 兵种平衡 ---------- */
  const tr = evalTroop();
  console.log('【兵种平衡】（同基底武将克隆，仅兵种标签不同，跨地形攻方胜率）');
  console.log('兵种   跨地形平均胜率  标记');
  tr.TROOPS.forEach(T=>{
    console.log('  '+T.padEnd(4,' ')+'  '+fmtPct(tr.avg[T]).padStart(8)+'   '+tr.flags[T]);
  });
  console.log('地形 × 兵种 兵种强度矩阵（攻防两侧均值，0.5=中立）：');
  const tkList = Object.keys(TERRAIN);
  console.log('  '+''.padEnd(8,' ')+tr.TROOPS.map(T=>T.padStart(7,' ')).join(''));
  tkList.forEach(tk=>{
    console.log('  '+TERRAIN[tk].name.padEnd(8,' ')+tr.TROOPS.map(T=>fmtPct(tr.matrix[T][tk]).padStart(7,' ')).join(''));
  });
  console.log(`兵种平均胜率均值=${fmtPct(tr.mean)}  标准差=${fmtPct(tr.std)}  过强>${fmtPct(tr.OP)}  过弱<${fmtPct(tr.UP)}\n`);

  // 写 Markdown 报告
  writeReport(g, t, w, l, tr);

  Math.random = _origRandom;     // 还原，避免污染其他脚本
  console.log('报告已写入 tests/balance_report.md');
}

function writeReport(g, t, w, l, tr){
  const lines = [];
  lines.push('# 三国 SLG · 自动平衡报告');
  lines.push('');
  lines.push(`> 生成于自动平衡脚本 \`tests/balance.js\`（种子 \`${SEED.toString(16)}\`，每组 ${REPS} 次，兵力 ${SOLDIERS}）。`);
  lines.push('> 数据来自 \`data/*.csv\` 热加载，与浏览器 Demo 同源。');
  lines.push('');
  lines.push('## 武将平衡');
  lines.push('');
  lines.push('| 排名 | 武将 | 星级 | 兵刃/谋略 | 统率 | 风格 | 攻胜率 | 守胜率 | 综合力 | 标记 |');
  lines.push('| ---: | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |');
  g.rows.forEach((r,i)=>{
    lines.push(`| ${i+1} | ${r.name} | ${r.star} | ${r.force}/${r.intellect} | ${r.leadership} | ${r.style} | ${fmtPct(r.atk)} | ${fmtPct(r.def)} | ${fmtPct(r.power)} | ${r.flag} |`);
  });
  lines.push('');
  lines.push(`综合力均值=${fmtPct(g.mean)}，标准差=${fmtPct(g.std)}，过强阈值>${fmtPct(g.OP)}，过弱阈值<${fmtPct(g.UP)}。`);
  lines.push('');
  lines.push('## 地形平衡（平原为基准）');
  lines.push('');
  lines.push('| 地形 | 守方胜率 | 偏离基准 | 平均回合 | 标记 |');
  lines.push('| --- | ---: | ---: | ---: | --- |');
  t.rows.forEach(r=>{
    lines.push(`| ${r.name} | ${fmtPct(r.defWin)} | ${(r.dev>=0?'+':'')+fmtPct(r.dev)} | ${r.avgRound.toFixed(1)} | ${r.flag} |`);
  });
  lines.push('');
  lines.push('## 天气扫描（平原上各天气守方胜率）');
  lines.push('');
  lines.push('| 天气 | 守方胜率 |');
  lines.push('| --- | ---: |');
  w.forEach(r=> lines.push(`| ${r.name} | ${fmtPct(r.defWin)} |`));
  lines.push('');

  lines.push('## 阵容搭配（双将组合协同度）');
  lines.push('');
  lines.push('> 全序循环对战：所有双将组合两两互攻互守（各 ' + LINEUP_REPS + ' 次），由构造保证组合胜率全局均值 = 50%，' +
             '彻底消除单一参照的先手/序位偏置。协同度 = 组合胜率 − 两将个体战力均值（>0 表示组合超出其个体之和，<0 表示属性重叠/冲突）。');
  lines.push('');
  lines.push('| 组合 | 组合胜率 | 个体期望 | 协同度 | 标记 |');
  lines.push('| --- | ---: | ---: | ---: | --- |');
  l.rows.forEach(r=>{
    lines.push(`| ${r.nameA} + ${r.nameB} | ${fmtPct(r.pairWin)} | ${fmtPct(r.expected)} | ${(r.synergy>=0?'+':'')+fmtPct(r.synergy)} | ${r.flag} |`);
  });
  lines.push('');
  lines.push(`组合胜率均值=${fmtPct(l.mean)}，标准差=${fmtPct(l.std)}，过强阈值>${fmtPct(l.OP)}，过弱阈值<${fmtPct(l.UP)}。`);
  lines.push('');
  lines.push('- **最强阵容 TOP3**：' + l.strongest.map(r=>`${r.nameA}+${r.nameB}(${fmtPct(r.pairWin)})`).join('、') + '。');
  lines.push('- **最弱阵容 TOP3**：' + l.weakest.map(r=>`${r.nameA}+${r.nameB}(${fmtPct(r.pairWin)})`).join('、') + '。');
  lines.push('- **最佳互补 TOP3**（协同度最高）：' + l.bestSyn.map(r=>`${r.nameA}+${r.nameB}(${(r.synergy>=0?'+':'')+fmtPct(r.synergy)})`).join('、') + '。');
  lines.push('- **最差互补 TOP3**（协同度最低）：' + l.worstSyn.map(r=>`${r.nameA}+${r.nameB}(${(r.synergy>=0?'+':'')+fmtPct(r.synergy)})`).join('、') + '。');
  lines.push('');

  lines.push('## 兵种平衡（骑/步/弓 跨地形攻方胜率）');
  lines.push('');
  lines.push('> 同源同属性武将（曹操）克隆出不同兵种标签，守方固定为步；对每个 (兵种,地形) 取「T 攻 vs 步守」与「步攻 vs T 守」两侧均值，抵消攻方先手偏置，隔离「地形兵种加成」单一变量。数值 0.5 为中立，越高代表该兵种在该地形收益越大。');
  lines.push('');
  lines.push('| 兵种 | 跨地形平均胜率 | 标记 |');
  lines.push('| --- | ---: | --- |');
  tr.TROOPS.forEach(T=>{
    lines.push(`| ${T} | ${fmtPct(tr.avg[T])} | ${tr.flags[T]} |`);
  });
  lines.push('');
  const tkList = Object.keys(TERRAIN);
  lines.push('### 地形 × 兵种 兵种强度矩阵（攻防两侧均值，0.5=中立）');
  lines.push('');
  lines.push('| 地形 | ' + tr.TROOPS.join(' | ') + ' |');
  lines.push('| --- | ' + tr.TROOPS.map(()=> '---:').join(' | ') + ' |');
  tkList.forEach(tk=>{
    lines.push(`| ${TERRAIN[tk].name} | ` + tr.TROOPS.map(T=>fmtPct(tr.matrix[T][tk])).join(' | ') + ' |');
  });
  lines.push('');
  lines.push(`兵种平均胜率均值=${fmtPct(tr.mean)}，标准差=${fmtPct(tr.std)}，过强阈值>${fmtPct(tr.OP)}，过弱阈值<${fmtPct(tr.UP)}。`);
  lines.push('- 若某兵种跨地形平均胜率偏离 ±1.5σ，可在 `terrain.csv` 调整对应 `cav`/`inf`/`arch` 列收口。');
  lines.push('');

  lines.push('## 调平建议');
  lines.push('');
  lines.push('- 对 **过强** 武将：下调 `force`/`intellect` 或 `suit`，或在 CSV 中降星；对 **过弱** 武将反向调整。');
  lines.push('- 对 **过防御** 地形：下调 `def`/`choke`；对 **欠防御** 地形：上调 `def`。');
  lines.push('- 对 **过强阵容**：考虑在 CSV 中为组合中核心武将加「互斥/同阵营减益」或下调其 `suit`；**过弱阵容** 反向处理。');
  lines.push('- 对 **过强/过弱兵种**：在 `terrain.csv` 调整该兵种对应的 `cav`/`inf`/`arch` 列，使三兵种跨地形均值收敛。');
  lines.push('- 改完 CSV 后重跑本脚本，对比综合力均值与标准差是否收敛（标准差越小越均衡）。');
  lines.push('');
  fs.writeFileSync(path.join(__dirname,'balance_report.md'), lines.join('\n'), 'utf8');
}

main();
