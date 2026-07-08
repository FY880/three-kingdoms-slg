/* ============================================================
 *  balance.js —— 自动平衡脚本（数值工具）
 *  目标：用 loadCSVFromDir 热加载 data/*.csv，跑大规模战斗模拟，
 *       标出「过强 / 过弱武将」与「过防御 / 欠防御地形」，
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
  // 以平原为基准（地形加成≈0），其余偏离越多越偏防守
  const base = rows.find(r=>r.key==='plain').defWin;
  const mean = rows.reduce((s,r)=>s+r.defWin,0)/rows.length;
  const variance = rows.reduce((s,r)=>s+(r.defWin-mean)**2,0)/rows.length;
  const std = Math.sqrt(variance);
  const HOT = base + 1.2*std, COLD = base - 1.2*std;
  rows.forEach(r=>{
    r.dev = r.defWin - base;
    if (r.defWin > HOT) r.flag = '⚠️ 过防御（守方优势过大）';
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

  // 写 Markdown 报告
  writeReport(g, t, w);

  Math.random = _origRandom;     // 还原，避免污染其他脚本
  console.log('报告已写入 tests/balance_report.md');
}

function writeReport(g, t, w){
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
  lines.push('## 调平建议');
  lines.push('');
  lines.push('- 对 **过强** 武将：下调 `force`/`intellect` 或 `suit`，或在 CSV 中降星；对 **过弱** 武将反向调整。');
  lines.push('- 对 **过防御** 地形：下调 `def`/`choke`；对 **欠防御** 地形：上调 `def`。');
  lines.push('- 改完 CSV 后重跑本脚本，对比综合力均值与标准差是否收敛（标准差越小越均衡）。');
  lines.push('');
  fs.writeFileSync(path.join(__dirname,'balance_report.md'), lines.join('\n'), 'utf8');
}

main();
