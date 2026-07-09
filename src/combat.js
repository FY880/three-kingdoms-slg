/* ============================================================
 *  combat.js —— 战斗 / 环境 / 兵书 / 战法演算（UMD）
 *  依赖：data(state)、util(clamp)、skills(战法引擎)。
 *  所有对数据表的读取都在「调用时」走 DATA.state.*，确保热加载即时生效。
 * ============================================================ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('./util.js'), require('./skills.js'));
  } else {
    global.RULES_COMBAT = factory(global.RULES_DATA, global.RULES_UTIL, global.RULES_SKILLS);
  }
})(typeof self !== 'undefined' ? self : this, function (DATA, UTIL, SKILLS) {
  const clamp = UTIL.clamp;

  const SUIT = { S: 1.2, A: 1.0, B: 0.85, C: 0.7 };
  const STYLE_RPS = { 鹰扬: '持重', 持重: '奇变', 奇变: '鹰扬' };
  const COMBAT_CFG = { maxRound: 10, suddenDeathFrom: 7, suddenDeathRamp: 0.3, dmgBase: 1.0, ambushMissMorale: -15 };
  const FORTIFIED = { city: 1, defile: 1, bridge: 1 };

  function suitCoef(s) { return SUIT[s] || 1.0; }

  /* ---------- 环境结算器 ---------- */
  function environmentModifiers(terrainKey, weatherKey, troopType) {
    const t = DATA.state.TERRAIN[terrainKey] || DATA.state.TERRAIN.plain;
    const w = DATA.state.WEATHER[weatherKey] || DATA.state.WEATHER.sun;
    const col = (DATA.state.TROOPS[troopType] && DATA.state.TROOPS[troopType].fieldCol) || 'inf';
    const troopAtk = t[col] !== undefined ? t[col] : 1.0;
    return { move: t.move * w.move, atk: t.atk * w.atk, def: t.def * w.def, troopAtk,
      fire: w.fire, scout: w.scout, flood: w.flood * (1 + t.flood), morale: w.morale, ambush: t.ambush, choke: t.choke };
  }
  function chokePenalty(terrainKey) {
    const t = DATA.state.TERRAIN[terrainKey];
    if (!t || !t.choke) return 1.0;
    return Math.max(0.5, 1 - 0.22 * t.choke);
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
  if (ratio > 0.5) return { active: false };
  const bonus = (0.5 - ratio) * 2;
  return { active: true, defMul: 1 + bonus, hitDown: clamp(bonus, 0, 0.5), note: '空城：藏兵示弱，诱敌深入后反击' };
}
  function ambushDetect(terrainKey, weatherKey, enemyScout) {
    const env = environmentModifiers(terrainKey, weatherKey, '步');
    const detectChance = clamp(0.3 + (1 - env.ambush) * 0.4 + (1 - env.scout) * 0.3 + enemyScout * 0.2, 0.05, 0.95);
    return Math.random() > detectChance;
  }

  /* ---------- 兵种克制 ---------- */
  function troopRPS(att, def) {
    const T = DATA.state.TROOPS; const a = T[att.g.troop], b = T[def.g.troop];
    if (!a || !b) return 1.0;
    if (a.beat && a.beat === def.g.troop) return 1.15;
    if (b.beat && b.beat === att.g.troop) return 0.88;
    return 1.0;
  }

  /* ---------- 阵营羁绊 + 武将缘分 ---------- */
  function applyTeamBonus(army) {
    const alive = army.filter(u => u.alive);
    const ids = alive.map(u => u.g.id);
    const facs = alive.map(u => u.faction);
    const atkPct = [], defPct = [], rates = [], names = [];
    const f0 = facs[0];
    if (facs.length && facs.every(f => f === f0) && DATA.state.FACTIONS[f0]) {
      const f = DATA.state.FACTIONS[f0];
      atkPct.push(f.bondAtkPct); defPct.push(f.bondDefPct); rates.push(f.bondRate); names.push(f.name + '羁绊');
    }
    for (const b of Object.values(DATA.state.BONDS)) {
      if (b.members.every(m => ids.includes(m))) { atkPct.push(b.atkPct); rates.push(b.rate); names.push(b.name); }
    }
    const aMul = 1 + atkPct.reduce((s, v) => s + v, 0);
    const dMul = 1 + defPct.reduce((s, v) => s + v, 0);
    const rBon = rates.reduce((s, v) => s + v, 0);
    army.forEach(u => { u.atkMul *= aMul; u.defMul *= dMul; u.bondRate = rBon; u.bondNames = names; });
    return names;
  }

  /* ---------- 部队构建（含等级成长）---------- */
  function makeUnit(generalId, soldiers, formationKey, opts) {
    opts = opts || {};
    const g = DATA.state.GENERALS.find(x => x.id === generalId) || DATA.state.GENERALS[0];
    const lv = g.level || 1;
    const grow = 1 + (lv - 1) * 0.06;
    let force = Math.round(g.force * grow), intellect = Math.round(g.intellect * grow);
    let leadership = Math.round(g.leadership * grow), speed = Math.round(g.speed * grow);
    // 宝物加成：等级成长后的基础四维先叠加（def 在派生后单独处理）
    if (opts.treasures) for (const tr of opts.treasures) {
      if (!tr) continue;
      if (tr.stat === 'force') force = Math.round(force * (1 + tr.bonusPct));
      else if (tr.stat === 'intellect') intellect = Math.round(intellect * (1 + tr.bonusPct));
      else if (tr.stat === 'leadership') leadership = Math.round(leadership * (1 + tr.bonusPct));
      else if (tr.stat === 'speed') speed = Math.round(speed * (1 + tr.bonusPct));
    }
    const isBlade = force >= intellect;
    const primary = isBlade ? force : intellect;
    let defStat = isBlade ? leadership : intellect;
    if (opts.treasures) for (const tr of opts.treasures) {
      if (tr && tr.stat === 'def') defStat = Math.round(defStat * (1 + tr.bonusPct));
    }
    const f = DATA.state.FORMATIONS[formationKey] || DATA.state.FORMATIONS.fengshi;
    const u = {
      g, soldiers: Math.round(soldiers), max: soldiers,
      formation: f, isBlade, primary, defStat, force, intellect, speed, style: g.style, morale: opts.morale || 80,
      faction: g.faction, skills: SKILLS.skillList(g), bondRate: 0, bondNames: [],
      atkMul: 1, defMul: 1, speedMul: 1, dots: [], ctrl: '', ctrlTurns: 0,
      silenced: false, disarmed: false, confused: false, reflectNext: false,
      immuneCtrl: false, immuneCtrlUsed: false, regenPct: 0, regenMorale: 0, foeHitDown: 0,
      emptyFort: false, skillCd: {}, alive: true, isAmbush: !!opts.isAmbush
    };
    // 城建加成：全军 atk/def 乘 cityBonus（敌方传入 1 即无加成）
    if (opts.cityBonus) { u.atkMul *= opts.cityBonus; u.defMul *= opts.cityBonus; }
    // M2 州内加成光环：在本州（出生州）作战的微增益（≤5%，避免主场碾压）
    if (opts.regionBonus) { const rb = (typeof opts.regionBonus === 'number') ? opts.regionBonus : 0.04; u.atkMul *= (1 + rb); u.defMul *= (1 + rb); }
    return u;
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

  /* ---------- 战斗模拟 ---------- */
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

    // 阵营/缘分 + 指挥/被动战法 开场结算
    const bA = applyTeamBonus(attacker), bD = applyTeamBonus(defender);
    if (bA.length) log.push('⚑ 我军【' + bA.join('·') + '】生效');
    if (bD.length) log.push('⚑ 敌军【' + bD.join('·') + '】生效');
    attacker.forEach(u => SKILLS.commandSetup(u, attacker, log));
    defender.forEach(u => SKILLS.commandSetup(u, defender, log));

    // 记录「指挥/被动结算后的基础防御」（空城每回合在此基线之上临时放大，避免叠加）
    allUnits().forEach(u => { u.baseDefMul = u.defMul; u.baseFoeHitDown = u.foeHitDown || 0; });

    if (ambushFailed) {
      attacker.forEach(u => u.morale = clamp(u.morale + CFG.ambushMissMorale, 20, 100));
      log.push('⚠️ 伏兵被识破！攻方暴露，士气受挫，守军抢得先机');
    }

    while (round < maxRound && attacker.some(u => u.alive) && defender.some(u => u.alive)) {
      round++;
      log.push(`—— 第${round}回合 ——`);
      let order = allUnits().filter(u => u.alive).sort((a, b) => b.speed - a.speed);
      if (ambush && round === 1) order = [...attacker.filter(u => u.alive), ...defender.filter(u => u.alive)].sort((a, b) => b.speed - a.speed);
      else if (ambushFailed && round === 1) order = [...defender.filter(u => u.alive), ...attacker.filter(u => u.alive)].sort((a, b) => b.speed - a.speed);

      // 空城：每个存活单位若标记 emptyFort，按残血程度临时放大防御，并降低敌方命中（每回合重置基线，避免叠加）
      allUnits().forEach(u => { if (u.alive) u.foeHitDown = u.baseFoeHitDown || 0; });
      allUnits().forEach(u => {
        if (!u.alive || !u.emptyFort) return;
        const ef = emptyFort(u.soldiers, u.max);
        u.defMul = u.baseDefMul * (ef.active ? ef.defMul : 1);
        if (ef.active) {
          const foes = attacker.includes(u) ? defender : attacker;
          foes.forEach(en => { if (en.alive) en.foeHitDown = (en.foeHitDown || 0) + ef.hitDown; });
          if (!u._efLogged) { log.push(`🏯 ${u.g.name} 空城固守，防御大增、敌方命中下降`); u._efLogged = true; }
        } else {
          u._efLogged = false;
        }
      });

      for (const u of order) {
        if (!u.alive) continue;
        const isAttackerSide = attacker.includes(u);
        const allies = isAttackerSide ? attacker : defender;
        const foes = isAttackerSide ? defender : attacker;
        const aliveFoes = foes.filter(x => x.alive);
        if (!aliveFoes.length) break;

        // 控制：震慑/沉默/缴械/混乱
        if (u.ctrl === 'stun' || u.ctrl === 'shock') { log.push(`  💫 ${u.g.name} 被震慑，本回合无法行动`); continue; }
        if (u.ctrl === 'silence') log.push(`  🤫 ${u.g.name} 被沉默，战法受限`);

        // 普攻目标（混乱则误击友军）
        let target;
        if (u.ctrl === 'confuse') {
          const mates = allies.filter(x => x.alive && x !== u);
          target = mates.length ? mates[Math.floor(Math.random() * mates.length)] : aliveFoes[0];
          log.push(`  🌀 ${u.g.name} 混乱，误击${target === aliveFoes[0] ? '敌' : '友'}军`);
        } else {
          target = aliveFoes.reduce((m, x) => x.soldiers > m.soldiers ? x : m, aliveFoes[0]);
        }
        if (!u.disarmed) {
          const sCoef = styleCoef(u.style, target.style);
          const col = (DATA.state.TROOPS[u.g.troop] && DATA.state.TROOPS[u.g.troop].fieldCol) || 'inf';
          const troopAtk = (DATA.state.TERRAIN[terrainKey][col] !== undefined) ? DATA.state.TERRAIN[terrainKey][col] : 1.0;
          const rps = troopRPS(u, target);
          const siege = (FORTIFIED[terrainKey] && DATA.state.TROOPS[u.g.troop].siegeBonus > 1) ? DATA.state.TROOPS[u.g.troop].siegeBonus : 1;
          const sudden = round >= CFG.suddenDeathFrom ? (1 + (round - CFG.suddenDeathFrom) * CFG.suddenDeathRamp) : 1;
          const atkMul = u.formation.atk * suitCoef(u.g.suit) * env.atk * troopAtk * rps * siege
            * sCoef * (u.morale / 80) * (isAttackerSide ? choke : 1) * (u.isAmbush && round === 1 ? 1.5 : 1) * sudden * u.atkMul
            * (1 - (u.foeHitDown || 0));
          const K = 150;
          const DAMAGE_SCALE = 4.0;
          const effDef = target.defStat * env.def * target.defMul;
          const mitigation = effDef / (effDef + K);
          const dmg = Math.max(1, Math.round(u.primary * atkMul * (1 - mitigation) * DAMAGE_SCALE * CFG.dmgBase));
          target.soldiers -= dmg;
          log.push(`${u.g.name}(${u.g.troop}·${u.isBlade ? '兵刃' : '谋略'}) → ${target.g.name}(${target.g.troop}) 伤 ${dmg}${rps > 1 ? ' 克制↑' : (rps < 1 ? ' 被克↓' : '')}（剩${Math.max(0, target.soldiers)}）`);
          if (target.soldiers <= 0) { target.alive = false; target.soldiers = 0; log.push(`  ☠ ${target.g.name} 败退`); }
        }

        // 追击战法：普攻后追加打击（受沉默/缴械限制）
        if (!u.disarmed && u.ctrl !== 'silence') {
          for (const sk of u.skills) {
            if (sk.type !== '追击') continue;
            if ((u.skillCd[sk.id] || 0) > 0) continue;
            const rate = SKILLS.fireRate(sk, u);
            if (Math.random() * 100 < rate) {
              SKILLS.cast(sk, u, allies, foes, env, log);
              u.skillCd[sk.id] = (sk.cd || 0) + 1;
            } else {
              log.push(`  · ${u.g.name}【${sk.name}】追击未发动(${rate}%)`);
            }
          }
        }

        // 主动战法
        if (u.ctrl !== 'silence') {
          for (const sk of u.skills) {
            if (sk.type !== '主动') continue;
            if ((u.skillCd[sk.id] || 0) > 0) continue;
            const rate = SKILLS.fireRate(sk, u);
            if (Math.random() * 100 < rate) {
              SKILLS.cast(sk, u, allies, foes, env, log);
              u.skillCd[sk.id] = (sk.cd || 0) + 1;
            } else {
              log.push(`  · ${u.g.name}【${sk.name}】未发动(${rate}%)`);
            }
          }
        }

        // 回合末：持续伤 + 控制倒计时 + 冷却递减
        SKILLS.tick(u, log);
        for (const k in u.skillCd) if (u.skillCd[k] > 0) u.skillCd[k]--;
      }
      if (ctx.floodActive) {
        defender.forEach(u => { if (u.alive) { const d = Math.round(300 * env.flood); u.soldiers -= d; if (u.soldiers <= 0) { u.alive = false; u.soldiers = 0; log.push(`  🌊 ${u.g.name} 被水淹败退`); } } });
      }
      squadMoraleContagion(allUnits());
      allUnits().forEach(u => { if (u.alive) u.morale = clamp(u.morale - (u.soldiers / u.max < 0.5 ? 5 : 0) + env.morale * 0.1 + (u.regenMorale || 0) * 4, 20, 100); });
    }
    const attWin = defender.every(u => !u.alive);
    const defWin = attacker.every(u => !u.alive);
    let result = attWin ? '攻方胜' : defWin ? '守方胜' : '超时（按剩余兵力判）';
    if (!attWin && !defWin) {
      const aLeft = attacker.reduce((s, u) => s + u.soldiers, 0);
      const dLeft = defender.reduce((s, u) => s + u.soldiers, 0);
      result = aLeft >= dLeft ? '攻方胜(兵力占优)' : '守方胜(兵力占优)';
    }
    return { result, round, log,
      attackers: attacker.map(u => ({ name: u.g.name, soldiers: u.soldiers, alive: u.alive, skills: u.skills.map(s => s.name) })),
      defenders: defender.map(u => ({ name: u.g.name, soldiers: u.soldiers, alive: u.alive, skills: u.skills.map(s => s.name) })) };
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
    SUIT, STYLE_RPS, COMBAT_CFG, FORTIFIED, suitCoef, troopRPS,
    environmentModifiers, chokePenalty, waterAttack, emptyFort, ambushDetect,
    makeUnit, miaoSuan, styleCoef, simulateCombat,
    squadMoraleContagion, floodDuration, startFlood, tickFlood, chooseFormation
  };
});
