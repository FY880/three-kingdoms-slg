/* ============================================================
 *  combat.js —— 战斗 / 环境 / 兵书（UMD）
 *  依赖：data(state)、util(clamp)。
 *  所有对数据表的读取都在「调用时」走 DATA.state.*，确保热加载即时生效。
 * ============================================================ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('./util.js'));
  } else {
    global.RULES_COMBAT = factory(global.RULES_DATA, global.RULES_UTIL);
  }
})(typeof self !== 'undefined' ? self : this, function (DATA, UTIL) {
  const clamp = UTIL.clamp;

  const SUIT = { S: 1.2, A: 1.0, B: 0.85, C: 0.7 };
  // 将道风格 RPS：鹰扬>持重>奇变>鹰扬
  const STYLE_RPS = { 鹰扬: '持重', 持重: '奇变', 奇变: '鹰扬' };
  // 战斗节奏配置：回合上限、猝死阶段（保证收束、节奏明快）、伤害曲线、伏兵未命中惩罚
  const COMBAT_CFG = { maxRound: 10, suddenDeathFrom: 7, suddenDeathRamp: 0.3, dmgBase: 1.0, ambushMissMorale: -15 };

  function suitCoef(s) { return SUIT[s] || 1.0; }

  /* ---------- 环境结算器 ---------- */
  function environmentModifiers(terrainKey, weatherKey, troopType) {
    const t = DATA.state.TERRAIN[terrainKey] || DATA.state.TERRAIN.plain;
    const w = DATA.state.WEATHER[weatherKey] || DATA.state.WEATHER.sun;
    const troopAtk = t[troopType] !== undefined ? t[troopType] : 1.0;
    return {
      move: t.move * w.move,
      atk: t.atk * w.atk,
      def: t.def * w.def,
      troopAtk,
      fire: w.fire,
      scout: w.scout,
      flood: w.flood * (1 + t.flood),
      morale: w.morale,
      ambush: t.ambush,
      choke: t.choke
    };
  }
  function chokePenalty(terrainKey) {
    const t = DATA.state.TERRAIN[terrainKey];
    if (!t || !t.choke) return 1.0;
    return Math.max(0.5, 1 - 0.22 * t.choke);   // 天险依 CSV.choke 决定攻方受罚强度（数据驱动）
  }

  /* ---------- 兵书指令（诡道）---------- */
  function waterAttack(terrainKey, weatherKey) {
    const w = DATA.state.WEATHER[weatherKey] || DATA.state.WEATHER.sun;
    const t = DATA.state.TERRAIN[terrainKey] || DATA.state.TERRAIN.plain;
    if (w.flood <= 0) return { ok: false, dmg: 0, note: '天旱水枯，水攻无效' };
    const floodPower = w.flood * (1 + t.flood);
    return { ok: true, dmg: Math.round(800 * floodPower), note: `水势${floodPower.toFixed(2)}倍，低洼敌区遭淹，持续伤亡+士气崩` };
  }
  function emptyFort(selfSoldiers, selfMax) {
    const ratio = selfSoldiers / selfMax;
    if (ratio > 0.3) return { active: false };
    const bonus = (0.3 - ratio) * 2;
    return { active: true, defMul: 1 + bonus, hitDown: clamp(bonus, 0, 0.5), note: '空城：藏兵示弱，诱敌深入后反击' };
  }
  function ambushDetect(terrainKey, weatherKey, enemyScout) {
    const env = environmentModifiers(terrainKey, weatherKey, '步');
    const detectChance = clamp(0.3 + (1 - env.ambush) * 0.4 + (1 - env.scout) * 0.3 + enemyScout * 0.2, 0.05, 0.95);
    return Math.random() > detectChance;
  }

  /* ---------- 部队构建 ---------- */
  function makeUnit(generalId, soldiers, formationKey, opts) {
    opts = opts || {};
    const g = DATA.state.GENERALS.find(x => x.id === generalId) || DATA.state.GENERALS[0];
    const isBlade = g.force >= g.intellect;
    const primary = isBlade ? g.force : g.intellect;
    const defStat = isBlade ? g.leadership : g.intellect;
    const f = DATA.state.FORMATIONS[formationKey] || DATA.state.FORMATIONS.fengshi;
    return {
      g, soldiers: Math.round(soldiers), max: soldiers,
      formation: f, isBlade, primary, defStat,
      speed: g.speed, style: g.style, morale: opts.morale || 80,
      isAmbush: !!opts.isAmbush, isHidden: !!opts.isHidden, alive: true
    };
  }

  /* ---------- 庙算（天时/地利/人和 评分）---------- */
  function miaoSuan(ctx) {
    const w = DATA.state.WEATHER[ctx.weather] || DATA.state.WEATHER.sun;
    const dt = DATA.state.TERRAIN[ctx.defTerrain] || DATA.state.TERRAIN.plain;
    const at = DATA.state.TERRAIN[ctx.attTerrain] || DATA.state.TERRAIN.plain;
    const tianshi = clamp(Math.round(50 + (w.atk - 1) * 80 + (w.def - 1) * 40 + w.flood * 20), 0, 100);
    const dili = clamp(Math.round(50 + (dt.def - 1) * 100 + (dt.choke ? 20 : 0) - (at.atk - 1) * 30), 0, 100);
    const renhe = clamp(Math.round(50 + (ctx.attMorale - 50) * 0.5 + (ctx.leadAvg - 80) * 0.3), 0, 100);
    const winProb = clamp(Math.round(tianshi * 0.25 + (100 - dili) * 0.35 + renhe * 0.4), 5, 95);
    return { tianshi, dili, renhe, winProb };
  }

  /* ---------- 战斗模拟（回合制战法演算）---------- */
  function styleCoef(attStyle, defStyle) {
    if (STYLE_RPS[attStyle] === defStyle) return 1.2;
    if (STYLE_RPS[defStyle] === attStyle) return 0.85;
    return 1.0;
  }
  function squadMoraleContagion(units) {
    const alive = units.filter(u => u.alive); if (alive.length < 2) return;
    const avg = alive.reduce((s, u) => s + u.morale, 0) / alive.length;
    alive.forEach(u => u.morale = clamp(u.morale + (avg - u.morale) * 0.22, 20, 100));
    if (alive.some(u => u.morale < 25)) alive.forEach(u => u.morale = clamp(u.morale - 3, 20, 100));
  }
  function simulateCombat(attacker, defender, ctx) {
    ctx = ctx || {};
    const CFG = COMBAT_CFG;
    const terrainKey = ctx.terrain || 'plain';
    const weatherKey = ctx.weather || 'sun';
    const env = environmentModifiers(terrainKey, weatherKey, '步');
    const choke = chokePenalty(terrainKey);
    const log = [];
    const ambush = ctx.ambush === true;
    const ambushFailed = ctx.ambushFailed === true;
    let round = 0, maxRound = CFG.maxRound;
    const allUnits = () => [...attacker, ...defender];

    if (ambushFailed) {
      attacker.forEach(u => u.morale = clamp(u.morale + CFG.ambushMissMorale, 20, 100));
      log.push('⚠️ 伏兵被识破！攻方暴露，士气受挫，守军抢得先机');
    }

    while (round < maxRound && attacker.some(u => u.alive) && defender.some(u => u.alive)) {
      round++;
      log.push(`—— 第${round}回合 ——`);
      let order = allUnits().filter(u => u.alive).sort((a, b) => b.speed - a.speed);
      if (ambush && round === 1) {
        order = [...attacker.filter(u => u.alive), ...defender.filter(u => u.alive)].sort((a, b) => b.speed - a.speed);
      } else if (ambushFailed && round === 1) {
        order = [...defender.filter(u => u.alive), ...attacker.filter(u => u.alive)].sort((a, b) => b.speed - a.speed);
      }
      for (const u of order) {
        if (!u.alive) continue;
        const foes = (attacker.includes(u) ? defender : attacker).filter(x => x.alive);
        if (!foes.length) break;
        const target = foes.reduce((m, x) => x.soldiers > m.soldiers ? x : m, foes[0]);
        const isAttackerSide = attacker.includes(u);
        const sCoef = styleCoef(u.style, target.style);
        const troopAtk = (DATA.state.TERRAIN[terrainKey][u.g.troop] !== undefined) ? DATA.state.TERRAIN[terrainKey][u.g.troop] : 1.0;
        const sudden = round >= CFG.suddenDeathFrom ? (1 + (round - CFG.suddenDeathFrom) * CFG.suddenDeathRamp) : 1;
        let atkMul = u.formation.atk * suitCoef(u.g.suit) * env.atk * troopAtk
                     * sCoef * (u.morale / 80) * (isAttackerSide ? choke : 1) * (u.isAmbush && round === 1 ? 1.5 : 1) * sudden;
        const K = 150;
        const DAMAGE_SCALE = 4.0;
        const effDef = target.defStat * env.def;   // 地形防御加成：高城防/山地降低守军承伤（数据驱动）
        const mitigation = effDef / (effDef + K);
        const dmg = Math.max(1, Math.round(u.primary * atkMul * (1 - mitigation) * DAMAGE_SCALE * CFG.dmgBase));
        target.soldiers -= dmg;
        log.push(`${u.g.name}(${u.isBlade ? '兵刃' : '谋略'}) → ${target.g.name} 造成 ${dmg} 伤害（剩${Math.max(0, target.soldiers)}）`);
        if (Math.random() < 0.3) {
          const extra = Math.round(dmg * 0.5);
          target.soldiers -= extra;
          log.push(`  ⚡ ${u.g.name} 发动【${u.g.skill}】追加 ${extra} 伤害`);
        }
        if (target.soldiers <= 0) { target.alive = false; target.soldiers = 0; log.push(`  ☠ ${target.g.name} 败退`); }
      }
      if (ctx.floodActive) {
        defender.forEach(u => { if (u.alive) { const d = Math.round(300 * env.flood); u.soldiers -= d; if (u.soldiers <= 0) { u.alive = false; u.soldiers = 0; log.push(`  🌊 ${u.g.name} 被水淹败退`); } } });
      }
      squadMoraleContagion(allUnits());
      allUnits().forEach(u => { if (u.alive) u.morale = clamp(u.morale - (u.soldiers / u.max < 0.5 ? 5 : 0) + env.morale * 0.1, 20, 100); });
    }
    const attWin = defender.every(u => !u.alive);
    const defWin = attacker.every(u => !u.alive);
    let result = attWin ? '攻方胜' : defWin ? '守方胜' : '超时（按剩余兵力判）';
    if (!attWin && !defWin) {
      const aLeft = attacker.reduce((s, u) => s + u.soldiers, 0);
      const dLeft = defender.reduce((s, u) => s + u.soldiers, 0);
      result = aLeft >= dLeft ? '攻方胜(兵力占优)' : '守方胜(兵力占优)';
    }
    return { result, round, log, attackers: attacker.map(u => ({ name: u.g.name, soldiers: u.soldiers, alive: u.alive })),
             defenders: defender.map(u => ({ name: u.g.name, soldiers: u.soldiers, alive: u.alive })) };
  }

  /* ---------- 水攻持续 ---------- */
  function floodDuration(weatherKey) { const w = DATA.state.WEATHER[weatherKey] || DATA.state.WEATHER.sun; return w.flood <= 0 ? 0 : Math.max(1, Math.round(w.flood * 2)); }
  function startFlood(tile, weatherKey) { if (!tile) return 0; const d = floodDuration(weatherKey); tile.floodTurns = Math.max(tile.floodTurns || 0, d); return d; }
  function tickFlood(tile, weatherKey) {
    if (!tile || !tile.floodTurns || tile.floodTurns <= 0) return 0;
    const w = DATA.state.WEATHER[weatherKey] || DATA.state.WEATHER.sun;
    const t = DATA.state.TERRAIN[tile.t] || DATA.state.TERRAIN.plain;
    const dmg = Math.round(800 * w.flood * (1 + t.flood) / Math.max(1, tile.floodTurns));
    tile.soldiers = Math.max(0, tile.soldiers - dmg); tile.floodTurns--; if (tile.soldiers <= 0) tile.floodTurns = 0;
    return dmg;
  }

  /* ---------- AI 针对克制选阵法 ---------- */
  function chooseFormation(attGen, defGen, terrainKey) {
    const t = DATA.state.TERRAIN[terrainKey] || DATA.state.TERRAIN.plain;
    const cand = Object.keys(DATA.state.FORMATIONS).filter(k => DATA.state.FORMATIONS[k].reqInt <= (attGen ? attGen.intellect : 0));
    let best = cand[0], bs = -1e9;
    for (const k of cand) { const f = DATA.state.FORMATIONS[k]; let s = (f.atk - 1) * 120 + (f.def - 1) * 70 + (f.flank - 1) * 50;
      if (t.choke) s += f.atk * 40 - f.def * 12;
      if (attGen && defGen) { if (STYLE_RPS[attGen.style] === defGen.style) s += 40; if (defGen.troop === '弓') s += f.flank * 30; }
      if (s > bs) { bs = s; best = k; } }
    return best;
  }

  return {
    SUIT, STYLE_RPS, COMBAT_CFG, suitCoef,
    environmentModifiers, chokePenalty, waterAttack, emptyFort, ambushDetect,
    makeUnit, miaoSuan, styleCoef, simulateCombat,
    squadMoraleContagion, floodDuration, startFlood, tickFlood, chooseFormation
  };
});
