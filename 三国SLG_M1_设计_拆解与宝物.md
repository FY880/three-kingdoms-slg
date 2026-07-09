# 三国 SLG 单机版 · M1 数据内容与设计文档（战法拆解 / 宝物 / 升战法 / 城建）

> **作者**：文策渊（design-strategist）
> **配套数据交付**：`data/skills.csv`（新增 5 个追击战法）、`data/generals.csv`（追击挂载 + 奸雄文案对齐）、`data/treasures.csv`（新建 10 件宝物）
> **范围**：M1 打磨。本文档**不改 `src/*.js`**；凡标注「需引擎落地」者，由程基岩在逻辑层实现，本文仅给出数据/配置层契约与最终文案。
> **数据来源**：以仓库真实代码与配表为准（`src/*.js`、`data/*.csv`），未凭空编造数值。
> **状态**：M1 数据内容已落地；拆解/装配/宝物/升战法/城建 的规则与文案已定稿，部分需引擎 hook 已明确标注。

---

## 0. 本轮变更摘要

| 交付 | 内容 | 文件 |
|---|---|---|
| 追击战法 | 新增 5 个 `type=追击` 战法：追风逐电(赵云)/蛇矛连刺(张飞)/方天连戟(吕布)/烈弓连射(黄忠)/青龙连斩(关羽) | `data/skills.csv` |
| 追击挂载 | 上述 5 将 `skills` 列末尾追加对应追击 id（仅改该列） | `data/generals.csv` |
| 宝物配表 | 新建 10 件有名宝物，覆盖 武/谋/防/速/辅 五槽、force/intellect/leadership/speed/def 五属性 | `data/treasures.csv` |
| 文案对齐 | 奸雄 desc 与曹操 skillDesc 改为「开场提升全军攻击与防御」；空城文案保持「残血时…」 | `data/skills.csv` / `data/generals.csv` |
| 规则文档 | 战法拆解/装配、宝物装备、升战法、城建、空城/奸雄对齐 | 本文 |

---

## 1. 战法拆解 / 装配规则

### 1.1 自带战法（签名战法）
- 每名武将 `skills` 列（分号分隔）中，`skills[0]` = **自带战法（签名战法）**，不可被拆解、不可被卸下。
- 例：关羽 `skills=[weizhen;qinglong]` → `weizhen` 为自带；`qinglong` 为本轮原生挂载的追击（属该将「已学战法」，见 1.2）。

### 1.2 拆解（Dismantle）
- **来源**：仅武将的「自带战法」`skills[0]` 可拆；本轮原生挂载的追击（`skills[1]`）视为该将「第二自带」，消耗该将时一并产出。
- **可拆武将范围**：5★ 全部可拆；4★ 可选开启（建议默认关闭，开启后 4★ 亦可拆，但产出「残卷」战法书，装配效果 ×0.9）。**已实现**：`allow4Star` 开关（默认 `false`），开启后 4★ 武将方可拆解；拆解产出的「残卷」战法书以 `DATA.state.WEAK[generalId][skillId]=true` 标记，装配时写入该标记，`skillList`/`commandSetup`/`cast` 对 `weak` 技能统一按 ×0.9 结算（`dmgPct`/`healPct`/`buff*Pct`/`debuff*Pct`/`dotPct`/`stealPct`）。
- **动作**：消耗该武将（从可出战名单移除），将其 `skills[0]`（及原生 `skills[1]`）对应战法书 **+1 入库**。库存按 `skillId → count` 计数。
- **防复制**：通过装配获得的战法书（`skills[1..]` 中非原生部分）**不可再拆**，避免战法书无限复制。

