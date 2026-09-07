#!/bin/bash
# 打包运行必需文件到 dist/：发布/离线包选 dist 目录。
# 不含开发预览用的 js/shim.js、build.sh、仓库元数据。
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist
mkdir -p dist/css dist/js

cp plugin.json index.html preload.js icon.svg logo.png dist/
cp css/tokens.css css/app.css dist/css/
cp js/engine.js js/store.js js/ui.js js/app.js dist/js/

find dist -name '.DS_Store' -delete

echo "dist/ 已生成："
find dist -type f | sort
