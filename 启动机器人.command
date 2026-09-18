#!/bin/zsh
set -eu
cd -- "$(dirname -- "$0")"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null; then
  echo '未找到 Node.js，请先安装 Node.js 24 或更新版本。'
  read -r '?按回车关闭…'
  exit 1
fi
if [ ! -d node_modules ]; then
  echo '正在安装依赖…'
  npm ci
fi
if ! node src/main.mjs; then
  read -r '?启动失败，请查看上方提示。按回车关闭…'
fi
