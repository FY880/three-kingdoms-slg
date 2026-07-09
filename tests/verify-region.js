/* M2 州郡大地图验收（脚本化，对应设计文档 §8 验收项 1-10）：
 * 州界/十三州覆盖/州府/土地等级/州府胜利/整州胜利/土地加权产出/守军随级/玉产出/连地规则不变。
 * 读取 dist/index.standalone.html（已内联 regions.csv）。 */
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
  const check = (name, cond, extra='') => { results.push(!!cond); out.push((cond?'PASS':'FAIL')+' | '+name+(extra?'  ['+extra+']':'')); };
  try {
    // —— 验收 0：默认开局剧本 = 十三州割据（M2 州府胜利可体验）——
    const defScn = win.eval('SCN && SCN.id');
    check('默认开局剧本=十三州割据', defScn==='thirteen', 'SCN='+defScn);

    // —— 验收 1：十三州全覆盖 + 无未定义 region ——
    const cov = win.eval(`(()=>{ const ids=new Set(); let undef=0; for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const r=map[y][x].region; if(!r||r==='') undef++; else ids.add(r); } return {size:ids.size, undef, ok:(ids.size===13&&undef===0)}; })()`);
    check('十三州全覆盖(13 且无空 region)', cov.ok, `size=${cov.size} undef=${cov.undef}`);

    // —— 验收 5：土地等级 1~8，州府 land===8 ——
    const lr = win.eval(`(()=>{ let bad=0, caps=0, capBad=0; for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const c=map[y][x]; if(c.land<1||c.land>8) bad++; if(c.capital){ caps++; if(c.land!==8) capBad++; } } return {bad, caps, capBad}; })()`);
    check('土地等级∈[1,8] 且州府=8级', lr.bad===0 && lr.caps===13 && lr.capBad===0, `bad=${lr.bad} caps=${lr.caps} capBad=${lr.capBad}`);

    // —— 资源州：yang/yi 标记 + 存在 resource 格 ——
    const resOk = win.eval(`R.REGIONS.yang.resource===true && R.REGIONS.yi.resource===true`);
    const resCount = win.eval(`(()=>{ let n=0; for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(map[y][x].resource) n++; return n; })()`);
    check('资源州标记(yang/yi) 且存在资源格', resOk && resCount>0, `resource格=${resCount}`);

    // —— 验收 6：土地等级影响产出（eff=landLevelSum/4，平均 4 级≈旧 1 格）——
    const hiG = win.eval('R.ECON.perTurn(1,0,1,8,0)');   // 1 个 8 级地
    const loG = win.eval('R.ECON.perTurn(1,0,1,1,0)');   // 1 个 1 级地
    check('高等级地产出>低等级地(粮/币)', hiG['粮']>loG['粮'] && hiG['币']>loG['币'], `8级粮${hiG['粮']}/币${hiG['币']} vs 1级粮${loG['粮']}/币${loG['币']}`);
    // 平衡锚点：平均 4 级地应≈旧 1 格权重
    const avg = win.eval('R.ECON.perTurn(1,0,1,4,0)'); const old = win.eval('R.ECON.perTurn(1,0,1)');
    check('平衡锚点：4 级地≈旧 1 格权重', avg['粮']===old['粮'] && avg['币']===old['币'], `4级粮${avg['粮']} 旧粮${old['粮']}`);

    // —— 验收 8（玉产出）：perTurn 玉 = resourceLand ——
    const jade = win.eval('R.ECON.perTurn(1,0,1,4,3)');
    check('资源州产出玉(玉=resourceLand)', jade['玉']===3, `玉=${jade['玉']}`);

    // —— 验收 7：土地等级影响守军（中立队数随 land）——
    const cmp = win.eval(`(()=>{ let hi=null,lo=null; for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const c=map[y][x]; if(c.owner==='none'){ if(!hi||c.land>hi.land) hi=c; if(!lo||c.land<lo.land) lo=c; } } if(!hi||!lo) return null; return {hiN:defenderArmy(hi).units.length, loN:defenderArmy(lo).units.length, hiLand:hi.land, loLand:lo.land}; })()`);
    check('高 land 中立守军>低 land', cmp && cmp.hiLand>cmp.loLand && cmp.hiN>cmp.loN, cmp?`${cmp.loLand}级${cmp.loN}队 → ${cmp.hiLand}级${cmp.hiN}队`:'无中立格');

    // —— 验收 10：连地规则不变（validTarget 仍可判定相邻可攻）——
    const vt = win.eval(`(()=>{ for(let y=0;y<H;y++)for(let x=0;x<W;x++){ if(map[y][x].owner==='player'){ for(const d of[[1,0],[-1,0],[0,1],[0,-1]]){ const ny=y+d[1],nx=x+d[0]; const n=map[ny]&&map[ny][nx]; if(n&&n.owner!=='player') return validTarget(nx,ny); } } } return null; })()`);
    check('连地规则可用(相邻敌/中立可攻)', vt===true, 'validTarget='+vt);

    // —— 验收 3：州府占领触发胜利（holdCapital）——
    win.eval(`startScenario('thirteen'); window.__end=null; const _oe=endGame; endGame=function(r,m){ window.__end=r; _oe(r,m); };`);
    win.eval(`(()=>{ let n=0; for(let y=0;y<H;y++)for(let x=0;x<W;x++){ if(map[y][x].capital && n<3){ map[y][x].owner='player'; n++; } } return n; })()`);
    win.eval('checkEnd();');
    const endCap = win.eval('window.__end'); const overCap = win.eval('gameOver');
    check('占据3州府→胜利(holdCapital)', endCap==='win' && overCap===true, `end=${endCap} over=${overCap}`);

    // —— 验收 4：整州实控触发胜利（regionLand）——
    win.eval(`startScenario('thirteen'); endGame=function(r,m){ window.__end=r; }; SCN.victory={type:'regionLand',regions:1,pct:0.7};`);
    const sm = win.eval(`(()=>{ const tot={}; for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const r=map[y][x].region; if(r) tot[r]=(tot[r]||0)+1; } let best=null,bn=1e9; for(const k in tot){ if(tot[k]<bn){bn=tot[k];best=k;} } return best; })()`);
    win.eval(`(()=>{ const id="${sm}"; const cells=[]; for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(map[y][x].region===id) cells.push(map[y][x]); const need=Math.ceil(cells.length*0.7); for(let i=0;i<need;i++) cells[i].owner='player'; return need; })()`);
    win.eval('checkEnd();');
    const endReg = win.eval('window.__end');
    check('实控≥70%整州→胜利(regionLand)', endReg==='win', `end=${endReg} region=${sm}`);

    // —— 验收 8（集成）：推进时辰，占有资源州→RES['玉'] 增长 ——
    win.eval(`startScenario('thirteen'); for(let y=0;y<H;y++)for(let x=0;x<W;x++){ if(map[y][x].region==='yang'||map[y][x].region==='yi') map[y][x].owner='player'; }`);
    const beforeJade = win.eval('RES["玉"]');
    win.eval('document.getElementById("btnTime").click();');
    const afterJade = win.eval('RES["玉"]');
    check('推进时辰·资源州使玉增长', afterJade>beforeJade, `玉 ${beforeJade}→${afterJade}`);

  } catch (e) {
    errors.push('THROWN: ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n'));
  }
  console.log(out.join('\n'));
  const passed = results.filter(Boolean).length, total = results.length;
  console.log(`\n=== M2 州郡大地图验收: ${passed}/${total} PASS, script errors=${errors.length}`);
  errors.forEach(e => console.log('  ! ', e));
  process.exit((passed === total && errors.length === 0) ? 0 : 1);
}, 900);
