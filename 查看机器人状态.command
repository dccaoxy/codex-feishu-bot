#!/bin/zsh
set -u
cd -- "$(dirname -- "$0")"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
npm run service:status
echo
echo '最近运行日志：'
tail -n 20 data/service.log 2>/dev/null || true
echo
echo '最近错误日志：'
tail -n 20 data/service.error.log 2>/dev/null || true
echo
read -r '?按回车关闭…'
