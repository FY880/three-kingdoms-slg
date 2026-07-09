// 完整试玩流程诊断：开局→找玩家格→选它→攻相邻→战斗→推进→循环
// 捕获所有 console/pageerror，每步截图+状态快照
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const url = 'file://' + path.join(__dirname, '..', 'dist', 'index.standalone.html');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 820 } });

  const logs = [], errors = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => errors.push(e.message));

  function snap(name) {
    return page.screenshot({ path: path.join(__dirname, `pt-${name}.png`) });
  }

  async function state() {
    return page.evaluate(() => {
      // map is local scope; use functions that read it
      const cv = document.getElementById('cv');
      return {
        gameOver: typeof window.gameOver !== 'undefined' ? window.gameOver : 'N/A',
        zoom: window.zoom,
        camX: window.camX,
        camY: window.camY,
        CS: window.CS,
        W: window.W,
        H: window.H,
        VW: typeof window.VW === 'function' ? window.VW() : 'N/A',
        VH: typeof window.VH === 'function' ? window.VH() : 'N/A',
        cvW: cv ? cv.width : 0,
        cvH: cv ? cv.height : 0,
        topText: document.getElementById('top') ? document.getElementById('top').innerText.substring(0,120) : '',
        objBar: document.getElementById('objBar') ? document.getElementById('objBar').innerText.substring(0,100) : '',
        resBar: document.getElementById('resBar') ? document.getElementById('resBar').innerText.substring(0,120) : '',
      };
    });
  }

  console.log('=== STEP 0: LOAD ===');
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  console.log(await state());
  await snap('00-load');

  // 关闭 intro
  console.log('\n=== STEP 1: CLOSE INTRO ===');
  await page.evaluate(() => { if(window.closeIntro) window.closeIntro(); });
  await page.waitForTimeout(500);
  console.log(await state());
  await snap('01-afterintro');

  // 找玩家起始格 [8,50]，检查它在屏幕上的位置
  console.log('\n=== STEP 2: FIND PLAYER HOME ===');
  const homeInfo = await page.evaluate(() => {
    const x=8, y=50;
    const cs = CS*zoom;
    const px = Math.round(x*cs - camX), py = Math.round(y*cs - camY);
    const cell = map[y][x];
    return { x,y, px, py, owner: cell.owner, land: cell.land, terrain: cell.t, region: cell.region, soldiers: cell.soldiers, capital: cell.capital };
  });
  console.log('PLAYER_HOME:', JSON.stringify(homeInfo));
  // homeInfo.px/py 是该格在画布上的像素坐标（左上角）
  // 如果 px<0 或 py<0 或 px>cvW 或 py>cvH，说明不在可视区！

  // 获取 canvas 在页面中的位置
  const cvRect = await page.evaluate(() => document.getElementById('cv').getBoundingClientRect());
  const screenHomeX = cvRect.x + homeInfo.px;
  const screenHomeY = cvRect.y + homeInfo.py;
  console.log(`HOME ON SCREEN: (${screenHomeX.toFixed(1)}, ${screenHomeY.toFixed(1)})`);
  console.log(`VIEWPORT: w=${cvRect.width} h=${cvRect.height}`);
  console.log(`VISIBLE? x=${homeInfo.px>=0 && homeInfo.px<cvRect.width} y=${homeInfo.py>=0 && homeInfo.py<cvRect.height}`);
  await snap('02-home-loc');

  // 点玩家起始格
  console.log('\n=== STEP 3: TAP HOME TILE ===');
  await page.mouse.click(screenHomeX, screenHomeY);
  await page.waitForTimeout(500);
  const afterTapHome = await page.evaluate(() => ({
    sheetVisible: document.getElementById('sheet')?.style.transform || 'none',
    infoHTML: document.getElementById('info')?.innerHTML?.substring(0,200) || '',
  }));
  console.log('AFTER_TAP_HOME:', JSON.stringify(afterTapHome));
  await snap('03-taphome');

  // 关掉面板
  await page.evaluate(() => { if(window.closeSheet) closeSheet(); });
  await page.waitForTimeout(200);

  // 找 home 相邻的可攻击目标
  console.log('\n=== STEP 4: FIND VALID TARGETS NEAR HOME ===');
  const targets = await page.evaluate(() => {
    const results = [];
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=8+dx, ny=50+dy;
      if(nx>=0&&nx<W&&ny>=0&&ny<H){
        const c=map[ny][nx];
        results.push({x:nx,y:ny,owner:c.owner,land:c.land,t:c.t,soldiers:c.soldiers,region:c.region,capital:c.capital});
      }
    }
    return results;
  });
  console.log('NEIGHBORS:', JSON.stringify(targets));

  // 找一个 validTarget（非玩家且相邻）
  // validTarget 需要检查是否与玩家领地相邻——home 本身就是玩家领地，所以邻居应该都是 validTarget（只要不是玩家自己的）
  const target = targets.find(t => t.owner !== 'player');
  if(!target){ console.log('NO VALID TARGET NEAR HOME!'); }
  else {
    console.log('TARGET:', JSON.stringify(target));
    const tPx = await page.evaluate((tx,ty) => {
      const cs=CS*zoom; return {px:Math.round(tx*cs-camX),py:Math.round(ty*cs-camY)};
    }, target.x, target.y);
    const tScreenX = cvRect.x + tPx.px, tScreenY = cvRect.y + tPx.py;

    console.log('\n=== STEP 5: TAP TARGET TILE (BATTLE PREVIEW) ===');
    await page.mouse.click(tScreenX, tScreenY);
    await page.waitForTimeout(600);

    const afterPreview = await page.evaluate(() => ({
      sheetVisible: document.getElementById('sheet')?.style.transform || 'none',
      infoHTML: document.getElementById('info')?.innerHTML?.substring(0,300) || '',
      btnGoExists: !!document.getElementById('btnGo'),
      btnCancelExists: !!document.getElementById('btnCancel'),
      pendingBattle: !!window.pendingBattle,
    }));
    console.log('PREVIEW:', JSON.stringify(afterPreview));
    await snap('04-preview');

    if(afterPreview.btnGoExists){
      console.log('\n=== STEP 6: CLICK 出征 (COMMIT BATTLE) ===');
      await page.evaluate(() => { const b=document.getElementById('btnGo'); if(b)b.click(); });
      await page.waitForTimeout(800);

      const afterBattle = await page.evaluate(() => ({
        capturedOwner: map[50][9]?.owner, // assuming target was (9,50)
        gameOver: window.gameOver,
        infoHTML: document.getElementById('info')?.innerHTML?.substring(0,200) || '',
      }));
      console.log('AFTER_BATTLE:', JSON.stringify(afterBattle));
      await snap('05-battle');

      // 推进一回合
      console.log('\n=== STEP 7: ADVANCE TURN ===');
      await page.evaluate(() => { document.getElementById('btnTime').click(); });
      await page.waitForTimeout(500);
      console.log(await state());
      await snap('06-nextturn');
    }
  }

  // 再尝试攻击另一个方向
  console.log('\n=== STEP 8: TRY ANOTHER ATTACK ===');
  const target2 = targets.filter(t => t.owner !== 'player')[1];
  if(target2){
    const t2Px = await page.evaluate((tx,ty) => {
      const cs=CS*zoom; return {px:Math.round(tx*cs-camX),py:Math.round(ty*cs-camY)};
    }, target2.x, target2.y);
    await page.mouse.click(cvRect.x+t2Px.px, cvRect.y+t2Px.py);
    await page.waitForTimeout(400);
    const p2 = await page.evaluate(() => ({btnGo:!!document.getElementById('btnGo'),info:document.getElementById('info')?.innerHTML?.substring(0,150)||''}));
    console.log('TARGET2_PREVIEW:', JSON.stringify(p2));
    if(p2.btnGo){
      await page.evaluate(()=>{document.getElementById('btnGo').click();});
      await page.waitForTimeout(500);
      await snap('07-battle2');
    }
  }

  console.log('\n===== ALL CONSOLE LOGS =====');
  logs.forEach(l => console.log(l));
  console.log('\n===== ALL PAGE ERRORS =====');
  errors.forEach(e => console.log('ERR:', e));

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
