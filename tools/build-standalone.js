/* ============================================================
 *  build-standalone.js —— 生成单文件离线 Demo（零服务器 / 零 fetch）
 *  用途：把 index.html 的 6 个逻辑模块内联、5 张 CSV 嵌成字符串，
 *        启动时 parseCSV + reload 注入内存数据表，再 monkeypatch
 *        R.loadConfigFromServer 走内嵌数据。「配表」按钮离线也能热重载。
 *  产物：dist/index.standalone.html —— 单文件，可直接发到手机浏览器打开
 *        （file:// 或任意静态托管均可，无需电脑/服务器）。
 *
 *  用法：  node tools/build-standalone.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SRC_FILES = ['util.js', 'data.js', 'combat.js', 'diplomacy.js', 'scenario.js', 'rules.js'];
const CSV_FILES = ['terrain.csv', 'weather.csv', 'season.csv', 'formations.csv', 'generals.csv'];

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 1) 把 6 个 src 模块内联（UMD 的浏览器全局挂载分支，直接 <script> 即可）
let inlineScripts = '';
for (const f of SRC_FILES) {
  const code = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
  inlineScripts += `<script>\n/* ===== src/${f} ===== */\n${code}\n</script>\n`;
}

// 2) 把 5 张 CSV 嵌成字符串（JSON 编码，自动处理转义）
const csvObj = {};
for (const f of CSV_FILES) {
  csvObj[f.replace(/\.csv$/, '')] = fs.readFileSync(path.join(ROOT, 'data', f), 'utf8');
}
const csvScript = `<script>\nwindow.__CSV__ = ${JSON.stringify(csvObj, null, 0)};\n</script>\n`;

// 3) 启动引导：注入内嵌 CSV（覆盖 DEFAULTS 旧值，使用调平后的数据），
//    并让「配表」按钮离线也能热重载。必须放在主 Demo <script> 之前。
const bootstrap = `<script>
(function(){
  var CSV = window.__CSV__; var D = window.RULES_DATA;
  function applyEmbedded(){ var c={}; for (var k in CSV) c[k]=D.parseCSV(CSV[k]); D.reload(c); return c; }
  applyEmbedded();
  if (window.RULES) { window.RULES.loadConfigFromServer = function(){ return Promise.resolve(applyEmbedded()); }; }
})();
</script>\n`;

// 4) 替换 index.html 中的 6 个 <script src> 标签
const srcBlock = SRC_FILES.map(f => `<script src="src/${f}"></script>`).join('\n');
if (html.indexOf(srcBlock) < 0) {
  console.error('找不到 src 引入块，index.html 结构可能已变。');
  process.exit(1);
}
const newBlock = inlineScripts + csvScript + bootstrap;
const out = html.replace(srcBlock, newBlock);

// 5) 输出
const outPath = path.join(ROOT, 'dist', 'index.standalone.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out, 'utf8');
const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log('已生成', outPath, `(${kb} KB)`);
console.log('内嵌模块：', SRC_FILES.join(', '));
console.log('内嵌配表：', CSV_FILES.join(', '));
console.log('→ 单文件、零 fetch、零服务器；可直接发到手机浏览器打开（file:// 亦可）。');
