const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 820 } });
  page.on('pageerror', e => console.log('ERR:', e.message));
  await page.goto('file:///workspace/dist/index.standalone.html', { waitUntil: 'load' });
  await page.waitForTimeout(700);
  await page.evaluate(() => { if(window.closeIntro) window.closeIntro(); });
  await page.waitForTimeout(300);

  // 抓取所有按钮和菜单
  const ui = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('#bottombar button, #top button, #zoomBar button')].map(b => ({id:b.id, text:b.innerText.trim()}));
    const sheets = [...document.querySelectorAll('#sheet, #dipSheet, #scnSheet, #trainSheet')].map(s => ({id:s.id, children:s.children.length}));
    return { buttons, sheets, title: document.title };
  });
  console.log('UI_BUTTONS:', JSON.stringify(ui.buttons, null, 1));

  // 打开每个底部菜单截图
  const menus = ['养成','外交','剧本','配置'];
  for (const name of menus) {
    const clicked = await page.evaluate((nm) => {
      const b = [...document.querySelectorAll('#bottombar button')].find(x => x.innerText.includes(nm));
      if (b) { b.click(); return true; } return false;
    }, name);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/workspace/tests/menu-${name}.png` });
    console.log(`MENU ${name}: opened=${clicked}`);
  }
  await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
