#!/bin/zsh
set -eu
cd -- "$(dirname -- "$0")"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
npm run service:uninstall
echo
read -r '?自动启动已停用。按回车关闭…'
