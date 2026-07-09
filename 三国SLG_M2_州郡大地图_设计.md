# 三国 SLG · M2 州郡大地图 · 设计文档（契约级）

> **定位**：增量叠加大版本。在现有 80×56 格子地图（`W=80, H=56, CS=16`，见 `index.html:177`）之上叠加「**州聚合层** + **土地等级 1~8** + **州府** + **资源州**」，**复用** `validTarget`（连地规则）、`defenderArmy`、`SCN.victory`/`checkEnd`（胜利条件）、`render()` 可视裁剪与 `CS*zoom` 体系。**绝不重写战斗核心**（`src/combat.js` / `simulateCombat` 零改动）。
> **作者**：文策渊（design-strategist）
> **数据来源**：全部字段/函数名锚定真实代码（`src/*.js`、`data/*.csv`、`index.html`、`三国SLG_深度设计_GDD.md`）。本文档仅产出设计契约，**不修改任何 `src/*.js` / `index.html`**。
> **对应路线图**：GDD §6.2 M2「州郡大地图 + 土地等级/争夺」，GDD §7 下一步 #8「启动 M2：叠加州聚合层与土地等级，复用 validTarget，不重写战斗逻辑」。

---

## 0. 范围声明（一句话红线）

M2 = **在格子之上加一层「州/土地/州府」元数据 + 对应渲染 + 州府胜利条件 + 土地等级产出**。所有战斗结算、连地规则、外交、经济框架保持不变；城建/科技树/练兵/州内光环为 M2 **后续子项或 P3**，本文给出接缝但不实现。

---

## 1. 州数据模型

### 1.1 单元格新增字段（`map[y][x]`）

现有 `map[y][x] = {t, owner, lvl, soldiers, ambush, upstream, floodTurns}`（`index.html:343`）。M2 在每格**增量**新增 4 个字段：

| 字段 | 类型 | 含义 | 写入位置 | 与现有 `c.lvl` 关系 |
|---|---|---|---|---|
| `region` | `string` | 该格所属**州 id**（如 `'ji'`、`'jing'`），由 `data/regions.csv` 的 `id` 决定 | `genMap()` | 新增，独立于 `lvl` |
| `land` | `int 1~8` | **土地等级**（M2 的核心数值，替代旧的 `c.lvl` 概念） | `genMap()` | **即原 `c.lvl` 的全量迁移与扩程**（1~5 → 1~8），见 §1.4 |
| `capital` | `bool` | 是否为**州府**（每州 1 个固定格） | `genMap()`（取 `regions.csv` 的 `cx,cy`） | 新增 |
| `resource` | `bool` | 是否处于**资源州**（产出特殊资源「玉」） | `genMap()`（随 `region` 继承州标记） | 新增 |

> `map[y][x].floodTurns` 等既有字段**全部保留不动**。

### 1.2 州元表 `DATA.state.REGIONS`（`data/regions.csv` 热加载）

新增一张**极小元表**（13 行 + 表头），承载「州定义」；单元格→州的**空间分配**由 `genMap()` 程序化完成（见 §2，理由见 §2.1）。

`data/regions.csv` schema（列名与既有配表一致的小写下划线风格）：

```csv
id,name,color,cx,cy,resource
ji,冀州,#c0504d,60,8,false
you,幽州,#6a5acd,64,2,false
bing,并州,#4a8f8f,52,4,false
qing,青州,#3cb371,66,16,false
yan,兖州,#d98841,54,18,false
xu,徐州,#c0508d,64,26,false
sili,司隶,#b0b0b0,46,20,false
yu,豫州,#8fbc4a,54,30,false
jing,荆州,#4f9bd6,48,38,false
yang,扬州,#e0b050,62,42,true
yi,益州,#5fae6a,34,40,true
liang,凉州,#a0522d,20,20,false
jiao,交州,#9b6db0,56,52,false
```

| 列 | 含义 | 说明 |
|---|---|---|
| `id` | 州 id（英文/拼音） | 唯一键，写入 `map[y][x].region` |
| `name` | 中文州名 | 图例/目标栏显示 |
| `color` | 州标识色（hex） | 州界/图例/资源州底色用 |
| `cx,cy` | **州府坐标**（种子锚点） | `genMap()` 据此定位 `capital` 并做最近种子分配 |
| `resource` | 是否资源州 | `true` 的州内所有格 `resource=true`，基础产「玉」 |

> 坐标 `(cx,cy)` 已按 80×56 画布大致均匀铺开（示例值，可经配表调）。**玩家出生 `playerHome=[8,50]` 与 AI 出生点不强行绑定州**——出生点落入哪个 `region`，哪个州就是该势力起点（世界绝对布局，符合「十三州」地缘感）。

