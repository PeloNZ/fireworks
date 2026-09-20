#!/bin/bash
# TaskCompleted hook: blocks task completion once per task when code or build
# config changed since the last check, and asks the model to run the doc-sync
# subagent before completing. A broken environment (no jq, no git repo,
# unwritable state dir) must never block work, so every failure path exits 0.
set -u

INPUT=$(cat)

command -v jq >/dev/null 2>&1 || exit 0
command -v git >/dev/null 2>&1 || exit 0

TASK_ID=$(echo "$INPUT" | jq -r '.task_id // empty')
TASK_SUBJECT=$(echo "$INPUT" | jq -r '.task_subject // "this task"')

[ -n "$TASK_ID" ] || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

STATE_DIR="$PROJECT_DIR/.claude/state/doc-sync"
STAMP="$STATE_DIR/$TASK_ID"
LAST_HEAD_FILE="$STATE_DIR/last-head"

# Loop guard: one block per task. Once doc-sync has been asked for on this
# task, let it complete freely on retry.
if [ -e "$STAMP" ]; then
  exit 0
fi

WATCH_PATHS="src package.json package-lock.json tsconfig.json eslint.config.js knip.json index.html public"

UNCOMMITTED=$(git status --porcelain -- $WATCH_PATHS 2>/dev/null)

COMMITTED=""
if [ -f "$LAST_HEAD_FILE" ]; then
  LAST_HEAD=$(cat "$LAST_HEAD_FILE" 2>/dev/null)
  if [ -n "$LAST_HEAD" ] && git cat-file -e "${LAST_HEAD}^{commit}" 2>/dev/null; then
    COMMITTED=$(git diff --name-only "$LAST_HEAD..HEAD" -- $WATCH_PATHS 2>/dev/null)
  fi
  # A dangling last-head (rebase/amend/reset) is treated as absent: skip the
  # committed-diff check rather than fail the hook.
fi

CURRENT_HEAD=$(git rev-parse HEAD 2>/dev/null)

if [ -z "$UNCOMMITTED" ] && [ -z "$COMMITTED" ]; then
  # Nothing doc-relevant changed. Establish a baseline on first run so a
  # future check has something to diff from.
  if [ ! -f "$LAST_HEAD_FILE" ] && [ -n "$CURRENT_HEAD" ]; then
    mkdir -p "$STATE_DIR" 2>/dev/null && echo "$CURRENT_HEAD" > "$LAST_HEAD_FILE" 2>/dev/null
  fi
  exit 0
fi

mkdir -p "$STATE_DIR" 2>/dev/null || exit 0
touch "$STAMP" 2>/dev/null
[ -n "$CURRENT_HEAD" ] && echo "$CURRENT_HEAD" > "$LAST_HEAD_FILE" 2>/dev/null

CHANGED_PATHS=$(printf '%s\n%s\n' "$UNCOMMITTED" "$COMMITTED" | awk '{print $NF}' | sort -u | grep -v '^$' | tr '\n' ' ')

echo "Documentation check required before completing \"$TASK_SUBJECT\". Code or build config changed: $CHANGED_PATHS. Run the doc-sync subagent (Agent tool, subagent_type: doc-sync) against those changes, apply its edits, then mark this task complete again. This check runs once per task." >&2

exit 2
