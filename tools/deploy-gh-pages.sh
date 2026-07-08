#!/usr/bin/env bash
# ============================================================
#  deploy-gh-pages.sh —— 一键部署到 GitHub Pages
#  前置：先在本机 `gh auth login`（登录你的 GitHub 账号）
#  用法： bash tools/deploy-gh-pages.sh [仓库名]
#  产物： https://<你的用户名>.github.io/<仓库名>/
#  说明：直接把仓库根目录（index.html / src/ / data/）作为静态站点，
#        index.html 用相对路径 fetch data/*.csv，在 https 下正常工作。
# ============================================================
set -e
REPO="${1:-three-kingdoms-slg}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
OWNER="$(gh api user --jq .login)"

echo "→ 仓库 $OWNER/$REPO ..."
gh repo create "$REPO" --public --source=. --remote=origin --push 2>/dev/null || {
  echo "（仓库已存在/已关联，改为推送当前分支）"
  git remote add origin "https://github.com/$OWNER/$REPO.git" 2>/dev/null || true
}
git push -u origin "$BRANCH"

echo "→ 开启 GitHub Pages（分支 $BRANCH 根目录）..."
if gh api -X POST "/repos/$OWNER/$REPO/pages" -f "source[branch]=$BRANCH" -f "source[path]=/" >/dev/null 2>&1; then
  echo "✅ Pages 已开启"
else
  echo "⚠️ 自动开启失败：请到仓库 Settings → Pages 手动选分支 $BRANCH / 根目录（代码已推上，不影响）"
fi

echo ""
echo "稍候 1~2 分钟，手机访问： https://$OWNER.github.io/$REPO/"
echo "之后改完代码： git add -A && git commit -m \"...\" && git push  → 网址自动更新"