`DATA.state.REGIONS` 在 `src/data.js` 中以「可变 state + getter」接入（与 `TERRAIN`/`SKILLS` 同构）：
- `state.REGIONS = DEFAULTS.REGIONS`（内置 13 行兜底）
- `reload(cfg)` 增加 `if(cfg.regions) state.REGIONS = toRegions(cfg.regions)`
- `RULES` 增加 getter `REGIONS`
- `loadConfigFromServer` / `loadCSVFromDir` 的文件表增加 `regions:'regions.csv'`
- `toRegions(rows)`：`{id:{id,name,color,cx,cy,resource}}` 字典结构（与 `TERRAIN` 一致）

### 1.3 州府（capital）语义

- 每州 **1 个** `capital` 格，固定为 `regions.csv` 的 `(cx,cy)`。
- `capital` 格 `land=8`、`soldiers` 取该州最高（见 §2.3），是州内最强据点。
- 州府被占 = 该州「失守」；全部/指定州府被玩家占据 = 胜利条件之一（§5.1）。

### 1.4 `c.lvl` → `c.land` 的迁移关系（关键澄清）

现状（`index.html` 中 9 处引用，**均不在战斗纯逻辑内**）：
- `c.lvl` 仅用于：中立地守军数量/兵力（`defenderArmy`、`genMap`），AI 评分（`scoreTarget`），占领后归零（`commitBattle`/`aiAttack`/`paint`/`flood flip`），出征预览显示（`previewBattle`）。
- `grep "\.lvl"` 结果：仅 `index.html`（L263/283/304/334/353/356/540/585），**tests/ 未引用**，战斗核心 `combat.js` 完全不读 `c.lvl`。

**M2 决策**：将「土地等级」统一为新字段 **`c.land`（int 1~8）**，`c.lvl` **退役**（不再写入）。`genMap()` 及上述 8 处全部改为读/写 `c.land`。为兼容任何外部 harness，可在 `genMap()` 末尾**可选地**保留 `c.lvl = c.land` 一行影子赋值（非必须，仅安全网）。

> ⚠️ 与 GDD §2.5 一致：`c.land` 与 `makeUnit` 的 `g.level`（武将等级成长 `grow=1+(lv-1)*0.06`）**完全独立**——土地等级是地块属性，武将等级是养成属性，二者不互乘。

---

## 2. 生成 / 初始化（`genMap()` 契约）

### 2.1 程序化 vs CSV —— 推荐方案

| 方案 | 做法 | 评价 |
|---|---|---|
| A. 全量 `data/regions.csv`（4480 行逐格） | 每格一行标 region/land/capital | ❌ 脆弱、不可调、与现有「小元数据表」架构相悖 |
| **B.（推荐）元表 `regions.csv`（13 行）+ `genMap()` 程序化分配** | csv 只给 13 州定义+州府坐标；`genMap()` 用**确定性的最近种子 + 噪声**把每格归入一州，并按「距州府远近+地形+噪声」生成 1~8 级土地 | ✅ 数据驱动（定义可配）、布局可复现（种子 `12345` 固定）、零手工 4480 行 |

**结论**：采用方案 B。`genMap()` 必须**保持 `seed=12345` 复位**（现有 L338 已如此），保证每次「重置」地图布局一致。

### 2.2 `genMap()` 改造步骤（插入点：`index.html:337` 函数体内，地形/河流/城池生成之后、`paint` 玩家/AI 出生之前或之后均可）

