/* ============================================================
 *  build-bundle.js —— 生成单文件 UMD 包（引擎移植用）
 *  把 src/ 下 5 个 UMD 模块 + 聚合入口拼成 dist/rules.bundle.js：
 *    - 强制「全局挂载」分支（去掉 Node require 分支），使本文件作为
 *      普通脚本在任意 JS 环境（浏览器 / Godot / Cocos / Unity jslib）可运行；
 *    - footer 的 `this` 改为 globalThis，保证 Node require 时也挂载到全局 RULES_*；
 *    - 末尾追加 Node 导出 shim：module.exports = RULES。
 *  本文件由脚本生成，请勿手改；改完 src/ 后重跑本脚本即可。
 * ============================================================ */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const files = ['util.js', 'data.js', 'combat.js', 'diplomacy.js', 'scenario.js', 'rules.js'];

// 匹配 UMD 的 `if (module...) { module.exports=... } else { global.X = factory(...) }`
// 捕获 else 分支里的 `global.X = factory(...)` 整行，去掉 module 分支。
const re = /  if \(typeof module !== 'undefined' && module\.exports\) \{[\s\S]*?\} else \{\n(\s*global\.[A-Z_]+ = factory\([\s\S]*?\);)\n\s*\}/g;

let out = '/* 自动生成的单文件 UMD 包（引擎移植用）。由 tools/build-bundle.js 从 src/ 模块拼接，请勿手改。 */\n';
out += '/* 用法：浏览器 <script src="rules.bundle.js"> 后取 window.RULES；\n';
out += '       引擎(Godot JS Bridge / Cocos ts / Unity jslib) 执行本文件后取全局 RULES；\n';
out += '       Node: const R = require("./rules.bundle.js") 取 module.exports。 */\n\n';

for (const f of files) {
  let src = fs.readFileSync(path.join(SRC, f), 'utf8');
  src = src.replace(re, '\n$1\n');                 // 强制全局挂载分支
  src = src.replace(/\? self : this/g, '? self : globalThis'); // Node 下挂载到 globalThis
  out += '/* ===== ' + f + ' ===== */\n' + src + '\n';
}

// Node 导出 shim
out += "\nif (typeof module !== 'undefined' && module.exports) { module.exports = (typeof self !== 'undefined' ? self : globalThis).RULES; }\n";

const distDir = path.join(__dirname, '..', 'dist');
fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, 'rules.bundle.js'), out, 'utf8');
console.log('wrote ' + path.join(distDir, 'rules.bundle.js') + '  (' + files.length + ' modules)');
