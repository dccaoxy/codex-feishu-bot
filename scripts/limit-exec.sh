#!/bin/sh
# Per-process limit only; never changes system-wide launchctl settings.
set -eu
record=$1
shift
ulimit -S -n 4096
actual=$(ulimit -S -n)
[ "$actual" = 4096 ] || { echo 'File descriptor limit was not applied' >&2; exit 1; }
umask 077
printf '%s\n' "$actual" > "$record"
# PID survives exec; lstart prevents accepting a stale record after PID reuse.
started=$(LC_ALL=C /bin/ps -p $$ -o lstart= | /usr/bin/sed 's/^ *//;s/ *$//')
hard=$(ulimit -H -n)
case "$hard" in unlimited) hard_json=null ;; *) hard_json=$hard ;; esac
printf '{"pid":%s,"start":"%s","soft":%s,"hard":%s}\n' "$$" "$started" "$actual" "$hard_json" > "$record.json.tmp"
mv "$record.json.tmp" "$record.json"
exec "$@"