```js
// —— M2 叠加：在既有地形生成后执行 ——
function genMap(){
  seed=12345; time=0; seasonKey='spring'; weatherKey='sun'; appliedEvents={}; gameOver=false; map=[];
  // ...既有地形/河流/城池循环保持不变（L339-349）...

  // 【M2-新增】1) 州分配（最近种子 + 确定性噪声）
  const REG = R.REGIONS || {};           // DATA.state.REGIONS
  const seeds = Object.values(REG);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const c=map[y][x];
    // 河流/低洼不参与州府争夺，但仍归属最近州（用于渲染底色）
    let best=null, bd=1e9;
    for(const s of seeds){
      const d=Math.hypot(x-s.cx, y-s.cy) + rnd()*2.5;   // 噪声使边界有机
      if(d<bd){ bd=d; best=s; }
    }
    c.region = best ? best.id : 'ji';
    c.capital = false; c.resource = !!(best && best.resource);
  }

  // 【M2-新增】2) 土地等级 1~8（距州府远近 + 地形 + 噪声）
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const c=map[y][x]; const s=seeds.find(z=>z.id===c.region);
    const dist = s ? Math.hypot(x-s.cx, y-s.cy) : 20;
    const terrBonus = ({mountain:1,hill:1,city:2,forest:0,plain:0,desert:-1,swamp:0,tundra:0,river:-1,lowland:0,defile:1,bridge:0})[c.t]||0;
    let L = Math.round(8 - dist/3 + terrBonus + (rnd()*2-1));
    if(c.resource) L += 1;                       // 资源州地块等级偏高
    c.land = Math.max(1, Math.min(8, L));
  }

  // 【M2-新增】3) 州府落位（每州 1 个固定 capital 格）
  for(const s of seeds){
    const cx=Math.max(0,Math.min(W-1,s.cx)), cy=Math.max(0,Math.min(H-1,s.cy));
    const cc=map[cy] && map[cy][cx]; if(!cc) continue;
    cc.capital=true; cc.region=s.id; cc.land=8; cc.resource=!!s.resource;
  }

  // 既有：出生点涂色（paint）——将 c.lvl=0 改为保留 c.land（见下）
  paint(playerHome[0],playerHome[1],3,'player'); AI_LORDS.forEach(L=> paint(L.home[0],L.home[1],3,L.id));

  // 既有：中立地守军（c.lvl → c.land）
  const nmul = SCN.neutralMul||1;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const c=map[y][x];
    if(c.owner==='none'&&c.t!=='river'){ c.land=Math.max(1,Math.min(8,c.land)); c.soldiers=Math.round(c.land*ri(200,360)*nmul); }
  }
  updateUpstream(); centerCam(playerHome[0],playerHome[1]); refreshTop();
}
```

> 其中 `paint()`（`index.html:356`）改造：把 `c.lvl=0` 改为 `c.land=Math.max(c.land||1,5)`（出生核心区保底 5 级，避免自家地全 1 级），其余不变。

### 2.3 关键常量（全部可调，建议随 `economy.js` 常量或配表收敛）

| 常量 | 值 | 含义 |
|---|---|---|
| `LAND_DIST_SCALE` | `3` | 距州府每 3 格，土地等级 −1 |
| `LAND_CAP` | `8` | 土地等级上限（州府固定 8） |
| `LAND_FLOOR` | `1` | 土地等级下限 |
| `SOLDIER_PER_LAND` | `ri(200,360)` | 中立守军 = `land × 此值 × neutralMul` |
| `REGION_NOISE` | `2.5` | 州界噪声幅度（越大边界越有机） |
| `RESOURCE_LAND_BONUS` | `+1` | 资源州地块等级加成 |

---

## 3. 渲染（render 增量）

在现有 `render()`（`index.html:381`，含可视裁剪 `x0..x1/y0..y1` 与 `cs=CS*zoom`）之上**增量绘制**，不改动既有地形/归属/边界逻辑。

### 3.1 绘制项与插入点

| 绘制项 | 插入位置（相对 `render()` 内 per-cell 循环） | 说明 |
|---|---|---|
| **资源州底色** | 在 `ctx.fillStyle=R.TERRAIN[c.t].color; fillRect`（L392）**之后、owner 填充之前** | 资源州格先叠一层半透明金（`rgba(224,176,80,0.16)`），让「资源州」可一眼辨 |
| **州界描边** | 复用 owner 边界写法（L398-406），改为比较 `region` | 相邻格 `region` 不同处描边，颜色取 `R.REGIONS[c.region].color` |
| **土地等级角标** | owner 边界之后、守军数字之前 | 在格左上角以小号数字写 `c.land`（仅 `cs>=10`） |
| **州府图标** | 角标之后 | `c.capital` 为真时绘「府」字或 ★（`cs>=12`），颜色取州色 |

### 3.2 伪代码片段（直接并入 `render()` 循环体内 `if(!vis){...}` 之后）

