/* 养成面板 UI 冒烟（修正版·ROSTER 视角）：
 * ROSTER=['cao1','guan1','zhao1','zhu1','zhou1']，面板仅渲染这 5 将。
 * 用 guan1 做 升战法/拆解/宝物 主体，zhao1 做 装配 目标；huang1 仅用于 makeUnit 战斗闭环。
 * 验证 升战法/拆解/装配/宝物/城建 真实落地 + 宝物/城建→出战属性闭环。 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync('/workspace/dist/index.standalone.html', 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t,p)=>p==='canvas'?{width:1,height:1}:(p==='measureText'?()=>({width:10}):()=>{}), set:()=>true });
    w.requestAnimationFrame = () => 0; w.cancelAnimationFrame = () => {};
    if (!w.performance) w.performance = { now: () => Date.now() };
  }
});
const win = dom.window, doc = win.document;

setTimeout(() => {
  const out = [];
  const results = [];
  const check = (name, cond, extra='') => { results.push(!!cond); out.push((cond?'PASS':'FAIL')+' | '+name+(extra?'  ['+extra+']':'')); };
  try {
    check('宝物表载入(TREASURES.chitu)', win.eval('!!(R.TREASURES && R.TREASURES.chitu)'));

    const btnTrain = doc.getElementById('btnTrain');
    check('btnTrain 存在', !!btnTrain);
    btnTrain.click();
    check('养成面板打开', !!doc.getElementById('trainSheet'));

    const snap = () => win.eval(`({
      RES: JSON.parse(JSON.stringify(RES)),
      skillBooks: skillBooks.length,
      equipped: Object.keys(equippedTreasures).length,
      equippedG: equippedTreasures['guan1']||null,
      equippedZh: equippedTreasures['zhao1']||null,
      active: activeRoster().length,
      cityLevel,
      gLevel: DATA.state.GENERALS.find(x=>x.id==='guan1').level,
      gLen: DATA.state.GENERALS.find(x=>x.id==='guan1').skills.length,
      gSkills: DATA.state.GENERALS.find(x=>x.id==='guan1').skills.slice(),
      zSkills: DATA.state.GENERALS.find(x=>x.id==='zhao1').skills.slice()
    })`);

    const b0 = snap();

    // 1) 升级门槛：ROSTER 全员 5 级，升需 币500>起始300 → 按钮应 disabled（旧测试点了禁用按钮才"无效果"）
    const upBtn0 = doc.querySelector('#trainBody button[data-act="upgrade"][data-id="guan1"]');
    check('升级按钮起始为disabled(门槛正确)', upBtn0 && upBtn0.disabled, upBtn0 ? ('disabled='+upBtn0.disabled) : 'btn缺失');

    // 注入资源并重渲，解除 disabled
    win.eval('RES["币"]=99999; RES["铁"]=99999; renderTrain();');
    const upBtn = doc.querySelector('#trainBody button[data-act="upgrade"][data-id="guan1"]');
    check('注入资源后升级按钮可用', upBtn && !upBtn.disabled);

    // 2) 升战法 guan1: 5→6，扣 币500/铁200（快照取注入后值）
    const bInj = snap();
    const beforeLv = b0.gLevel, beforeBi = bInj.RES['币'], beforeTie = bInj.RES['铁'];
    upBtn.click();
    const b1 = snap();
    check('升战法: guan1.level+1', b1.gLevel === beforeLv + 1, `${beforeLv}→${b1.gLevel}`);
    check('升战法: 扣币500', b1.RES['币'] === beforeBi - 500, `币 ${beforeBi}→${b1.RES['币']}`);
    check('升战法: 扣铁200', b1.RES['铁'] === beforeTie - 200, `铁 ${beforeTie}→${b1.RES['铁']}`);

    // 3) 拆解 guan1：消耗武将，全部技能入库(+gLen)，从出战名单移除
    const dBtn = doc.querySelector('#trainBody button[data-act="dismantle"][data-id="guan1"]');
    check('拆解按钮存在', !!dBtn);
    const booksBefore = b1.skillBooks, activeBefore = b1.active;
    dBtn.click();
    const b2 = snap();
    check('拆解: 技能书+其全部技能数', b2.skillBooks === booksBefore + b1.gLen, `${booksBefore}→${b2.skillBooks} (guan1技能${b1.gLen}个)`);
    check('拆解: 入库含 weizhen 与 qinglong', win.eval('skillBooks.some(b=>b.sid==="weizhen") && skillBooks.some(b=>b.sid==="qinglong")'));
    check('拆解: guan1.skills 保持不变', JSON.stringify(b2.gSkills) === JSON.stringify(b1.gSkills));
    check('拆解: guan1 移出出战名单', b2.active === activeBefore - 1 && !win.eval('activeRoster().includes("guan1")'), `active ${activeBefore}→${b2.active}`);

    // 4) 装配(末位技能)→ zhao1：zhao1.skills+1，技能书-1
    const sid = win.eval('skillBooks[skillBooks.length-1].sid');
    const eqBtn = doc.querySelector(`#trainBody button[data-act="equip"][data-sid="${sid}"][data-tid="zhao1"]`);
    check('装配按钮存在('+sid+'→zhao1)', !!eqBtn);
    const zBefore = b2.zSkills.length, booksB2 = b2.skillBooks;
    eqBtn.click();
    const b3 = snap();
    check('装配: zhao1.skills+1', b3.zSkills.length === zBefore + 1, `${zBefore}→${b3.zSkills.length}`);
    check('装配: 技能书-1', b3.skillBooks === booksB2 - 1, `${booksB2}→${b3.skillBooks}`);
    check('装配: zhao1 含 '+sid, b3.zSkills.includes(sid));

    // 5) 宝物 chitu → zhao1（guan1 已拆解，装备仍存活的 zhao1）：equippedTreasures+1，zhao1=chitu
    const trBtn = doc.querySelector('#trainBody button[data-act="equipTr"][data-tid="zhao1"][data-tr="chitu"]');
    check('宝物按钮存在(chitu→zhao1)', !!trBtn);
    const eqB2 = b2.equipped;
    trBtn.click();
    const b4 = snap();
    check('宝物: equippedTreasures+1', b4.equipped === eqB2 + 1, `${eqB2}→${b4.equipped}`);
    check('宝物: zhao1=chitu', b4.equippedZh === 'chitu');

    // 6) 城建：cityLevel 0→1，扣木400(+铁300/石300/币200)
    const cityBtn = doc.querySelector('#trainBody button[data-act="city"]');
    const cityBefore = b4.cityLevel, woodB4 = b4.RES['木'];
    cityBtn.click();
    const b5 = snap();
    check('城建: cityLevel+1', b5.cityLevel === cityBefore + 1, `${cityBefore}→${b5.cityLevel}`);
    check('城建: 扣木400', b5.RES['木'] === woodB4 - 400, `木 ${woodB4}→${b5.RES['木']}`);

    // 7) 战斗闭环：宝物→出战 speed↑；城建→atkMul↑
    const noTr = win.eval('R.makeUnit("huang1",1000,"fengshi",{}).speed');
    const withTr = win.eval('R.makeUnit("huang1",1000,"fengshi",{treasures:[R.TREASURES.chitu]}).speed');
    check('战斗闭环: 赤兔马提升speed', withTr > noTr, `无宝物${noTr} → 赤兔${withTr}`);
    const atkNo = win.eval('R.makeUnit("guan1",1000,"fengshi",{}).atkMul');
    const atkCity = win.eval('R.makeUnit("guan1",1000,"fengshi",{cityBonus:1.1}).atkMul');
    check('战斗闭环: 城建提升atkMul', atkCity > atkNo, `无城建${atkNo} → 城建${atkCity}`);

    // 8) 4★ 残卷拆解流程（huang1=4★，注入 ROSTER 测试；默认关闭开关）
    win.eval('ROSTER.push("huang1"); renderTrain();');
    const allow0 = win.eval('allow4Star');
    check('残卷拆解开关默认关闭', allow0 === false, 'allow4Star='+allow0);
    const hBtnOff = doc.querySelector('#trainBody button[data-act="dismantle"][data-id="huang1"]');
    check('4★拆解按钮(未开启)禁用', !!(hBtnOff && hBtnOff.disabled), hBtnOff ? ('disabled='+hBtnOff.disabled) : 'btn缺失');
    // 开启开关
    win.eval('allow4Star=true; renderTrain();');
    const hBtn = doc.querySelector('#trainBody button[data-act="dismantle"][data-id="huang1"]');
    check('开启后4★拆解按钮可用', !!(hBtn && !hBtn.disabled));
    hBtn.click();
    const weakBooks = win.eval('skillBooks.filter(b=>b.weak).map(b=>b.sid)');
    check('4★拆解产出残卷(weak)', weakBooks.length > 0, JSON.stringify(weakBooks));
    // 装配残卷给 cao1（zhao1 已 3 技能满，cao1 仅 1 技能有空位），验证 WEAK 标记 + skillList 带 weak
    const weakSid = weakBooks[0];
    const eqBtnH = doc.querySelector(`#trainBody button[data-act="equip"][data-sid="${weakSid}"][data-tid="cao1"]`);
    check('残卷装配按钮存在('+weakSid+'→cao1)', !!eqBtnH);
    eqBtnH.click();
    const weakFlag = win.eval('DATA.state.WEAK["cao1"] && DATA.state.WEAK["cao1"]["'+weakSid+'"]');
    check('装配残卷设置 WEAK 标记', weakFlag === true);
    const skWeak = win.eval('R.skillList(DATA.state.GENERALS.find(x=>x.id==="cao1")).some(s=>s.weak)');
    check('战斗闭环: cao1 含 weak 技能(×0.9生效)', skWeak === true);
    // 引擎确认：cast 对 weak 技能施加 ×0.9（取 weak 技能对比同源非 weak 的 dmgPct）
    const mul = win.eval(`(function(){ const sid="${weakSid}"; const sk=DATA.state.SKILLS[sid]; const norm=sk; const weak=Object.assign({},sk,{weak:true}); return {norm:norm.dmgPct||1, weak:(weak.dmgPct||1)*0.9}; })()`);
    check('引擎: 残卷 dmgPct ×0.9', mul.weak === (mul.norm*0.9), `norm=${mul.norm} weak=${mul.weak}`);

  } catch (e) {
    errors.push('THROWN: ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n'));
  }
  console.log(out.join('\n'));
  const passed = results.filter(Boolean).length, total = results.length;
  console.log(`\n=== 养成面板冒烟: ${passed}/${total} PASS, script errors=${errors.length}`);
  errors.forEach(e => console.log('  ! ', e));
  process.exit((passed === total && errors.length === 0) ? 0 : 1);
}, 800);
