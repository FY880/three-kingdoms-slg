// 验证修复：去迷雾 + 自动居中缩放
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 820 } });
  page.on('pageerror', e => console.log('ERR:', e.message));
  await page.goto('file:///workspace/dist/index.standalone.html', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.evaluate(() => { if(window.closeIntro) window.closeIntro(); });
  await page.waitForTimeout(400);

  const d = await page.evaluate(() => {
    let t=0,v=0,p=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){t++;if(scouted(x,y))v++;if(map[y][x].owner==='player')p++;}
    const cs=CS*zoom;
    return {total:t,visCount:v,visPct:(v/t*100).toFixed(0)+'%',player:p,zoom,CS,camX:Math.round(camX),camY:Math.round(camY),vpW:VW(),vpH:VH()};
  });
  console.log('MAP_STATE:', JSON.stringify(d,null,2));

  // 可视窗口内可见率
  const vp = await page.evaluate(() => {
    const cs=CS*zoom;
    const x0=Math.max(0,Math.floor(camX/cs)),x1=Math.min(W-1,Math.ceil((camX+VW())/cs));
    const y0=Math.max(0,Math.floor(camY/cs)),y1=Math.min(H-1,Math.ceil((camY+VH())/cs));
    let vt=0,vv=0; for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){vt++;if(scouted(x,y))vv++;}
    return {viewportTotal:vt,viewportVisible:vv,visPct:(vv/vt*100).toFixed(0)+'%'};
  });
  console.log('VIEWPORT:', JSON.stringify(vp,null,2));

  // 玩家边界格（可攻击目标）
  const borders = await page.evaluate(() => {
    const b=[];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      if(map[y][x].owner==='player')
        for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
          const nx=x+dx,ny=y+dy;
          if(nx>=0&&nx<W&&ny>=0&&ny<H&&map[ny][nx].owner!=='player')
            b.push({from:[x,y],to:[nx,ny],owner:map[ny][nx].owner});
        }
    }
    return b;
  });
  console.log('ATTACKABLE_BORDERS:', borders.length, 'targets (first 6):', JSON.stringify(borders.slice(0,6)));

  // 截图
  await page.screenshot({ path: '/workspace/tests/pt-fix-afterintro.png' });

  // 尝试完整流程：点边界玩家格→点相邻中立格→出征
  if(borders.length>0){
    const b0=borders[0];
    const cs=d.CS*d.zoom;
    // 点玩家边界格（选它）
    const pPx=Math.round(b0.from[0]*cs-d.camX)+0; // canvas相对坐标，需要加canvas位置
    const fromScreen = await page.evaluate(([fx,fy])=>{
      const cs=CS*zoom; return {px:Math.round(fx*cs-camX),py:Math.round(fy*cs-camY)};
    }, b0.from);
    const toScreen = await page.evaluate(([tx,ty])=>{
      const cs=CS*zoom; return {px:Math.round(tx*cs-camX),py:Math.round(ty*cs-camY)};
    }, b0.to);
    const cr = await page.evaluate(()=>document.getElementById('cv').getBoundingClientRect());

    console.log('\n--- FLOW TEST ---');
    console.log('TAP PLAYER BORDER CELL', b0.from, 'at screen', cr.x+fromScreen.px, cr.y+fromScreen.py);
    await page.mouse.click(cr.x+fromScreen.px, cr.y+fromScreen.py);
    await page.waitForTimeout(400);

    // 关面板
    await page.evaluate(() => { try{closeSheet();}catch(e){} });
    await page.waitForTimeout(200);

    console.log('TAP TARGET', b0.to, '('+b0.owner+') at screen', cr.x+toScreen.px, cr.y+toScreen.py);
    await page.mouse.click(cr.x+toScreen.px, cr.y+toScreen.py);
    await page.waitForTimeout(500);

    const previewState = await page.evaluate(() => ({
      btnGo: !!document.getElementById('btnGo'),
      info: document.getElementById('info')?.innerHTML?.substring(0,200)||'',
      sheetTrans: document.getElementById('sheet')?.style.transform||'none'
    }));
    console.log('PREVIEW:', JSON.stringify(previewState));

    if(previewState.btnGo){
      console.log('CLICK 出征...');
      await page.evaluate(()=>{document.getElementById('btnGo').click();});
      await page.waitForTimeout(800);
      const postBattle = await page.evaluate(()=>{
        const c = map[b0.to[1]][b0.to[0]];
        return { owner: c.owner, soldiers: c.soldiers };
      });
      console.log('POST_BATTLE:', JSON.stringify(postBattle));
      await page.screenshot({ path: '/workspace/tests/pt-fix-battle.png' });
    }
    await page.screenshot({ path: '/workspace/tests/pt-fix-preview.png' });
  }

  await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
