/* ============================================================
 *  economy.js —— 资源经济（UMD）
 *  粮/木/铁/石/币 五种资源：领地/城池产出、征兵/战法升级/城建消耗。
 *  纯数据模型，不涉及 UI；Demo 负责把数值呈现为资源条与按钮。
 * ============================================================ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    global.RULES_ECON = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const TYPES = ['粮', '木', '铁', '石', '币', '玉'];
  const RES_META = {
    粮: { key: '粮', color: '#e0c060', icon: '🌾' },
    木: { key: '木', color: '#7fae6b', icon: '🪵' },
    铁: { key: '铁', color: '#9aa0a6', icon: '⚒' },
    石: { key: '石', color: '#b0a890', icon: '🪨' },
    币: { key: '币', color: '#d8b84a', icon: '🪙' },
    玉: { key: '玉', color: '#7fd6ff', icon: '💎' }
  };
  function starting() { return { 粮: 2000, 木: 800, 铁: 600, 石: 600, 币: 300, 玉: 0 }; }
  // 每时节产出：粮随季节与领地数；城池额外产木铁石；币随占领增长；M2 土地等级加权 + 资源州产玉
  function perTurn(ownedLand, cities, seasonGrainMul, landLevelSum, resourceLand) {
    seasonGrainMul = seasonGrainMul || 1;
    // 平衡锚点：landMul(L)=L/4，使平均 4 级地 ≈ 旧 1 格权重，整体产出量级持平旧值
    const eff = (landLevelSum != null) ? landLevelSum / 4 : ownedLand;
    return {
      粮: Math.round(eff * 8 * seasonGrainMul),
      木: Math.round(cities * 20),
      铁: Math.round(cities * 14),
      石: Math.round(cities * 14),
      币: Math.round(eff * 1),
      玉: (resourceLand > 0) ? Math.round(resourceLand * 1) : 0
    };
  }
  function recruitCost(soldiers) { return { 粮: Math.round(soldiers * 0.4), 币: Math.round(soldiers * 0.05) }; }
  function upgradeSkillCost(level) { return { 币: 100 + level * 80, 铁: 50 + level * 30 }; }
  function cityCost() { return { 木: 400, 铁: 300, 石: 300, 币: 200 }; }
  return { TYPES, RES_META, starting, perTurn, recruitCost, upgradeSkillCost, cityCost };
});
