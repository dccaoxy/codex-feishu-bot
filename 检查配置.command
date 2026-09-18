#!/bin/zsh
set -eu
cd -- "$(dirname -- "$0")"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
node src/main.mjs --doctor || true
read -r '?按回车关闭…'
