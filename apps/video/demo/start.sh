#!/bin/bash
# Launches the desktop dev app against a throwaway workspace so recordings
# never show the real account, journal, memory or AI spend.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
root="${KANSOKU_DEMO_ROOT:-$here/workspace}"

mkdir -p "$root/home"

# Dev builds find skills and migrations under the workspace root; the demo root
# is empty, so stage one merged skills dir the way the packaged app does.
skills="$root/.skills"
rm -rf "$skills"
mkdir -p "$skills"
for dir in "$repo/packages/core/skills"/* "$repo/.claude/skills"/*; do
  name="$(basename "$dir")"
  [ -e "$skills/$name" ] || ln -s "$dir" "$skills/$name"
done
export TRADE_SKILLS_DIR="$skills"
export TRADE_MIGRATIONS_DIR="$repo/packages/core/drizzle"

export PATH="$here/bin:$PATH"
export LONGBRIDGE_CLI_PATH="$here/bin/longbridge"
export TRADE_PROJECT_ROOT="$root"
export KANSOKU_HOME="$root/home"
export KANSOKU_LICENSE_BYPASS=1
export ELECTRON_REMOTE_DEBUGGING_PORT="${ELECTRON_REMOTE_DEBUGGING_PORT:-9333}"

cd "$repo"
pnpm overlay:sync
exec pnpm dev:desktop
