#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# deploy_redline_writer — one-command deploy for Redline Writer
#
# 1. Checks for uncommitted changes on main (auto-commits all)
# 2. Pushes main to origin
# 3. In the deploy worktree, merges main into deploy
# 4. Pushes deploy to origin
# 5. Triggers Vercel deploy hook (builds from deploy branch)
# ============================================================

REPO_DIR="/home/stellar-thread/Applications/Redline-Writer-Local"
DEPLOY_DIR="/home/stellar-thread/Applications/Redline-Writer-Deployed"
VERCEL_URL="https://redline-writer.vercel.app"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
error() { echo -e "${RED}[error]${NC} $*"; }

# --- Pre-flight checks ---

if [ ! -d "$DEPLOY_DIR/.git" ] && [ ! -f "$DEPLOY_DIR/.git" ]; then
  error "Deploy worktree not found at $DEPLOY_DIR"
  echo "  Run: git -C \"$REPO_DIR\" worktree add -b deploy \"$DEPLOY_DIR\""
  exit 1
fi

# --- Step 1: Auto-commit any uncommitted changes on main ---

info "Checking for uncommitted changes on main..."
if ! git -C "$REPO_DIR" diff --quiet || ! git -C "$REPO_DIR" diff --cached --quiet; then
  warn "Uncommitted changes detected — auto-committing all files:"
  git -C "$REPO_DIR" status --short

  git -C "$REPO_DIR" add -A
  if ! git -C "$REPO_DIR" diff --cached --quiet; then
    git -C "$REPO_DIR" commit -m "chore: auto-commit before deploy"
  fi
fi

# --- Step 2: Push main to origin ---

info "Pushing main to origin..."
git -C "$REPO_DIR" push origin main

# --- Step 3: Merge main into deploy worktree ---

info "Checking deploy worktree for uncommitted changes..."
if ! git -C "$DEPLOY_DIR" diff --quiet || ! git -C "$DEPLOY_DIR" diff --cached --quiet; then
  warn "Uncommitted changes detected in deploy worktree — stashing before merge."
  git -C "$DEPLOY_DIR" stash push -u -m "deploy_redline_writer auto-stash $(date '+%Y-%m-%d %H:%M:%S')"
  warn "Deploy changes stashed. To review later: git -C \"$DEPLOY_DIR\" stash list"
fi

info "Merging main into deploy branch..."
git -C "$DEPLOY_DIR" checkout deploy
git -C "$DEPLOY_DIR" merge main --no-edit

# --- Step 4: Push deploy to origin ---

info "Pushing deploy to origin..."
git -C "$DEPLOY_DIR" push origin deploy

# --- Step 5: Trigger Vercel deploy hook (builds from deploy branch) ---

VERCEL_HOOK="https://api.vercel.com/v1/integrations/deploy/prj_isokDOR6pfKkRKuLnTJru45WAa18/uL3d38Cgbp"
info "Triggering Vercel build..."
curl -s -X POST "$VERCEL_HOOK" | python3 -c "import sys,json; d=json.load(sys.stdin); print('  job:', d.get('job',{}).get('id','?'))"

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  Deploy complete!${NC}"
echo -e "${GREEN}  ${VERCEL_URL}${NC}"
echo -e "${GREEN}======================================${NC}"
