/* ============================================================
 *  engine-adapter.js —— 引擎接入示例（Godot / Cocos / Unity）
 *  证明「逻辑层零 DOM 依赖、可整体平移」的移植接口：
 *    1) 取 RULES（浏览器取 window.RULES / 引擎执行 bundle 后取全局 RULES / Node require）；
 *    2) 用 loadCSVFromDir 注入 data/*.csv（或引擎自带配表加载器）；
 *    3) 调用纯函数做战斗/外交/阵容推演；
 *    4) 渲染与输入由引擎自管。
 *  运行：node tools/engine-adapter.js
 * ============================================================ */
const path = require('path');

// —— 1) 取 RULES：引擎侧通常是 `const R = RustlerRULES`（Godot JS Bridge）或
//        `import R from './rules.bundle'`(Cocos ts)；这里用 bundle 演示一致性 ——
const R = require('../dist/rules.bundle.js');

// —— 2) 注入配表（引擎可用自己的 CSV/JSON 加载器替代）——
R.loadCSVFromDir(path.join(__dirname, '..', 'data'));

// —— 3) 纯函数推演（无 DOM、无副作用于渲染层）——
function demoBattle() {
  const att = [R.makeUnit('guan1', 1500, R.chooseFormation(R.GENERALS.find(g => g.id === 'guan1'), R.GENERALS.find(g => g.id === 'zhang1'), 'plain'))];
  const def = [R.makeUnit('zhang1', 1500, 'fangyuan')];
  const res = R.simulateCombat(att, def, { terrain: 'plain', weather: 'sun' });
  return `战斗：关羽(攻) vs 张飞(守) → ${res.result}（${res.round} 回合）`;
}

function demoDiplomacy() {
  const dip = R.createDiplomacy(['player', 'ai_cao', 'ai_liu', 'ai_dong']);
  R.setVassal(dip, 'ai_liu', 'player');           // 刘备臣服于玩家
  const canHit = R.canAttack(dip, 'player', 'ai_liu'); // 附庸不可互攻
  R.applyScenarioEvent(dip, { type: 'rivalAll', target: 'ai_dong' }); // 众矢之的
  return `外交：刘备臣服=${R.isVassal(dip, 'ai_liu', 'player')}，玩家可攻刘备=${canHit}，共讨董卓=${R.isRival(dip, 'ai_cao', 'ai_dong')}`;
}

function demoScenario() {
  const scn = R.getScenario('dongzhuo');
  return `剧本：讨董卓，胜利条件=${scn.victory.type}，第4时辰事件=${scn.events[0].type}`;
}

console.log('=== 引擎接入示例（纯逻辑层，零 DOM）===');
console.log(demoBattle());
console.log(demoDiplomacy());
console.log(demoScenario());
console.log('\n→ Godot：用 JavaScript Bridge 执行 rules.bundle.js 后读全局 RULES；');
console.log('→ Cocos：ts 中 `import R from "./rules.bundle"`；');
console.log('→ Unity：把 bundle 作为 .jslib，C# 侧用 UnityEngine.JSAgent 调用 RULES.*');
