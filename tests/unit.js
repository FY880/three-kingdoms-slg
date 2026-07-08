/* ============================================================
 *  unit.js —— 模块化单元测试（架构里程碑）
 *  直接 require 各子模块（util/data/combat/diplomacy/scenario）做隔离单测，
 *  再 require 聚合入口 rules.js 验证「聚合 + 热加载」集成。
 *  用法：node tests/unit.js   （失败非零退出，便于 CI）
 * ============================================================ */
const path = require('path');
const U = require('../src/util.js');
const D = require('../src/data.js');
const C = require('../src/combat.js');
const P = require('../src/diplomacy.js');
const S = require('../src/scenario.js');
const R = require('../src/rules.js');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

console.log('\n[util]');
ok(U.clamp(5, 0, 3) === 3, 'clamp 上限截断');
ok(U.clamp(-1, 0, 3) === 0, 'clamp 下限截断');
ok(U.clamp(2, 0, 3) === 2, 'clamp 区间内原值');
ok(['a', 'b'].includes(U.pick(['a', 'b'])), 'pick 返回集合内元素');

console.log('\n[data]');
ok(D.parseCSV('k,v\nx,1').length === 1 && D.parseCSV('k,v\nx,1')[0].v === '1', 'parseCSV 解析行与字段');
ok(D.state.TERRAIN.plain.move === 1, '默认 plain.move=1');
const tmp = path.join(require('os').tmpdir(), 'slg_bal_' + Date.now());
require('fs').mkdirSync(tmp, { recursive: true });
require('fs').writeFileSync(tmp + '/terrain.csv', 'key,name,move,atk,def,cav,inf,arch,eng,scout,ambush,flood,choke,marchDmg,color\nplain,平原,9.9,1,1,1,1,1,1,1,0,0,0,0,#fff\n');
D.reload({ terrain: D.parseCSV(require('fs').readFileSync(tmp + '/terrain.csv', 'utf8')) });
ok(D.state.TERRAIN.plain.move === 9.9, 'reload 后 state.TERRAIN.plain.move 即时变更');
// 复位：reload({}) 不会回退默认，需用完整 data 目录重新热加载
D.loadCSVFromDir(path.join(__dirname, '..', 'data'));
ok(D.state.TERRAIN.plain.move === 1, 'loadCSVFromDir 复位默认');
ok(D.state.TERRAIN.mountain !== undefined, 'loadCSVFromDir 复位后地形完整');
ok(Array.isArray(D.state.GENERALS) && D.state.GENERALS.length === 12, 'GENERALS 默认 12 名');

console.log('\n[combat]');
const u = C.makeUnit('lv1', 1000, 'fengshi');
ok(u.isBlade === true && u.primary === 100, 'makeUnit：吕布为兵刃将，primary=force=100');
const u2 = C.makeUnit('zhu1', 1000, 'fangyuan');
ok(u2.isBlade === false && u2.primary === 100, 'makeUnit：诸葛亮为谋略将，primary=intellect=100');
ok(C.suitCoef('S') === 1.2 && C.suitCoef('X') === 1.0, 'suitCoef：S 加成、未知回退 1.0');
ok(C.styleCoef('鹰扬', '持重') === 1.2, 'styleCoef：鹰扬克持重 +20%');
ok(C.styleCoef('持重', '鹰扬') === 0.85, 'styleCoef：被克 -15%');
ok(C.chooseFormation({ intellect: 80, style: '鹰扬', troop: '骑' }, { style: '持重', troop: '步' }, 'defile') === 'fengshi', 'chooseFormation：天险优先锋矢爆发');
ok(C.chooseFormation({ intellect: 50, style: '鹰扬', troop: '骑' }, { style: '持重', troop: '步' }, 'plain') !== 'bazhen', 'chooseFormation：智力不足不解锁八阵');
const env = C.environmentModifiers('mountain', 'sun', '骑');
ok(env.def === D.state.TERRAIN.mountain.def && env.choke === 1, 'environmentModifiers：山地高防+天险');
// simulateCombat 必在 maxRound 内收束
const a = [C.makeUnit('guan1', 1200, 'fengshi')], b = [C.makeUnit('zhang1', 1200, 'fangyuan')];
const res = C.simulateCombat(a, b, { terrain: 'plain', weather: 'sun' });
ok(res.round <= C.COMBAT_CFG.maxRound, 'simulateCombat：回合数 ≤ maxRound(10)');
ok(['攻方胜', '守方胜', '攻方胜(兵力占优)', '守方胜(兵力占优)'].some(p => res.result.indexOf('攻方胜') === 0 || res.result.indexOf('守方胜') === 0), 'simulateCombat：产出合法胜负');
ok(C.emptyFort(500, 1000).active === false, 'emptyFort：满血(>30%)不触发');
ok(C.emptyFort(200, 1000).active === true, 'emptyFort：残血(≤30%)触发');
ok(C.waterAttack('plain', 'sun').ok === false, 'waterAttack：晴天无效');
ok(C.waterAttack('river', 'rain').ok === true, 'waterAttack：雨天河流有效');
// 士气传染：向均值靠拢，且不越界
const sq = [{ morale: 20, alive: true }, { morale: 90, alive: true }];
C.squadMoraleContagion(sq);
ok(sq[0].morale > 20 && sq[0].morale < 90 && sq[1].morale < 90 && sq[1].morale > 20, 'squadMoraleContagion：向均值靠拢');
// 水攻持续：startFlood 设定时长，tickFlood 每回合递减并结算伤害
const tile = { t: 'river', soldiers: 1000, floodTurns: 0 };
const dur = C.startFlood(tile, 'rain');
ok(dur > 0 && tile.floodTurns === dur, 'startFlood：依天气设定持续回合');
const before = tile.soldiers; C.tickFlood(tile, 'rain');
ok(tile.soldiers < before && tile.floodTurns === dur - 1, 'tickFlood：结算伤害并递减');

