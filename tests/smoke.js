// 冒烟测试：用 DOM 桩在 vm 沙箱中运行 index.html 的内联脚本，验证外交/热加载/战斗等路径
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const rules = require('/workspace/src/rules.js');

// ---- 提取 index.html 最后一个 <script>（内联逻辑）----
const html = fs.readFileSync('/workspace/index.html', 'utf8');
const m = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(x => x[1].includes('window.RULES'));
if (!m) { console.error('未找到内联脚本'); process.exit(1); }
const code = m[1];

// ---- DOM 桩 ----
function makeEl(id){
  return {
    id, _text:'', _html:'', children:[], onclick:null, _listeners:{},
    classList:{ _s:new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
      toggle(c,f){ if(f===undefined) f=!this._s.has(c); f?this._s.add(c):this._s.delete(c); return f; },
      contains(c){return this._s.has(c);} },
    set textContent(v){ this._text=String(v); }, get textContent(){ return this._text; },
    set innerHTML(v){ this._html=String(v); }, get innerHTML(){ return this._html; },
    prepend(c){ this.children.unshift(c); },
    addEventListener(t,fn){ (this._listeners[t]=this._listeners[t]||[]).push(fn); },
    getContext(){ return ctxStub; },
    getBoundingClientRect(){ return {left:0,top:0,width:800,height:600}; },
    clientWidth:800, clientHeight:600, width:800, height:600,
    closest(){ return null; }, dataset:{}
  };
}
const ctxStub = new Proxy({}, { get:()=>(()=>{}) });
const registry = {};
const documentStub = {
  getElementById(id){ return registry[id] || (registry[id]=makeEl(id)); },
  createElement(){ return makeEl('div'); },
  addEventListener(){}
};
const windowStub = { RULES: rules, addEventListener(){}, closeSheet:null, closeDiplomacy:null };

// fetch 桩：读本地 data/ 下的 CSV
const fetchStub = async (url) => {
  const name = url.split('/').pop();
  const p = path.join('/workspace/data', name);
  const txt = fs.readFileSync(p, 'utf8');
  return { ok:true, status:200, text: async () => txt };
};

const sandbox = {
  window: windowStub, document: documentStub, fetch: fetchStub,
  setTimeout: () => 0, clearTimeout: () => {}, console,
  requestAnimationFrame: () => 0,            // 天气动画循环桩（不实际驱动，避免无头环境死循环）
  Math, Object, Array, JSON, Number, String, Promise, parseFloat, parseInt, isNaN
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'inline.js' });

// 工具
const get = id => registry[id];
const assert = (c, msg) => { if (!c) { console.error('FAIL: ' + msg); process.exitCode = 1; } else console.log('PASS: ' + msg); };