```js
// —— M2 渲染增量（插入 render() per-cell 循环，地形底色之后）——
const cs=CS*zoom;
// (a) 资源州底色
if(c.resource){ ctx.fillStyle='rgba(224,176,80,0.16)'; ctx.fillRect(px,py,cs+1,cs+1); }
// ...既有 owner 填充（L395-396）保持...

// (b) 州界（相邻 region 不同处描边）
if(cs>=9){
  const rcol = (R.REGIONS && R.REGIONS[c.region]) ? R.REGIONS[c.region].color : '#fff';
  ctx.strokeStyle=rcol; ctx.globalAlpha=0.55; ctx.lineWidth=1;
  if(!(map[y-1]&&map[y-1][x]&&map[y-1][x].region===c.region)){ ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+cs+1,py); ctx.stroke(); }
  if(!(map[y+1]&&map[y+1][x]&&map[y+1][x].region===c.region)){ ctx.beginPath(); ctx.moveTo(px,py+cs+1); ctx.lineTo(px+cs+1,py+cs+1); ctx.stroke(); }
  if(!(map[y][x-1]&&map[y][x-1].region===c.region)){ ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px,py+cs+1); ctx.stroke(); }
  if(!(map[y][x+1]&&map[y][x+1].region===c.region)){ ctx.beginPath(); ctx.moveTo(px+cs+1,py); ctx.lineTo(px+cs+1,py+cs+1); ctx.stroke(); }
  ctx.globalAlpha=1;
}
// ...既有 owner 边界（L398-406）保持...

// (c) 土地等级角标
if(cs>=10){ ctx.fillStyle='rgba(255,255,255,.85)'; ctx.font='bold '+Math.floor(cs*0.34)+'px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillText(c.land, px+1, py+1); ctx.textAlign='left'; ctx.textBaseline='alphabetic'; }
// (d) 州府图标
if(c.capital && cs>=12){ ctx.fillStyle='#ffd479'; ctx.font='bold '+Math.floor(cs*0.6)+'px "Microsoft YaHei",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('府', px+cs/2, py+cs/2); ctx.textAlign='left'; ctx.textBaseline='alphabetic'; }
```

> 全部复用 `CS*zoom`、`camX/camY`、`px/py/cs` 既有变量与可视裁剪，缩放/平移/双指逻辑**零改动**。州界 alpha 单独可调（默认 0.55），避免与 owner 边界（0.9）混淆。

### 3.3 `buildLegend()` 增量（`index.html:792`）

在地形图例后追加一行「十三州」（取 `R.REGIONS` 的 `color`+`name`+`resource` 标记「玉」）：

```js
h += `<div style="grid-column:1/-1;margin-top:4px">州郡：`+
  Object.values(R.REGIONS||{}).map(r=>`<span><i style="background:${r.color}"></i>${r.name}${r.resource?'·玉':''}</span>`).join('')+`</div>`;
```

---

## 4. 机制

### 4.1 州府占领作为胜利条件（`SCN.victory` + `checkEnd`）

现状：`SCN.victory` 支持 `{type:'land', n}` 与 `{type:'defeatLord', lordId, land}`（`index.html:646` `checkEnd`）；`R.SCENARIOS` 定义在 `src/scenario.js`。

**新增两类 victory 类型**（纯数据扩展，`checkEnd` 加分支即可）：

| 类型 | `victory` 形状 | 胜利判定 |
|---|---|---|
| `holdCapital` | `{type:'holdCapital', target:'all'|regionId, count?:n}` | 玩家占据 `target` 指定的州府数 ≥ `count`（默认 1）。`target:'all'` = 占据全部 13 州府 |
| `regionLand` | `{type:'regionLand', regions:n, pct?:0.7}` | 玩家「实控」≥ `n` 个整州；实控 = 该州 ≥ `pct` 格归属玩家（默认 70%） |

`checkEnd()` 增量（`index.html:646` 之后追加，不删旧分支）：

```js
function checkEnd(){
  if(!SCN||gameOver) return;
  const land=landCount('player');
  if(land<=0){ endGame('lose','你的势力已被全灭'); return; }
  if(SCN.victory.type==='defeatLord' && landCount(SCN.victory.lordId)===0){ endGame('win','已讨灭 '+lordById(SCN.victory.lordId).name+'！'); return; }
  const landGoal = SCN.victory.n || SCN.victory.land;
  if(landGoal && land>=landGoal){ endGame('win','占领 '+land+' 州郡，霸业有成！'); return; }
  // —— M2 新增 ——
  const v=SCN.victory;
  if(v.type==='holdCapital'){
    const held = countCapitals('player', v.target);
    if(held >= (v.count||1)) endGame('win','已占据 '+held+' 处州府，号令天下！');
    return;
  }
  if(v.type==='regionLand'){
    const pct=v.pct||0.7;
    if(regionOwnedCount('player', pct) >= (v.regions||1)) endGame('win','已据 '+(v.regions||1)+' 州之地，雄霸一方！');
    return;
  }
}
// 辅助：统计 owner 占据的州府数（target 可选单州 id 或 'all'）
function countCapitals(owner, target){
  let n=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const c=map[y][x];
    if(c.capital && c.owner===owner && (target==='all'||target===c.region)) n++; }
  return n;
}
// 辅助：统计 owner 实控（≥pct 格）的州数量
function regionOwnedCount(owner, pct){
  const tot={}, own={};
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const c=map[y][x]; if(c.region){ tot[c.region]=(tot[c.region]||0)+1; if(c.owner===owner) own[c.region]=(own[c.region]||0)+1; } }
  let n=0; for(const id in tot){ if((own[id]||0)/tot[id] >= pct) n++; } return n;
}
```

