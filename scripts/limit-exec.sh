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
exec "$@"