console.log('\n[diplomacy]');
const dip = P.createDiplomacy(['player', 'ai_cao', 'ai_liu']);
ok(P.getRelation(dip, 'player', 'ai_cao') === 'neutral', 'createDiplomacy：默认中立');
ok(P.getRelation(dip, 'ai_cao', 'player') === 'neutral', 'createDiplomacy：关系对称');
P.setVassal(dip, 'ai_liu', 'player');
ok(P.isVassal(dip, 'ai_liu', 'player') === true, 'setVassal：单向臣服成立');
ok(P.canAttack(dip, 'player', 'ai_liu') === false && P.canAttack(dip, 'ai_liu', 'player') === false, 'setVassal：双方均不可互攻');
ok(P.peaceAcceptChance(dip, 'player', 'ai_cao', 50) === 0.2, 'peaceAcceptChance：基准信誉=0.2');
ok(P.peaceAcceptChance(dip, 'player', 'ai_cao', 200) === 0.9, 'peaceAcceptChance：高信誉封顶 0.9');
ok(P.peaceAcceptChance(dip, 'player', 'ai_cao', 0) === 0.05, 'peaceAcceptChance：极低信誉保底 0.05');
const dip2 = P.createDiplomacy(['player', 'ai_cao', 'ai_liu', 'ai_dong']);
P.applyScenarioEvent(dip2, { type: 'rivalAll', target: 'ai_dong', msg: '讨董' });
ok(P.isRival(dip2, 'ai_cao', 'ai_dong') && P.isRival(dip2, 'player', 'ai_dong'), 'applyScenarioEvent.rivalAll：众矢之的');
const dip3 = P.createDiplomacy(['player', 'ai_cao', 'ai_liu', 'ai_dong']);
P.applyScenarioEvent(dip3, { type: 'allyAll', target: 'ai_dong', msg: '同盟' });
ok(P.isAlly(dip3, 'ai_cao', 'ai_liu') && P.isRival(dip3, 'ai_cao', 'ai_dong'), 'applyScenarioEvent.allyAll：结盟且共敌');

console.log('\n[scenario]');
ok(S.getScenario('nope') === S.SCENARIOS[0], 'getScenario：未知 id 回退首个');
ok(S.getScenario('dongzhuo').victory.type === 'defeatLord', 'getScenario：讨董为击灭目标');
ok(S.eventsDueAt(S.getScenario('dongzhuo'), 3).length === 0, 'eventsDueAt：t=3 未到事件');
ok(S.eventsDueAt(S.getScenario('dongzhuo'), 4).length === 1, 'eventsDueAt：t=4 触发 rivalAll');

console.log('\n[rules 聚合入口]');
ok(R.simulateCombat && R.createDiplomacy && R.getScenario, '聚合暴露 combat/diplomacy/scenario API');
ok(R.TERRAIN === D.state.TERRAIN, '聚合 TERRAIN getter 指向 data.state（实时一致）');
// 热加载经聚合入口同样生效
R.loadCSVFromDir(path.join(__dirname, '..', 'data'));
ok(R.TERRAIN.plain.move === 1, '聚合 loadCSVFromDir：内置默认 move=1');
// 模块互相独立：combat 读到的 GENERALS 与 data 同源
ok(C.makeUnit('cao1', 10, 'fengshi').g.name === '曹操', 'combat.makeUnit 使用 data.GENERALS');

console.log('\n=== 单元测试完成：' + pass + ' PASS, ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