async function main(){
assert(get('tLand').textContent.startsWith('领地'), '初始化后顶栏领地已渲染: ' + get('tLand').textContent);
assert(get('legend').innerHTML.includes('曹操'), '图例含诸侯势力');

// ---- 2. 外交：与全部 AI 结盟 → AI 不会攻玩家 ----
['ai_cao','ai_liu','ai_sun','ai_dong'].forEach(id => sandbox.playerSetRel(id, 'ally'));
const dipHtml = get('dipBody').innerHTML;
assert(dipHtml.includes('关系：同盟'), '外交面板显示与诸侯为同盟');
const landBefore = get('tLand').textContent;
for (let i=0;i<10;i++) sandbox.aiTurn();
assert(get('tLand').textContent === landBefore, '全部同盟后玩家领地未被侵占 ('+landBefore+'→'+get('tLand').textContent+')');

// ---- 3. 外交：先与 ai_cao 同盟，再与 ai_dong 敌对 → ai_cao 应视 ai_dong 为敌（共同讨伐）----
sandbox.playerSetRel('ai_dong', 'neutral'); // 复位
sandbox.playerSetRel('ai_cao', 'ally');
sandbox.playerSetRel('ai_dong', 'war');
const dipHtml2 = get('dipBody').innerHTML;
assert(dipHtml2.includes('关系：敌对'), '外交面板显示与 ai_dong 敌对');
// 用 scoreTarget 验证 co-attack 加成：ai_cao 对“敌对 ai_dong”地块评分应高于对中立 ai_sun 地块
// 评分方兵力设高以通过战力阈值
const scorer = {id:'ai_cao', personality:'稳健', strength:3000};
const defA = sandbox.defenderArmy({ owner:'ai_dong', t:'plain', lvl:1, soldiers:100 });
const scRival = sandbox.scoreTarget(scorer, { owner:'ai_dong', t:'plain', lvl:1, soldiers:100 }, defA);
const defB = sandbox.defenderArmy({ owner:'ai_sun', t:'plain', lvl:1, soldiers:100 });
const scNormal = sandbox.scoreTarget(scorer, { owner:'ai_sun', t:'plain', lvl:1, soldiers:100 }, defB);
assert(scRival > scNormal, '共同讨伐：ai_cao 对敌对 ai_dong 的评分更高 ('+scRival+' > '+scNormal+')');

// ---- 4. 战斗路径：找一个可进攻目标并出征（先复位关系，避免误判为盟友）----
['ai_cao','ai_liu','ai_sun','ai_dong'].forEach(id => sandbox.playerSetRel(id, 'neutral'));
let target=null;
for (let y=0;y<56 && !target;y++) for (let x=0;x<80;x++){ if (sandbox.validTarget(x,y)){ target={x,y}; break; } }
assert(target, '存在连地相邻的可进攻目标');
if (target){
  let herr=null;
  try { sandbox.handleTap(target.x, target.y); } catch(e){ herr=e; }
  console.log('DBG handleTap err:', herr && herr.message, '| typeof:', typeof sandbox.handleTap, '| log el:', !!registry['log']);
  const logEl = get('log');
  assert(logEl && logEl.children.length > 0, '点击出征后产生战报日志');
}

// ---- 5. 配表热加载：改一处数值后通过 loadCSVFromDir 生效 ----
const tmpDir = '/tmp/csvtest';
fs.rmSync(tmpDir, {recursive:true, force:true}); fs.mkdirSync(tmpDir, {recursive:true});
['terrain','weather','season','formations','generals'].forEach(k=> fs.copyFileSync('/workspace/data/'+k+'.csv', tmpDir+'/'+k+'.csv'));
let terr = fs.readFileSync(tmpDir+'/terrain.csv','utf8');
terr = terr.replace(/^plain,.*$/m, 'plain,平原,9.9,1.0,1.0,1.15,1.0,1.0,0.9,1.0,0,0,0,0,#cfe8a9,骑兵主场');
fs.writeFileSync(tmpDir+'/terrain.csv', terr);
assert(rules.TERRAIN.plain.move === 1, '热加载前 plain.move=1 (默认)');
rules.loadCSVFromDir(tmpDir);
assert(rules.TERRAIN.plain.move === 9.9, '热加载后 plain.move 变为 9.9（数值即时生效）');
fs.rmSync(tmpDir, {recursive:true, force:true});

// ---- 6. 浏览器配表按钮路径：btnReload 经 fetch 热加载 ----
rules.loadCSVFromDir('/workspace/data'); // 复位为默认，plain.move 回到 1
assert(rules.TERRAIN.plain.move === 1, '复位后 plain.move 回到 1');
await get('btnReload').onclick();
assert(rules.TERRAIN.plain.move === 1 && get('tLand').textContent.startsWith('领地'), 'btnReload 热加载路径执行无异常');

// ---- 7. 多剧本：切换剧本后诸侯阵容/出生点随剧本变化 ----
sandbox.startScenario('melee');
let st = sandbox.getState();
assert(st.SCN.id === 'melee', 'startScenario 切换到群雄逐鹿');
assert(st.playerHome[0] === 8 && st.playerHome[1] === 50, '群雄逐鹿玩家出生点 [8,50]');
assert(rules.getScenario('melee').victory.type === 'land', '群雄逐鹿胜利条件为占领土地');
const legendMelee = get('legend').innerHTML;
assert(legendMelee.includes('曹操') && legendMelee.includes('董卓'), '群雄逐鹿含曹操与董卓势力');

sandbox.startScenario('yellowturban');
st = sandbox.getState();
assert(st.SCN.id === 'yellowturban', 'startScenario 切换到黄巾之乱');
assert(st.playerHome[0] === 40 && st.playerHome[1] === 50, '黄巾之乱玩家出生点 [40,50]');
assert(Math.abs(rules.getScenario('yellowturban').neutralMul - 1.8) < 1e-9, '黄巾之乱中立强度倍率 1.8');
const legendYT = get('legend').innerHTML;
assert(legendYT.includes('曹操') && !legendYT.includes('董卓'), '黄巾之乱含曹操、不含董卓（阵容随剧本变化）');

sandbox.startScenario('dongzhuo');
st = sandbox.getState();
assert(st.SCN.id === 'dongzhuo', 'startScenario 切换到讨董卓');
assert(st.SCN.victory.type === 'defeatLord' && st.SCN.victory.lordId === 'ai_dong', '讨董卓胜利条件为击灭董卓');

// ---- 8. 剧本事件：讨董第4时辰各路自发讨董（rivalAll）----
const evs = rules.eventsDueAt(rules.getScenario('dongzhuo'), 4);
assert(evs.length === 1 && evs[0].type === 'rivalAll', '讨董剧本第4时辰存在 rivalAll 事件');
sandbox.applyEvent(evs[0]);
st = sandbox.getState();
assert(rules.getRelation(st.DIP, 'player', 'ai_dong') === 'rival', '事件后玩家与董卓为敌对（你亦自发讨董）');
assert(rules.isRival(st.DIP, 'ai_cao', 'ai_dong') === true, '事件后曹操亦视董卓为敌对（共同讨伐）');
assert(get('log').children.some(c => c.innerHTML.includes('讨董')), '战报记录“讨董”事件');

// ---- 9. 胜负判定：占领达标判胜 / 领地归零判负 / 击灭目标诸侯判胜 ----
// 9a 占领达标：把全图标记为玩家 → 群雄逐鹿(land=60)判胜
sandbox.startScenario('melee');
st = sandbox.getState();
st.map.forEach(r => r.forEach(c => { if (c.owner !== 'player') c.owner = 'player'; }));
sandbox.checkEnd();
st = sandbox.getState();
assert(st.gameOver === true, '全图归玩家后 gameOver=true（占领达标判胜）');
assert(get('toast').textContent.includes('霸业'), '占领达标提示“霸业有成”');

// 9b 领地归零：把玩家领地清空 → 判负
sandbox.startScenario('melee');
st = sandbox.getState();
st.map.forEach(r => r.forEach(c => { if (c.owner === 'player') c.owner = 'none'; }));
sandbox.checkEnd();
st = sandbox.getState();
assert(st.gameOver === true, '玩家领地归零后 gameOver=true（判负）');
assert(get('toast').textContent.includes('全灭'), '判负提示“势力已被全灭”');

// 9c 击灭目标：讨董卓中清空董卓领地 → 判胜
sandbox.startScenario('dongzhuo');
st = sandbox.getState();
st.map.forEach(r => r.forEach(c => { if (c.owner === 'ai_dong') c.owner = 'none'; }));
sandbox.checkEnd();
st = sandbox.getState();
assert(st.gameOver === true, '董卓领地归零后 gameOver=true（击灭目标判胜）');
assert(get('toast').textContent.includes('讨灭'), '击灭目标提示“讨灭董卓”');

// ---- 10. 渲染新绘制代码（地形字形/边界/天气粒子）在 stub ctx 下不报错 ----
sandbox.startScenario('melee');
let renderErr = null;
try {
  sandbox.render();                          // 晴天下基础绘制
  for (let i = 0; i < 12; i++) { get('btnTime').onclick(); } // 推进时辰，覆盖雨/雪/雾/风/旱各天气分支
} catch (e) { renderErr = e; }
assert(!renderErr, '多种天气下 render() 持续绘制无异常' + (renderErr ? '：' + renderErr.message : ''));

console.log('\n=== 冒烟测试完成 ===');
}

main().catch(e=>{ console.error('运行异常:', e); process.exit(1); });
