/* ============================================================
 *  diplomacy.js —— 外交关系模型（UMD）
 *  纯逻辑，单机 AI 用。relation: neutral / ally / rival / vassal。
 *  依赖：util(clamp)。
 * ============================================================ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./util.js'));
  } else {
    global.RULES_DIPLO = factory(global.RULES_UTIL);
  }
})(typeof self !== 'undefined' ? self : this, function (UTIL) {
  const clamp = UTIL.clamp;

  function createDiplomacy(lordIds) {
    const m = {};
    lordIds.forEach(a => { m[a] = {}; lordIds.forEach(b => { if (a !== b) m[a][b] = 'neutral'; }); });
    return m;
  }
  function getRelation(dip, a, b) { return (dip[a] && dip[a][b]) || 'neutral'; }
  function setRelation(dip, a, b, rel) { if (dip[a]) dip[a][b] = rel; if (dip[b]) dip[b][a] = rel; }
  function isAlly(dip, a, b) { return getRelation(dip, a, b) === 'ally'; }
  function isRival(dip, a, b) { return getRelation(dip, a, b) === 'rival'; }
  function isVassal(dip, a, b) { return getRelation(dip, a, b) === 'vassal'; }
  function canAttack(dip, me, target) { return !isAlly(dip, me, target) && !isVassal(dip, me, target) && !isVassal(dip, target, me); }
  function diploScoreAdj(dip, me, target) {
    if (isAlly(dip, me, target) || isVassal(dip, me, target) || isVassal(dip, target, me)) return -1e9;
    if (isRival(dip, me, target)) return 5;
    return 0;
  }

  // 附庸：a 臣服于 b（单向依赖，双方均不可互攻）
  function setVassal(dip, a, b) { setRelation(dip, a, b, 'vassal'); }
  // 议和接受度：受信誉影响——信誉越高越易议和
  function peaceAcceptChance(dip, me, target, reputation) {
    if (isAlly(dip, me, target) || isVassal(dip, me, target) || isVassal(dip, target, me)) return 1;
    return clamp(0.2 + (reputation - 50) / 100, 0.05, 0.9);
  }
  // 剧本事件应用（纯关系变更，返回战报文案）；buffLord/spawnArmy 数值效果由 Demo 侧补充
  function applyScenarioEvent(dip, ev) {
    if (ev.type === 'rivalAll') {
      Object.keys(dip).forEach(a => { if (a === ev.target) return;
        Object.keys(dip[a]).forEach(b => { if (b === ev.target) setRelation(dip, a, b, 'rival'); }); });
      if (ev.player !== false) setRelation(dip, 'player', ev.target, 'rival');
      return ev.msg || '众矢之的';
    }
    if (ev.type === 'allyAll') {
      const ids = Object.keys(dip).filter(a => a !== ev.target);
      ids.forEach(a => { ids.forEach(b => { if (a !== b) setRelation(dip, a, b, 'ally'); }); setRelation(dip, a, ev.target, 'rival'); });
      return ev.msg || '结成讨贼同盟';
    }
    return ev.msg || '';
  }

  return {
    createDiplomacy, getRelation, setRelation, isAlly, isRival, isVassal, canAttack, diploScoreAdj,
    setVassal, peaceAcceptChance, applyScenarioEvent
  };
});