### 1.3 装配（Equip）
目标武将 `G` 须同时满足：
1. **有空槽**：`len(G.skills) < 3`（自带 + 最多 2 个装配位，与现有上限一致）；
2. **未拥有**：该 `skillId` 不在 `G.skills` 中（不允许重复装配同一战法）；
3. **非来源**：`G` 不等于被拆的来源武将（不能自己拆自己装）。
- **动作**：库存扣 1 本对应战法书，`G.skills` 追加该 id（分号分隔）。
- **卸下**：允许卸下 `skills[1..]`（非自带）的战法，战法书 +1 退回库存。

### 1.4 数据层落地
- 装配/卸下 = 改写目标武将 `skills` 列（保持 `skills[0]` 不变）；`data.js:toGenerals` 已用 `split(/[;,]/)` 解析，无需改。
- **战法书库存**：需在 `state` 新增 `SKILLBOOKS`（map: `skillId→count`），由拆解/装配逻辑维护。属资源/库存范畴，建议由 `economy.js` 承载，或在 `data/` 下新增 `skillbooks.csv`（初始为空）。

### 1.5 设计取舍与风险
- **主导策略风险**：若某签名战法过强且可被广装配，可能形成主导策略。建议设「同名战法全局装配上限」（同一战法书最多同时装在 N 名将上），遏制单一强力战法泛滥。
- **认知过载**：每将最多 3 战法（自带+2），与既有上限一致，不增加认知负担。✅ 无新增过载。

---

## 2. 宝物装备规则

### 2.1 配表（`data/treasures.csv`，6 列）
`id,name,slot,stat,bonusPct,desc`
- `slot ∈ {武,谋,防,速,辅}`（UI 分类 / 可装备将种提示）
- `stat ∈ {force,intellect,leadership,speed,def}`（`def` 表示防御向，引擎映射到防御属性）
- `bonusPct` 为小数（如 `0.08` = +8%）

### 2.2 装备与生效
- 按 `slot` 提示可装备将种：武→武力将，谋→智力/统率将，防→防御将，速→速度将，辅→统率/辅助将。
- 装备后，该将对应 `stat += bonusPct`，**在 `makeUnit` 时生效**。
- **引擎落地（需引擎落地）**：`combat.js:makeUnit` 当前仅读 `general.force/intellect/leadership/speed`（及派生 `defStat`）。宝物加成需在此叠加：
  `equipStat = baseStat × (1 + Σ bonusPct of equipped treasures whose stat matches)`。
  - `stat=def` 非原始四维之一，应映射到防御属性（`defStat` 或 `defMul`），引擎需特殊处理。
- **槽位**：建议初期每将 **1 个宝物槽**（或按 slot 分槽、每类 1 件），避免数值膨胀。

### 2.3 数值分布（贴合人设）
| 宝物 | slot | stat | bonusPct | 人设逻辑 |
|---|---|---|---|---|
| 赤兔马 | 速 | speed | 0.12 | 名马加速度（吕布坐骑） |
| 的卢 | 速 | speed | 0.08 | 名马加速度 |
| 青龙偃月刀 | 武 | force | 0.12 | 关羽名刀加武力 |
| 丈八蛇矛 | 武 | force | 0.10 | 张飞名矛加武力 |
| 方天画戟 | 武 | force | 0.13 | 吕布神兵最高武力加成 |
| 雌雄双股剑 | 武 | force | 0.09 | 刘备双剑加武力 |
| 太平要术 | 谋 | intellect | 0.10 | 道书加智力 |
| 八阵图 | 谋 | leadership | 0.10 | 阵图加统率 |
| 护心镜 | 防 | def | 0.10 | 防具加防御 |
| 虎符 | 辅 | leadership | 0.08 | 调兵符加统率 |

---

## 3. 升战法（提升武将等级）

### 3.1 规则
- 实现为「提升武将等级」：消耗 `economy.upgradeSkillCost(level)`（币与铁），`general.level + 1`。
- **等级上限**：建议 **15**。
- **成长**：`combat.js:makeUnit` 用 `grow = 1 + (lv-1) × 0.06` 作用于 `force/intellect/leadership/speed`。每升 1 级 +6% 四维 → 伤害（`primary`）与防御（`defStat`）随等级提升。