**`R.SCENARIOS` 示例**（仅新增/修改数据与 victory 形状，剧本函数无需动）：

```js
// 例：新增「十三州」剧本，以「占据 3 州府」为胜利
{ id:'thirteen', name:'十三州割据', desc:'群雄划州而治，先据三州府者号令天下。',
  playerHome:[8,50], neutralMul:1.1,
  victory:{ type:'holdCapital', target:'all', count:3 },
  lords:[ /* 既有四诸侯坐标可平移入不同州 */ ] },
// 例：既有 melee 也可平滑改为 regionLand
{ id:'melee', ..., victory:{ type:'regionLand', regions:3, pct:0.7 } }
```

> `updateObjective()`（`index.html:779`）需同步识别新类型显示进度（复用 `countCapitals`/`regionOwnedCount`）。`getScenario`/`eventsDueAt` 不用改。

### 4.2 土地等级争夺（产出 & 守军 & 与 `c.lvl` 的关系）

**（a）占领高等级土地的产出收益** —— 扩展 `R.ECON.perTurn`（`src/economy.js:23`）：

```js
// 现状：perTurn(ownedLand, cities, seasonGrainMul)
// M2：第 4 参数 landLevelSum（已占土地等级加权之和，缺省回退旧行为）
function landMul(L){ return L/4; }            // Lv1→0.25, Lv4→1.0, Lv8→2.0（平衡锚点见下）
function perTurn(ownedLand, cities, seasonGrainMul, landLevelSum, resourceLand){
  seasonGrainMul = seasonGrainMul||1;
  const eff = (landLevelSum!=null) ? landLevelSum : ownedLand;   // 缺省=旧按格计数
  return {
    粮: Math.round(eff*8*seasonGrainMul),
    木: Math.round(cities*20),
    铁: Math.round(cities*14),
    石: Math.round(cities*14),
    币: Math.round(eff*1),
    玉: (resourceLand>0) ? Math.round(resourceLand*1) : 0      // 资源州基础产出（M2 仅显示/基础产出）
  };
}
```

> **平衡锚点**：`landMul(L)=L/4` 使**平均 4 级地 ≈ 旧 1 格权重**，故整体产出量级与 GDD §2.5 旧值持平；但 8 级地约为 1 级地的 **8 倍**收益 → 驱动「抢高产地」策略，且不破坏既有平衡曲线。Demo 调用点（`index.html:821`）改为先累加 `landLevelSum` 与 `resourceLand` 再传入（见 §6 接入表）。

**（b）敌方/中立守军强度随 `land`** —— `defenderArmy()`（`index.html:256`）对中立地：

```js
// 现状：const n=Math.min(3,1+Math.floor(tile.lvl/2));
// M2：用 tile.land 且放开上限到 5
const n = Math.max(1, Math.min(5, 1+Math.floor(tile.land/2)));   // Lv1→1队, Lv8→5队
```

> `tile.soldiers` 在 `genMap()` 已按 `land × ri(200,360) × neutralMul` 生成，故高等级地**兵力更厚 + 队伍更多** → 攻高产地需更强兵力/更好克制。与 `c.lvl` 关系：此处即 `c.lvl` 的语义迁移点，`tile.lvl` 全改为 `tile.land`。

**（c）占领后 `c.land` 保留**（不归零）：`commitBattle`（`index.html:585`）与 `aiAttack`（`index.html:304`）与洪水翻转（`index.html:334`）的 `c.lvl=0` 一律改为**只清 `c.soldiers=0`，保留 `c.land`**，使已占土地持续产出（这才是「土地等级影响产出」的落点）。

### 4.3 资源州（特殊资源「玉」）

- **产出**：M2 仅做**基础产出**（§4.2(a) 的 `玉` 字段），由 `resource=true` 格计数 × `JADE_K(=1)` 进入 `RES`。`RES` 初始化（`index.html:175`）与 `ECON.starting()`（`economy.js:21`）需把 `玉` 加入 `TYPES`/`RES_META`（加键即可，`resBar` 已动态遍历 `ECON.TYPES`）。
- **用途（M2 先行标注，不实现）**：「玉」作为珍稀资源，规划用于 **M2-later 宝物兑换 / 科技树解锁 / 高级练兵**——这些属 M2 后续子项与 P3，本文仅预留字段与产出链路，消费侧接缝见 §7。

### 4.4 州内加成（**P3 / M2 排除项**，仅留接缝）

标注为可选、不在 M2 最小集。若未来启用，公式与接入点如下（**不实现**）：

