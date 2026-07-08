/* ============================================================
 *  util.js —— 通用工具（UMD：浏览器全局 / Node require 双兼容）
 *  纯函数，无数据依赖，被 combat / diplomacy 等模块复用。
 * ============================================================ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    global.RULES_UTIL = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  return { clamp, pick };
});