### 3.2 消耗曲线（`economy.upgradeSkillCost(level) = {币:100+lv×80, 铁:50+lv×30}`）
| 由 L → L+1 | 币 | 铁 |
|---|---|---|
| 1→2 | 180 | 80 |
| 2→3 | 260 | 110 |
| 3→4 | 340 | 140 |
| 4→5 | 420 | 170 |
| 5→6 | 500 | 200 |
| 6→7 | 580 | 230 |
| 7→8 | 660 | 260 |
| 8→9 | 740 | 290 |
| 9→10 | 820 | 320 |
| 10→11 | 900 | 350 |
| 11→12 | 980 | 380 |
| 12→13 | 1060 | 410 |
| 13→14 | 1140 | 440 |
| 14→15 | 1220 | 470 |

> 注：当前配表武将多为 `lv=5`（孙权/黄忠 `lv=4`）；`grow(15)=1.84`，即满级四维 +84%。

### 3.3 ⚠️ 关键对齐（需引擎落地 / 设计确认）
- **任务书前提「fireRate 已吃等级成长」与代码不符**：`skills.js:23` 的 `fireRate` 读 `caster.g.force / caster.g.intellect`（配表**原始值**），**不吃 `makeUnit` 的 `grow`**。
- 后果：当前「升战法」**只提升属性/伤害，不提升发动率**。
- **建议修正（一行，触 `src`）**：将 `fireRate` 改为读 `caster.force / caster.intellect`（已成长值）。若 M1 不修正，则「升战法增强发动率」的收益为 0，与玩家预期不符；但若修正，高等级将发动率显著上升（配合羁绊逼近 92 上限，已有钳制保护平衡）。**请主理人拍板是否随 M1 一并修正。**

---

## 4. 城建

### 4.1 消耗
`economy.cityCost() = {木:400, 铁:300, 石:300, 币:200}`（flat，每级固定，`economy.js` 已定）。

### 4.2 效果（雏形数值建议）
- 每提升 1 级城建：**全军 `atkMul × (1+0.02)`、`defMul × (1+0.02)`**；**资源产出 `× (1+0.05)`**。
- **城建等级上限建议 10** → 满级 `+20% 攻/防`、`+50% 资源产出`。
- **引擎落地**：战斗开始时读取 `cityLevel`，对全军 `unit.atkMul/defMul` 乘对应系数；`economy.perTurn` 资源产出乘 `(1+0.05×cityLevel)`。

### 4.3 取舍
- `cityCost` 当前为 **flat**（无随等级缩放）。若希望后期城建更「重」，可在 `economy.cityCost` 增加等级参数；M1 维持 flat（简单、可预测）。

---

## 5. 空城 / 奸雄 文案-实现对齐

### 5.1 奸雄
- **现状**：`type=指挥`，`commandSetup` 开场一次性结算（全军 +10% 攻 +5% 防）。原 desc「每回合提升全军攻击并降低敌方防御」与「开场一次性」实现不符（GDD §2.1.4 已标注）。
- **最终文案（已写入 `skills.csv` + `generals.csv` 曹操 `skillDesc`）**：**「开场提升全军攻击与防御」**。
- **引擎动作**：无需改（指挥开场结算已正确），仅文案对齐即消除「每回合」歧义。✅

