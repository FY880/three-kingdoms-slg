// 真实浏览器试玩诊断：加载 standalone，抓报错，走 开局→关intro→推进时辰→点地块 流程
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const url = 'file://' + path.join(__dirname, '..', 'dist', 'index.standalone.html');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 820 } });

  const logs = [];
  const errors = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  console.log('LOAD', url);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  // 截图1：intro 是否出现
  await page.screenshot({ path: path.join(__dirname, 'shot-1-intro.png') });

  // 检查 intro 可见性
  const introVisible = await page.evaluate(() => {
    const el = document.getElementById('intro');
    return el ? getComputedStyle(el).display !== 'none' : 'no-el';
  });
  console.log('INTRO_VISIBLE:', introVisible);

  // 检查关键函数/全局是否存在
  const globals = await page.evaluate(() => ({
    RULES: typeof window.RULES,
    RULES_DATA: typeof window.RULES_DATA,
    startScenario: typeof window.startScenario,
    genMap: typeof window.genMap,
    render: typeof window.render,
    map: typeof window.map,
    mapLen: (window.map && window.map.length) || 0,
    SCN: window.SCN ? window.SCN.id : 'none',
    canvasW: (document.getElementById('cv')||{}).width,
    canvasH: (document.getElementById('cv')||{}).height,
  }));
  console.log('GLOBALS:', JSON.stringify(globals));

  // 关 intro
  const closed = await page.evaluate(() => {
    if (window.closeIntro) { window.closeIntro(); return true; }
    const b = document.querySelector('#introCard .go'); if (b) { b.click(); return 'clicked'; }
    return false;
  });
  console.log('CLOSE_INTRO:', closed);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'shot-2-map.png') });

  // canvas 是否渲染了内容（非纯色）
  const canvasInfo = await page.evaluate(() => {
    const cv = document.getElementById('cv'); if (!cv) return 'no-canvas';
    const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let nonBg = 0; const bg = [14,17,22];
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2]) > 12) nonBg++;
    }
    return { w: cv.width, h: cv.height, nonBgPx: nonBg, totalPx: cv.width*cv.height };
  });
  console.log('CANVAS:', JSON.stringify(canvasInfo));

  // 点 btnTime 推进时辰
  let timeErr = null;
  try {
    await page.evaluate(() => { const b = document.getElementById('btnTime'); if (b) b.click(); });
    await page.waitForTimeout(300);
  } catch (e) { timeErr = e.message; }
  console.log('BTNTIME_ERR:', timeErr);
  await page.screenshot({ path: path.join(__dirname, 'shot-3-aftertime.png') });

  // 点地图中心格（尝试选中/出征）
  try {
    const box = await page.evaluate(() => {
      const cv = document.getElementById('cv'); const r = cv.getBoundingClientRect();
      return { x: r.x + r.width/2, y: r.y + r.height/2 };
    });
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(300);
  } catch (e) { console.log('CLICK_ERR:', e.message); }
  await page.screenshot({ path: path.join(__dirname, 'shot-4-click.png') });

  console.log('\n===== CONSOLE LOGS =====');
  console.log(logs.join('\n') || '(none)');
  console.log('\n===== PAGE ERRORS =====');
  console.log(errors.join('\n') || '(none)');

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
