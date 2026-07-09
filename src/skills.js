/* ============================================================
 *  skills.js —— 武将战法引擎（UMD）
 *  依赖：data(state)。
 *  战法四型：指挥(开场加成) / 被动(常驻) / 主动(行动时发动) / 追击(普攻后)。
 *  本模块只负责「按战法定义结算效果」，单位状态字段由 combat.makeUnit 提供。
 * ============================================================ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'));
  } else {
    global.RULES_SKILLS = factory(global.RULES_DATA);
  }
})(typeof self !== 'undefined' ? self : this, function (DATA) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 取武将的全部战法对象
  function skillList(g) {
    return (g.skills || []).map(id => DATA.state.SKILLS[id]).filter(Boolean);
  }

  // 发动率：基础 + 属性差 + 阵营羁绊加成
  function fireRate(skill, caster) {
    const stat = skill.school === '谋略' ? (caster.intellect != null ? caster.intellect : caster.g.intellect) : (caster.force != null ? caster.force : caster.g.force);
    const base = skill.rate + (stat - 80) * 0.22 + (caster.bondRate || 0) * 100;
    return clamp(Math.round(base), 25, 92);
  }

  // 选目标
  function pickTargets(skill, caster, allies, foes) {
    const alive = foes.filter(f => f.alive);
    const aliveA = allies.filter(a => a.alive);
    switch (skill.target) {
      case 'ally_all': return aliveA;
      case 'self':     return [caster];
      case 'foe_all':  return alive;
      case 'foe_top':  return alive.length ? [alive.reduce((m, x) => x.soldiers > m.soldiers ? x : m, alive[0])] : [];
      case 'foe_front':return alive.length ? [alive[0]] : [];
      default:         return alive;
    }
  }

  // 开场：指挥战法加成 + 被动常驻标记
  function commandSetup(unit, army, log) {
    for (const sk of skillList(unit.g)) {
      if (sk.type === '指挥') {
        army.forEach(u => {
          if (!u.alive) return;
          if (sk.buffAtkPct) u.atkMul  *= (1 + sk.buffAtkPct);
          if (sk.buffDefPct) u.defMul  *= (1 + sk.buffDefPct);
          if (sk.buffMorale) u.morale   = clamp(u.morale + sk.buffMorale * 20, 20, 100);
        });
        log.push(`📜 ${unit.g.name} 施【${sk.name}】· 全军 ${sk.desc}`);
      } else if (sk.type === '被动') {
        if (sk.immuneCtrl) unit.immuneCtrl = true;
        if (sk.id === 'kongcheng') {
          // 空城：不常驻加防御，改为标记；战斗中残血时由 emptyFort 临时放大（见 combat.simulateCombat）
          unit.emptyFort = true;
          log.push(`🛡 ${unit.g.name} 常驻【${sk.name}】· 残血时触发（空城计）`);
        } else {
          if (sk.buffDefPct) unit.defMul *= (1 + sk.buffDefPct);
          if (sk.debuffAtkPct) army.forEach(en => en.alive && (en.foeHitDown = (en.foeHitDown || 0) + sk.debuffAtkPct));
        }
        if (sk.healPct) unit.regenPct = (unit.regenPct || 0) + sk.healPct;
        if (sk.buffMorale) unit.regenMorale = (unit.regenMorale || 0) + sk.buffMorale;
        if (sk.id !== 'kongcheng') log.push(`🛡 ${unit.g.name} 常驻【${sk.name}】· ${sk.desc}`);
      }
    }
  }

  function applyControl(target, sk, log) {
    if (!sk.ctrl || !target.alive) return;
    if (target.immuneCtrl && !target.immuneCtrlUsed) {
      target.immuneCtrlUsed = true;
      log.push(`  🔰 ${target.g.name} 免疫控制（${sk.name}）`);
      return;
    }
    const name = { stun:'震慑不能动', confuse:'混乱', shock:'震慑', disarm:'缴械', silence:'沉默' }[sk.ctrl] || sk.ctrl;
    target.ctrl = sk.ctrl;
    target.ctrlTurns = Math.max(target.ctrlTurns || 0, sk.duration || 1);
    log.push(`  🔒 ${target.g.name} 中【${sk.name}】→ ${name}`);
  }

  // 主动/追击战法结算
  function cast(skill, caster, allies, foes, env, log) {
    const targets = pickTargets(skill, caster, allies, foes);
    if (!targets.length && skill.target.indexOf('foe') === 0) return;
    if (skill.dmgPct) {
      targets.forEach(t => {
        if (!t.alive) return;
        const mit = (t.defStat * 1) / (t.defStat + 150);
        const dmg = Math.max(1, Math.round(caster.primary * skill.dmgPct * caster.atkMul * (1 - mit * 0.6)));
        t.soldiers -= dmg; if (t.soldiers <= 0) { t.soldiers = 0; t.alive = false; }
        log.push(`  💥 ${caster.g.name}【${skill.name}】→ ${t.g.name} ${skill.dmgSchool}伤害 ${dmg}` + (t.alive ? '' : '（败退）'));
      });
    }
    if (skill.healPct) {
      targets.forEach(t => { if (!t.alive) return; const h = Math.round((t.max - t.soldiers) * skill.healPct); t.soldiers = Math.min(t.max, t.soldiers + h); if (h > 0) log.push(`  💚 ${caster.g.name}【${skill.name}】疗${t.g.name} +${h}`); });
    }
    if (skill.buffAtkPct || skill.buffDefPct) {
      targets.forEach(t => { if (!t.alive) return; if (skill.buffAtkPct) t.atkMul *= (1 + skill.buffAtkPct); if (skill.buffDefPct) t.defMul *= (1 + skill.buffDefPct); });
      log.push(`  ✨ ${caster.g.name}【${skill.name}】增益全军`);
    }
    if (skill.debuffAtkPct || skill.debuffDefPct) {
      targets.forEach(t => { if (!t.alive) return; if (skill.debuffAtkPct) t.atkMul *= (1 + skill.debuffAtkPct); if (skill.debuffDefPct) t.defMul *= (1 + skill.debuffDefPct); });
      log.push(`  📉 ${caster.g.name}【${skill.name}】削敌`);
    }
    if (skill.ctrl) targets.forEach(t => applyControl(t, skill, log));
    if (skill.dotPct) targets.forEach(t => { if (t.alive) t.dots.push({ pct: skill.dotPct, school: skill.dotSchool, turns: skill.duration || 2 }); });
    if (skill.stealPct) targets.forEach(t => { if (!t.alive) return; t.atkMul *= (1 - skill.stealPct); caster.atkMul *= (1 + skill.stealPct); });
    if (skill.reflect) { caster.reflectNext = true; log.push(`  🪞 ${caster.g.name}【${skill.name}】反弹就绪`); }
  }

  // 每回合持续：灼烧/中毒、控制倒计时
  function tick(unit, log) {
    if (!unit.alive) return;
    unit.dots = (unit.dots || []).filter(d => d.turns > 0);
    unit.dots.forEach(d => {
      const dmg = Math.max(1, Math.round(unit.max * d.pct));
      unit.soldiers -= dmg; if (unit.soldiers <= 0) { unit.soldiers = 0; unit.alive = false; }
      log.push(`  🔥 ${unit.g.name} 受【${d.school}】持续伤 ${dmg}` + (unit.alive ? '' : '（败退）'));
      d.turns--;
    });
    unit.dots = unit.dots.filter(d => d.turns > 0);
    if (unit.ctrlTurns > 0) { unit.ctrlTurns--; if (unit.ctrlTurns <= 0) unit.ctrl = ''; }
    if (unit.regenPct) { const h = Math.round((unit.max - unit.soldiers) * unit.regenPct); if (h > 0) { unit.soldiers = Math.min(unit.max, unit.soldiers + h); log.push(`  💚 ${unit.g.name} 伤兵恢复 +${h}`); } }
  }

  return { skillList, fireRate, commandSetup, cast, tick };
});