### 5.2 空城
- **现状**：`type=被动`，`commandSetup` 当前为开场**无条件常驻** `+25% defMul` + 敌方 `-10% 命中`。设计意图为「**残血（兵力<50%）时**」才触发。
- **最终文案（保持）**：**「残血时大幅提升防御并使敌方命中下降」**（`skills.csv` 与 `generals.csv` 诸葛亮 `skillDesc` 已是此文案，无需改）。
- **实现对齐建议（需引擎落地）**：
  - 引擎应在战斗 tick / 受击时检测 `selfSoldiers / selfMax < 0.5`，按 `emptyFort(selfSoldiers, selfMax)` 计算 `defMul` 与 `hitDown`（`combat.js` 已有 `emptyFort` helper）。
  - **阈值不一致**：`emptyFort` 当前阈值为 `0.3`（兵力<30%），与「残血<50%」不符。建议将空城触发阈值统一为 **0.5**（改 `emptyFort` 入参或新增空城专用阈值）。
  - `skill` 的 `buffDefPct=0.25 / debuffAtkPct=0.10` 作为「残血时峰值加成」参考；引擎按残血深度在 `[0, 峰值]` 间插值（`emptyFort` 的 `bonus=(0.3-ratio)×2` 已提供随残血加深而增大的逻辑，只需把阈值调成 0.5）。

---

## 6. 追击战法落地接口说明（补充 · 需引擎落地）

- **数据已就绪**：`skills.csv` 新增 5 个 `type=追击` 战法（`zhuiji/shemao/fangtian/liegong/qinglong`），已挂到对应武将 `skills[1]`。
- **引擎缺口（GDD §2.1.1 P0）**：`combat.js:simulateCombat` 的战法循环仅 `if (sk.type !== '主动') continue`，**普攻后追击 hook 未建**；且 `data.js` 未加载 `treasures.csv`（缺 `TREASURES` state 与 `toTreasures` 映射）。
- **建议落地（程基岩）**：在普攻结算块之后增加
  ```js
  for (const sk of u.skills) if (sk.type === '追击') {
    if ((u.skillCd[sk.id] || 0) > 0) continue;
    if (Math.random() * 100 < SKILLS.fireRate(sk, u)) {
      SKILLS.cast(sk, u, allies, foes, env, log);
      u.skillCd[sk.id] = (sk.cd || 0) + 1;
    }
  }
  ```
  追击目标沿用 `sk.target`（`foe_top` / `foe_front`）。
- **宝物加载**：`data.js` 增加 `TREASURES` state + `toTreasures`；`loadConfigFromServer / loadCSVFromDir` 增加 `treasures.csv`。

---

## 7. 已知风险与取舍汇总

| 编号 | 严重度 | 风险 | 建议 |
|---|---|---|---|
| R1 | 高 | 追击循环未挂钩 → 新增追击数据当前**惰性**，未建普攻后 hook | 程基岩落地 §6 hook（P0） |
| R2 | 中 | `fireRate` 不吃等级成长 → 「升战法增强发动率」不成立 | 改 `fireRate` 读成长值（一行，触 `src`）或明确仅加属性 |
| R3 | 中 | `skills.csv` 历史 12 行存在列数错位（24~27 列）；离线 Demo 靠 `DEFAULTS` 兜底，http 加载会错位解析 | 本次新增 5 行已严格 25 列；建议另起一轮将全表归一（参照 `DEFAULTS.SKILLS` 逐字段映射） |
| R4 | 低 | `shock` 控制循环未特判（GDD §2.1.3），威震华夏/鹰视 震慑当前≈空操作 | 下一步补 `shock` 分支 |
| R5 | 低 | 宝物 `def→防御` 映射、每将宝物槽位数需 `makeUnit` 增加装备叠加 | §2.2 落地 |

---

## 8. 下一步建议（给主理人 / 程基岩）

1. **落地追击普攻后 hook**（R1，P0）。
2. **修正 `fireRate` 读成长值**或明确「升战法只加属性」（R2）。
3. **归一 `skills.csv` 为 25 列**（R3），消除 http 加载错位隐患。
4. **接入升战法 / 城建 UI**（`economy` API 已就绪，无需改逻辑层）。
5. **宝物加载与 `makeUnit` 叠加**（R5）。

---

*本文档所有规则、数值、文案均锚定仓库真实代码与配表；凡触 `src` 项已明确标注「需引擎落地」，供主理人按 M1 排期推进。*