```
atkMul *= (1 + IN_REGION_BONUS)   // 我军单位处于本州（region == 出生州）内
defMul *= (1 + IN_REGION_BONUS)
IN_REGION_BONUS 建议 0.03~0.05（同州友军微光环，避免主导策略）
```

- **接入点**：`makeUnit(generalId, soldiers, formationKey, opts)`（`src/combat.js:88`）—— `opts.regionBonus` 为真时 `u.atkMul*=…; u.defMul*=…`（与现有 `opts.cityBonus` 同构）；`simulateCombat` 无需改（已读 `u.atkMul/u.defMul`）。
- **判定来源**：在 `defenderArmy` / `previewBattle` / `aiAttack` 中，按「该格 `region` 是否等于防守/进攻方出生州」决定 `opts.regionBonus`。
- **风险红线**：加成必须微（≤5%），否则形成「主场碾压」主导策略（见 §8）。

---

## 5. 接入点清单（逐条，含破坏面评估）

| # | 文件 / 函数 | 改什么 | 是否破坏战斗核心 | 风险 |
|---|---|---|---|---|
| 1 | `src/data.js` `state`/`reload`/`loadConfigFromServer`/`loadCSVFromDir` + 新增 `toRegions` + `RULES` getter `REGIONS` | 接入 `REGIONS` 元表（纯数据层，零 DOM） | ❌ 不碰战斗 | 低（同构于既有表） |
| 2 | `data/regions.csv`（新增，13 行） | 13 州定义 + 州府坐标 + 资源旗 | — | 低 |
| 3 | `index.html` `genMap()` | 州分配 + 土地等级 1~8 + 州府落位；`c.lvl`→`c.land` | ❌ 仅地图生成 | 中（布局需调参，见 §8） |
| 4 | `index.html` `paint()` | `c.lvl=0`→保留 `c.land`（保底 5 级） | ❌ | 低 |
| 5 | `index.html` `render()` | 资源州底色 / 州界 / 土地角标 / 州府图标（§3） | ❌ 仅表现 | 低 |
| 6 | `index.html` `buildLegend()` | 追加十三州图例 | ❌ | 低 |
| 7 | `index.html` `defenderArmy()` | 中立守军队数 `tile.lvl`→`tile.land`，上限 5 | ❌ 仅影响中立守军生成 | 低（与 `c.lvl` 同义迁移） |
| 8 | `index.html` `scoreTarget()` | `t.lvl`→`t.land`（评分权重同步） | ❌ | 低 |
| 9 | `src/economy.js` `perTurn()` + `starting()` + `TYPES`/`RES_META` | 新增 `landLevelSum`/`resourceLand` 参数与 `玉` 产出 | ❌ 纯函数，旧调用 3 参回退 | 低（参数可选） |
| 10 | `index.html` `btnTime` 产出段（L820） | 累加 `landLevelSum`/`resourceLand` 后传 `perTurn` | ❌ | 低 |
| 11 | `index.html` `checkEnd()` + `updateObjective()` | 新增 `holdCapital`/`regionLand` 分支 + 进度显示 | ❌ 仅胜负判定 | 低 |
| 12 | `src/scenario.js` `SCENARIOS` | 新增/修改剧本的 `victory` 形状（数据） | ❌ | 低 |
| 13 | `index.html` `commitBattle`/`aiAttack`/洪水翻转 | `c.lvl=0`→保留 `c.land`（只清 `soldiers`） | ❌ | 低 |
| 14 | `index.html` `previewBattle()` | `c.lvl`→`c.land`（显示「守军 Lv」） | ❌ | 低 |
| 15 | `index.html` `validTarget()` | **不动** | ❌（保持） | **零**（连地规则原样复用） |
| 16 | `src/combat.js` `simulateCombat`/`makeUnit` | **M2 不动**；`regionBonus` 接缝留待 P3 | ❌（保持） | 零 |

> **结论**：M2 全部改动落在 `index.html`（生成/渲染/UI/胜负判定）、`src/data.js`（数据层接入）、`src/economy.js`（产出函数）、`src/scenario.js`（数据）、新增 `data/regions.csv`。**战斗核心 `combat.js` 与 `validTarget` 零改动**——符合 GDD §8「增量叠加」原则。

---

## 6. M2 范围裁剪建议

### 6.1 最小可用集（**Must，本次交付**）
1. **州聚合层**：`data/regions.csv`（13 州元表）+ `map[y][x].region/capital` + `genMap()` 程序化分配。
2. **渲染增量**：州界描边、州府「府」图标、土地等级角标、资源州底色 + 图例。
3. **州府胜利条件**：`holdCapital` / `regionLand` 两类 `victory` + `checkEnd`/`updateObjective` 分支 + 至少 1 个示范剧本。
4. **土地等级 1~8**：`genMap()` 生成、`c.lvl`→`c.land` 迁移、守军随 `land` 增强、产出随 `land` 加权（`perTurn` 扩参）。

