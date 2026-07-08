/* ============================================================
 *  scenario.js —— 多剧本（UMD，M3 里程碑）
 *  剧本定义为纯数据：初始诸侯、玩家起点、胜负条件、脚本事件。
 * ============================================================ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    global.RULES_SCN = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const SCENARIOS = [
    { id: 'melee', name: '群雄逐鹿', desc: '群雄并起，凭实力逐鹿中原。',
      playerHome: [8, 50], neutralMul: 1, victory: { type: 'land', n: 60 },
      lords: [
        { id: 'ai_cao', name: '曹操·魏', home: [72, 6], personality: '霸权', color: '#d24b4b', strength: 1500, gen: ['cao1', 'guan1', 'zhao1'] },
        { id: 'ai_liu', name: '刘备·蜀', home: [10, 10], personality: '外交', color: '#4bb0d2', strength: 1400, gen: ['liu1', 'zhang1', 'huang1'] },
        { id: 'ai_sun', name: '孙权·吴', home: [40, 46], personality: '稳健', color: '#5fbf6a', strength: 1450, gen: ['sun1', 'zhou1', 'lu1'] },
        { id: 'ai_dong', name: '董卓', home: [16, 50], personality: '侵略', color: '#c79a3d', strength: 1600, gen: ['lv1', 'sima1', 'zhang1'] }
      ], events: [] },
    { id: 'yellowturban', name: '黄巾之乱', desc: '黄巾势大、义军遍地，剿灭黄巾。',
      playerHome: [40, 50], neutralMul: 1.8, victory: { type: 'land', n: 50 },
      lords: [
        { id: 'ai_cao', name: '曹操·魏', home: [66, 8], personality: '霸权', color: '#d24b4b', strength: 1500, gen: ['cao1', 'guan1', 'zhao1'] },
        { id: 'ai_liu', name: '刘备·蜀', home: [14, 10], personality: '外交', color: '#4bb0d2', strength: 1400, gen: ['liu1', 'zhang1', 'huang1'] },
        { id: 'ai_sun', name: '孙权·吴', home: [66, 46], personality: '稳健', color: '#5fbf6a', strength: 1450, gen: ['sun1', 'zhou1', 'lu1'] }
      ], events: [] },
    { id: 'dongzhuo', name: '讨董卓', desc: '董卓窃权、众怒难犯；第 4 时辰各路自发讨董。',
      playerHome: [40, 50], neutralMul: 1.2, victory: { type: 'defeatLord', lordId: 'ai_dong', land: 55 },
      lords: [
        { id: 'ai_cao', name: '曹操·魏', home: [66, 8], personality: '霸权', color: '#d24b4b', strength: 1500, gen: ['cao1', 'guan1', 'zhao1'] },
        { id: 'ai_liu', name: '刘备·蜀', home: [14, 10], personality: '外交', color: '#4bb0d2', strength: 1400, gen: ['liu1', 'zhang1', 'huang1'] },
        { id: 'ai_sun', name: '孙权·吴', home: [66, 46], personality: '稳健', color: '#5fbf6a', strength: 1450, gen: ['sun1', 'zhou1', 'lu1'] },
        { id: 'ai_dong', name: '董卓', home: [40, 44], personality: '侵略', color: '#c79a3d', strength: 1850, gen: ['lv1', 'sima1', 'zhang1'] }
      ], events: [{ at: 4, type: 'rivalAll', target: 'ai_dong', msg: '董卓乱政！各路诸侯自发讨董，董卓成众矢之的' }] }
  ];
  function getScenario(id) { return SCENARIOS.find(s => s.id === id) || SCENARIOS[0]; }
  function eventsDueAt(scn, time) { return (scn.events || []).filter(e => time >= e.at); }

  return { SCENARIOS, getScenario, eventsDueAt };
});
