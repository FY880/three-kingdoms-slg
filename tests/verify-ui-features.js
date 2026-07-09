/* P0 新功能验收：右下角小地图 + 交互式新手引导。
 * 读取 dist/index.standalone.html（与 verify-zoom/region 同构，jsdom + getContext 桩）。
 * 覆盖：minimap 存在 / drawMinimap 不抛错 / zoom>=2.5 隐藏 / 教程 5 步结构 /
 *       遮罩挖洞 + 卡片按钮 / 步骤动作 / endTutorial 清理。 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync('/workspace/dist/index.standalone.html', 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t,p)=>p==='canvas'?{width:1,height:1}:(p==='measureText'?()=>({width:10}):()=>{}), set:()=>true });
    w.requestAnimationFrame = () => 0; w.cancelAnimationFrame = () => {};
    if (!w.performance) w.performance = { now: () => Date.now() };
  }
});
const win = dom.window, doc = win.document;

setTimeout(() => {
  const out = [], results = [];
  const check = (n, c, x='') => { results.push(!!c); out.push((c?'PASS':'FAIL')+' | '+n+(x?'  ['+x+']':'')); };
  try {
    win.eval('cv.getBoundingClientRect=function(){return {left:0,top:0,width:800,height:600};};');

    // —— 小地图存在 + 尺寸 ——
    const mm = doc.getElementById('minimap');
    check('小地图 canvas 存在于 DOM', !!mm);
    check('小地图尺寸 120×90', mm && mm.width===120 && mm.height===90, mm?`${mm.width}x${mm.height}`:'null');

    // —— drawMinimap 是函数，且 render() 末尾调用不抛错 ——
    check('drawMinimap 为函数', typeof win.drawMinimap==='function');

    // —— zoom<2.5：小地图可见 ——
    win.eval('zoom=1; centerCam(Math.floor(W/2),Math.floor(H/2)); render();');
    check('zoom=1 时小地图显示(display=block)', mm.style.display==='block', 'display='+mm.style.display);

    // —— zoom>=2.5：小地图隐藏 ——
    win.eval('zoom=3; render();');
    check('zoom>=2.5 时小地图隐藏(display=none)', mm.style.display==='none', 'display='+mm.style.display);
    win.eval('zoom=1; render();');

    // —— 小地图点击 → 换算到地图坐标并 panTo（不抛错 + 改变相机目标）——
    const before = win.eval('({tx:camTX,ty:camTY})');
    mm.dispatchEvent(new win.MouseEvent('click', { bubbles:true, clientX:0, clientY:0 }));
    const after = win.eval('({tx:camTX,ty:camTY})');
    check('小地图点击触发相机平移(panTo)', after.tx!==before.tx || after.ty!==before.ty, `camTX ${before.tx}→${after.tx}`);

    // —— 教程数据结构 ——
    const tlen = win.eval('window.TUTORIAL_STEPS ? window.TUTORIAL_STEPS.length : -1');
    check('TUTORIAL_STEPS 共 5 步', tlen===5, 'len='+tlen);
    const step0 = win.eval('JSON.stringify(TUTORIAL_STEPS[0])');
    check('第1步目标为 #mapWrap', /#mapWrap/.test(step0));
    const step3 = win.eval('((TUTORIAL_STEPS[3]||{}).action!==undefined)');
    check('第4步含 action(高亮可攻目标)', step3===true);
    check('tutorialStep 初始为 -1', win.eval('tutorialStep')===-1);

    // —— 直接驱动 showTutorialStep(0)：遮罩 + 卡片 + 挖洞 ——
    win.eval('showTutorialStep(0);');
    const ov = doc.getElementById('tutorialOverlay');
    const mask = doc.getElementById('tutorialMask');
    const card = doc.getElementById('tutorialCard');
    check('教程遮罩层 #tutorialOverlay 创建', !!ov);
    check('教程挖洞层 #tutorialMask 创建', !!mask);
    check('教程卡片 #tutorialCard 创建', !!card);
    check('遮罩层 z-index=70(高于 intro 60)', ov && ov.style.zIndex==='70', ov?('z='+ov.style.zIndex):'null');
    check('卡片含 下一步/跳过 按钮', !!(doc.getElementById('tutNext')&&doc.getElementById('tutSkip')));
    check('第1步(目标#mapWrap)遮罩变暗、卡片在最上层', ov && ov.style.background==='transparent' && card && card.style.zIndex==='72');
    check('第1步挖洞：mask 内生成 4 遮罩块 + 高亮框', mask && mask.children.length>=5, mask?('children='+mask.children.length):'null');
    check('第1步进度显示 1 / 5', /1 \/ 5/.test(card?card.textContent:''));

    // —— 第3步(目标 #btnTime, align above)：卡片置于目标上方 ——
    win.eval('showTutorialStep(2);');
    const card2 = doc.getElementById('tutorialCard');
    check('第3步(above)卡片 bottom 已设置', card2 && /px$/.test(card2.style.bottom||''), card2?('bottom='+card2.style.bottom):'null');

    // —— 第5步按钮文案应为“完成” ——
    win.eval('showTutorialStep(4);');
    const nextBtn = doc.getElementById('tutNext');
    check('第5步“下一步”按钮显示为完成', nextBtn && /完成/.test(nextBtn.textContent), nextBtn?nextBtn.textContent:'null');

    // —— endTutorial 清理 + 写 localStorage ——
    win.eval('endTutorial();');
    check('endTutorial 同步移除挖洞/卡片层', !doc.getElementById('tutorialMask') && !doc.getElementById('tutorialCard'));
    const ov2 = doc.getElementById('tutorialOverlay');
    check('endTutorial 遮罩层进入淡出(opacity=0)', !!ov2 && ov2.style.opacity==='0', ov2?('opacity='+ov2.style.opacity):'null');
    check('endTutorial 写 localStorage tk_tutorial_v1', (()=>{ try{ return win.localStorage.getItem('tk_tutorial_v1')==='1'; }catch(e){ return false; } })());
    check('endTutorial 后 tutorialStep=-1', win.eval('tutorialStep')===-1);

    // —— checkTutorial 幂等（防止重复触发）——
    win.eval('tutorialStep=-1; _tutChecked=false; checkTutorial();');
    check('checkTutorial 不抛错且已标记已检查', win.eval('_tutChecked')===true);

  } catch (e) {
    errors.push('THROWN: ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n'));
  }
  console.log(out.join('\n'));
  const passed = results.filter(Boolean).length, total = results.length;
  console.log(`\n=== P0 小地图+引导验收: ${passed}/${total} PASS, script errors=${errors.length}`);
  errors.forEach(e => console.log('  ! ', e));
  process.exit((passed === total && errors.length === 0) ? 0 : 1);
}, 800);
