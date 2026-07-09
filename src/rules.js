/* ============================================================
 *  rules.js —— 三国 SLG 单机版 · 聚合入口（UMD）
 *  纯逻辑层（无 DOM 依赖）的「总装」：聚合各模块并统一以
 *  window.RULES（浏览器）/ module.exports（Node）暴露。
 *  子模块：util / data / combat / diplomacy / scenario / skills / economy。
 *  数据表用 getter 暴露，因此 data.reload() 热加载后本对象即时生效。
 *
 *  引擎移植接口（Godot/Cocos 等）：外部引擎只需
 *    1) require/import 本文件拿到 RULES；
 *    2) 调用纯函数（simulateCombat / makeUnit / createDiplomacy …）；
 *    3) 用 loadCSVFromDir/loadConfigFromServer 注入配表；
 *    4) 渲染与输入由引擎自管，逻辑层不触碰 DOM。
 * ============================================================ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('./util.js'),
      require('./data.js'),
      require('./combat.js'),
      require('./diplomacy.js'),
      require('./scenario.js'),
      require('./skills.js'),
      require('./economy.js')
    );
  } else {
    global.RULES = factory(
      global.RULES_UTIL,
      global.RULES_DATA,
      global.RULES_COMBAT,
      global.RULES_DIPLO,
      global.RULES_SCN,
      global.RULES_SKILLS,
      global.RULES_ECON
    );
  }
})(typeof self !== 'undefined' ? self : this, function (UTIL, DATA, COMBAT, DIPLO, SCN, SKILLS, ECON) {

  // 聚合所有模块 API（函数引用稳定，可直接展开）
  // 注意：ECON 同时以「命名空间」暴露（R.ECON.*），供 Demo 调用；
  //       其余模块函数则平铺到 RULES 上（R.makeUnit 等）便于引擎移植。
  //       数据表走 getter（R.SKILLS/R.TROOPS/...），与模块命名空间不冲突。
  const RULES = Object.assign({}, UTIL, COMBAT, DIPLO, SCN, SKILLS, ECON, {
    parseCSV: DATA.parseCSV,
    reload: DATA.reload,
    loadConfigFromServer: DATA.loadConfigFromServer,
    loadCSVFromDir: DATA.loadCSVFromDir,
    ECON: ECON
  });

  // 数据表用 getter 暴露：热加载(reload)重赋值 state.* 后，此处自动读到新表
  Object.defineProperties(RULES, {
    TERRAIN:    { get() { return DATA.state.TERRAIN; },    enumerable: true, configurable: true },
    WEATHER:    { get() { return DATA.state.WEATHER; },    enumerable: true, configurable: true },
    SEASON:     { get() { return DATA.state.SEASON; },     enumerable: true, configurable: true },
    FORMATIONS: { get() { return DATA.state.FORMATIONS; }, enumerable: true, configurable: true },
    GENERALS:   { get() { return DATA.state.GENERALS; },   enumerable: true, configurable: true },
    SKILLS:     { get() { return DATA.state.SKILLS; },     enumerable: true, configurable: true },
    TROOPS:     { get() { return DATA.state.TROOPS; },     enumerable: true, configurable: true },
    FACTIONS:   { get() { return DATA.state.FACTIONS; },   enumerable: true, configurable: true },
    BONDS:      { get() { return DATA.state.BONDS; },      enumerable: true, configurable: true },
    TREASURES:  { get() { return DATA.state.TREASURES; },  enumerable: true, configurable: true }
  });

  if (typeof window !== 'undefined') window.RULES = RULES;
  return RULES;
});
