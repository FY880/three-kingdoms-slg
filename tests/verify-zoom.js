/* 缩放回归：验证 zoom 统一作用于 位置/相机/裁剪/点击换算，且相邻地块不重叠。
 * jsdom 无布局，故 stub VW/VH=800x600 与 getBoundingClientRect。 */
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
  const out = [], results = [];
  const check = (n, c, x='') => { results.push(!!c); out.push((c?'PASS':'FAIL')+' | '+n+(x?'  ['+x+']':'')); };
  try {
    win.eval('VW=function(){return 800;}; VH=function(){return 600;};');
    win.eval('cv.getBoundingClientRect=function(){return {left:0,top:0,width:800,height:600};};');
    const zooms = [1, 2, 0.6, 3];
    for (const z of zooms) {
      win.eval(`zoom=${z}; centerCam(Math.floor(W/2), Math.floor(H/2)); render();`);
      const info = win.eval(`(function(){ const cs=CS*zoom; const tx=Math.floor(W/2), ty=Math.floor(H/2);
        return {cs, tx, ty, px:tx*CS*zoom-camX, py:ty*CS*zoom-camY, pxN:(tx+1)*CS*zoom-camX, W, H}; })()`);
      const cell = win.eval(`screenToCell(${info.px+info.cs/2}, ${info.py+info.cs/2})`);
      check(`zoom=${z}: 点击换算回环`, cell && cell.x===info.tx && cell.y===info.ty, `got ${cell?JSON.stringify(cell):'null'}`);
      check(`zoom=${z}: 相邻地块无重叠(px间距=cs)`, Math.abs((info.pxN-info.px)-info.cs) < 0.001, `间距=${(info.pxN-info.px).toFixed(2)} cs=${info.cs.toFixed(2)}`);
      const cull = win.eval(`(function(){ const x0=Math.max(0,Math.floor(camX/(CS*zoom))), x1=Math.min(W-1,Math.ceil((camX+VW())/(CS*zoom))); const y1=Math.min(H-1,Math.ceil((camY+VH())/(CS*zoom))); return {x0,x1,y1}; })()`);
      check(`zoom=${z}: 裁剪范围在界内`, cull.x0>=0 && cull.x1<info.W && cull.y1<info.H, JSON.stringify(cull));
    }
    win.eval('zoom=3; camX=1e9; camY=1e9; clampCam();');
    const c = win.eval('({camX,camY,W,H,CS,zoom,VW:VW(),VH:VH()})');
    const maxX = c.W*c.CS*c.zoom - c.VW, maxY = c.H*c.CS*c.zoom - c.VH;
    check('clampCam: 放大后相机不越右下界', c.camX<=Math.max(0,maxX)+0.001 && c.camY<=Math.max(0,maxY)+0.001, `camX=${c.camX.toFixed(0)} maxX=${maxX.toFixed(0)}`);
    // 焦点锚定：滚轮缩放后，光标下的世界格应大致保持
    win.eval('zoom=1; centerCam(Math.floor(W/2),Math.floor(H/2)); const before=screenToCell(400,300); window.__b=before;');
    win.eval('cv.dispatchEvent(new WheelEvent("wheel",{deltaY:-100,clientX:400,clientY:300,bubbles:true,cancelable:true}));');
    const after = win.eval('screenToCell(400,300)');
    const b = win.eval('window.__b');
    check('焦点锚定: 滚轮缩放光标下格不变', b && after && b.x===after.x && b.y===after.y, `before ${JSON.stringify(b)} after ${JSON.stringify(after)}`);
  } catch (e) {
    errors.push('THROWN: ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n'));
  }
  console.log(out.join('\n'));
  const passed = results.filter(Boolean).length, total = results.length;
  console.log(`\n=== 缩放回归: ${passed}/${total} PASS, errors=${errors.length}`);
  errors.forEach(e => console.log('  ! ', e));
  process.exit((passed === total && errors.length === 0) ? 0 : 1);
}, 800);
