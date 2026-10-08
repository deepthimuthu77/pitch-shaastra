#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/run.py "$@"
fi
printf '%s\n' 'Install Python 3.11 or later, then reopen your terminal.' >&2
exit 1
