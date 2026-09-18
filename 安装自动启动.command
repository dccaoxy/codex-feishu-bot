#!/bin/zsh
set -eu
cd -- "$(dirname -- "$0")"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
npm run service:install
echo
read -r '?自动启动已配置。按回车关闭…'