### 6.2 M2 范围内可选（**Recommended，成本低可一并做**）
- **资源州「玉」基础产出**：`ECON` 扩 `TYPES`/`perTurn`/`starting` + `RES` 显示（消费侧留待后续）。

### 6.3 明确排除（**不在本次，给接缝**）
| 排除项 | 所属里程碑 | 留出的接缝 |
|---|---|---|
| 城建 / 科技树 / 科技 UI | M2-later（GDD P2） | 已落地 `ECON.cityCost` / `upgradeSkillCost` + `cityLevel` 变量，`renderTrain` 已接 UI；M2 州府可后续成为「城建锚点」 |
| 练兵 / 预备兵 / 伤兵恢复 | M3（GDD P3） | 复用 `R.ECON.recruitCost` 与 `playerSoldiers` 体系 |
| 州内加成光环（`atkMul/defMul`） | P3 | §4.4 公式 + `makeUnit` `opts.regionBonus` 接缝 |
| 「玉」的消费用途（宝物/科技） | M2-later / P3 | 本设计已产 `玉` 入 `RES`，消费侧只需读 `RES['玉']` |
| 同盟频道 / 广播 / 集结令 | M2（GDD P2，但独立于州郡） | 现有 `DIP` 纯逻辑模型 + `R.setRelation` 已支持，打城协同已在 `scoreTarget` 包抄项体现 |

---

## 7. 风险与取舍（仿 GDD §7）

| 风险 / 取舍 | 严重度 | 说明 | 缓解 |
|---|---|---|---|
| 程序化州界「碎边」或空州（某 seed 无格归属） | 中 | 噪声/坐标不当致某州仅 1~2 格 | 分配后做校验：任何州格数 < 阈值则就近合并；坐标经 `regions.csv` 调；`seed=12345` 保证可复现调试 |
| `landMul(L)=L/4` 致高产地产出过高，催生「种田流」主导策略 | 中 | 全图抢 8 级资源州即可碾压 | 守军同步随 `land` 放大（§4.2b）+ 州府 `land=8` 守军最厚；若仍失衡，下调 `LAND_W` 或加 `landMul` 上凸曲线 |
| 渲染新增 4 层（底色/州界/角标/府）致低端机掉帧 | 低 | 每帧多绘 4×可视格数 | 全部受既有可视裁剪约束（同屏仅 ~数百格）；角标/府均带 `cs>=10/12` 门槛；alpha 可调 |
| `c.lvl`→`c.land` 迁移漏改一处 | 低 | 出现 `undefined` 或 NaN 守军 | 9 处引用已全清单（§1.4 + §5 #3/#7/#8/#13/#14）；tests 未引用 `.lvl`，可选影子赋值 `c.lvl=c.land` 兜底 |
| 资源州「玉」先产不消费，玩家困惑 | 低 | M2 仅产出无用途 | UI 标注「玉：珍稀资源（后续用于宝物/科技）」；消费侧接缝已备（§6.3） |
| `holdCapital` 与既有 `land` 目标并存时目标栏歧义 | 低 | 多剧本胜利类型混合 | `updateObjective` 按 `victory.type` 分支显示，不复用旧 `n` 分支 |

---

## 8. 验收（M2 可验证项）

| # | 验收项 | 验证方法（可脚本化） |
|---|---|---|
| 1 | **州界显示**：相邻不同 `region` 格被州色描边 | 渲染后抽样边界格，断言存在 `region !== neighbor.region` 且描边绘制 |
| 2 | **十三州全覆盖**：每格 `region` 非空且属于 13 id 之一 | `map` 遍历：无 `region===undefined`，且 `new Set(所有region).size===13` |
| 3 | **州府可占领触发胜利**：占 `count` 个 `capital` 后 `gameOver` 且 `endGame('win')` | 单元：构造 `victory={type:'holdCapital',count:1}`，手动占 1 府→`checkEnd` 判胜 |
| 4 | **regionLand 胜利**：实控 ≥ `pct` 的州数达标判胜 | 单元：占满某州 70% 格→`regionOwnedCount('player',0.7)>=1` 为真 |
| 5 | **土地等级 1~8**：所有格 `land∈[1,8]`，州府 `land===8` | 遍历断言范围；`capital` 格 `land===8` |
| 6 | **土地等级影响产出**：高 `land` 州产出 > 低 `land` 州 | 固定 `RES`，对比占 1 个 8 级 vs 8 个 1 级地，`perTurn` 粮/币更高（权重 2.0 vs 0.25/格） |
| 7 | **土地等级影响守军**：高 `land` 中立地守军更多更厚 | `defenderArmy(高land格).units.length` > 低 land 格；`soldiers` 随 `land` 放大 |
| 8 | **资源州底色 + 玉产出**：`resource` 格渲染金底；推进时辰 `RES['玉']` 增长 | 渲染抽样；`btnTime` 后 `RES['玉']>0`（当占有资源州格） |
| 9 | **战斗核心零改动**：`simulateCombat`/`validTarget` 无 diff | 既有 18 项 harness（`GDD §4.1`）+ `tests/balance.js` 全过，无 NaN/不抛错 |
| 10 | **连地规则不变**：`validTarget` 行为与 M1 一致 | 既有出征可达性测试通过；黄框高亮逻辑未改 |

---

## 附录 A：字段 / 函数映射速查（全部来自真实代码）

| 设计项 | 真实代码锚点 |
|---|---|
| 格子地图尺寸 | `const W=80, H=56, CS=16;`（`index.html:177`） |
| 单元格结构 | `{t,owner,lvl,soldiers,ambush,upstream,floodTurns}`（`index.html:343`） |
| 地图生成 | `genMap()`（`index.html:337`）、`paint()`（`index.html:356`）、`seed=12345`（`index.html:338`） |
| 连地规则（不动） | `validTarget(x,y,dip)`（`index.html:360`） |
| 守军生成 | `defenderArmy(tile)`（`index.html:256`），中立队数 `1+Math.floor(tile.lvl/2)`（`index.html:263`） |
| 中立评分 | `scoreTarget(lord,t,def,x,y)`（`index.html:269`），`s+=2+t.lvl`（`index.html:283`） |
| 渲染主循环 | `render()`（`index.html:381`），裁剪 `x0..x1/y0..y1`，`cs=CS*zoom`，`sameOwner()`（`index.html:424`） |
| 州府/胜利判定 | `checkEnd()`（`index.html:646`）、`endGame()`（`index.html:654`）、`updateObjective()`（`index.html:779`）、`SCN.victory`（`index.html:650/784`） |
| 剧本数据 | `R.SCENARIOS`（`src/scenario.js:12`），`victory:{type:'land'|'defeatLord'}` |
| 资源经济 | `R.ECON.perTurn(ownedLand,cities,seasonGrainMul)`（`src/economy.js:23`）、`starting()`（`economy.js:21`）、`TYPES`/`RES_META`（`economy.js:13-20`）、`RES`（`index.html:175`） |
| 产出调用点 | `btnTime`（`index.html:820-823`，`perTurn(land,cities,grain)` + `cityMul=1+0.05*cityLevel`） |
| 数据层 | `DATA.state`、`reload()`、`loadConfigFromServer`/`loadCSVFromDir`（`src/data.js`），`RULES` getter（`src/rules.js:51`） |
| 战斗核心（不动） | `simulateCombat`/`makeUnit`/`applyTeamBonus`/`troopRPS`（`src/combat.js`） |

## 附录 B：`c.lvl` 全量迁移点（9 处，均在 `index.html`）

| 行 | 原代码 | M2 处理 |
|---|---|---|
| 263 | `Math.min(3,1+Math.floor(tile.lvl/2))` | → `tile.land`，上限 5（§4.2b） |
| 283 | `s += 2+t.lvl` | → `t.land` |
| 304 | `tile.lvl=0` | → 保留 `tile.land`，仅 `soldiers=0` |
| 334 | `c.lvl=0`（洪水翻转） | → 保留 `c.land` |
| 353 | `c.lvl=ri(1,5); ...c.lvl*ri(200,360)` | → `c.land=ri(1,8); c.land*ri(200,360)`（由 §2.2 统一生成接管） |
| 356 | `paint` 内 `c.lvl=0` | → `c.land=Math.max(c.land||1,5)` |
| 540 | `const lvl=c.lvl` | → `c.land` |
| 585 | `c.lvl=0`（占领成功） | → 保留 `c.land` |
| — | （tests/ 无 `.lvl` 引用） | 安全；可选影子 `c.lvl=c.land` 兜底 |

---

*本文档为 M2「州郡大地图」契约级设计，所有字段/函数/数值锚定仓库真实代码，战斗核心与连地规则零改动。M2 最小可用集 = 州聚合层 + 渲染增量 + 州府胜利条件 + 土地等级产出（含守军/产出随级缩放）；城建/科技树/练兵/州内光环/玉消费明确排除并预留接缝。*
