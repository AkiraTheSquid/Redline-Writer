#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# redline_supabase_cutover — repoint the hosted app at a NEW
# Supabase project, verify it, and redeploy.
#
# Usage:
#   scripts/redline_supabase_cutover.sh <project-ref>
#
# The two keys are read interactively (hidden), or from the
# environment if you prefer to pipe them in:
#   REDLINE_ANON_KEY=...  REDLINE_SERVICE_KEY=...
#
# Order matters: the VITE_* vars are baked into the frontend at
# BUILD time, so the env swap is worthless without the redeploy
# this script fires at the end.
#
# Half-applied config is the thing to fear here — two variables
# pointing at the new project and two at the old one is a live
# site with broken auth. So: snapshot the current values first,
# write with `--force` (upsert, never delete-then-add, so a
# failed write leaves the old value standing), and roll back
# every variable on any failure.
# ============================================================

REPO_DIR="/home/stellar-thread/Applications/Redline-Writer-Local"
DEPLOY_DIR="/home/stellar-thread/Applications/Redline-Writer-Deployed"
SITE="https://redline-writer.vercel.app"

# One copy of the hook, in scripts/deploy_redline_writer.sh. Override with
# REDLINE_VERCEL_HOOK to keep it out of the shell history / this file.
VERCEL_HOOK="${REDLINE_VERCEL_HOOK:-$(sed -n 's/^VERCEL_HOOK="\(.*\)"$/\1/p' "$REPO_DIR/scripts/deploy_redline_writer.sh" | head -1)}"

VARS=(SUPABASE_URL SUPABASE_SERVICE_KEY VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY)

# Every network call is bounded, so the advertised timeouts are real.
CURL=(curl --connect-timeout 10 --max-time 30)

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[cutover]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
fail()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# --- Args --------------------------------------------------

REF="${1:-}"
[ -n "$REF" ] || fail "usage: $0 <supabase-project-ref>"
echo "$REF" | grep -qE '^[a-z]{20}$' \
  || fail "'$REF' does not look like a Supabase project ref (20 lowercase letters)"

URL="https://${REF}.supabase.co"
[ -n "$VERCEL_HOOK" ] || fail "could not determine the Vercel deploy hook; set REDLINE_VERCEL_HOOK"
[ -d "$DEPLOY_DIR/.vercel" ] || fail "$DEPLOY_DIR is not linked to a Vercel project"

ANON_KEY="${REDLINE_ANON_KEY:-}"
SERVICE_KEY="${REDLINE_SERVICE_KEY:-}"
if [ -z "$ANON_KEY" ];    then read -rsp "anon key (Project Settings > API): " ANON_KEY; echo; fi
if [ -z "$SERVICE_KEY" ]; then read -rsp "service_role key: " SERVICE_KEY; echo; fi
[ -n "$ANON_KEY" ] && [ -n "$SERVICE_KEY" ] || fail "both keys are required"
[ "$ANON_KEY" != "$SERVICE_KEY" ] || fail "anon and service keys are identical — you pasted the same one twice"

# --- Pre-flight: is the project actually alive? -------------

info "Resolving $REF.supabase.co ..."
getent hosts "${REF}.supabase.co" >/dev/null \
  || fail "DNS does not resolve. The project is paused or the ref is wrong — a paused Supabase project loses its DNS record."

info "Checking the schema is in place (sessions table) ..."
probe=$(mktemp); trap 'rm -f "$probe"' EXIT
code=$("${CURL[@]}" -s -o "$probe" -w '%{http_code}' \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  "$URL/rest/v1/sessions?select=id&limit=1")
if [ "$code" != "200" ]; then
  cat "$probe" >&2; echo >&2
  fail "GET /rest/v1/sessions returned $code — run supabase/bootstrap.sql in the SQL editor first (or check the service_role key)."
fi

info "Checking auth is reachable with the anon key ..."
code=$("${CURL[@]}" -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON_KEY" "$URL/auth/v1/settings")
[ "$code" = "200" ] || fail "GET /auth/v1/settings returned $code — check the anon key."

info "Project looks healthy."

# --- Snapshot the current production config -----------------

cd "$DEPLOY_DIR"
SNAPSHOT="$(mktemp)"
ROLLBACK_OK=1
trap 'rm -f "$probe" "$SNAPSHOT"' EXIT

info "Snapshotting the current production environment ..."
if vercel env pull "$SNAPSHOT" --environment=production --yes >/dev/null 2>&1; then
  for v in "${VARS[@]}"; do
    grep -qE "^${v}=..*" "$SNAPSHOT" || { ROLLBACK_OK=0; break; }
  done
else
  ROLLBACK_OK=0
fi

snapshot_value() {  # strips the surrounding quotes vercel writes
  sed -n "s/^$1=//p" "$SNAPSHOT" | head -1 | sed 's/^"//; s/"$//'
}

if [ "$ROLLBACK_OK" = 1 ]; then
  info "  snapshot captured — automatic rollback is available."
else
  warn "  could not read every current value (Vercel marks production vars sensitive)."
  warn "  Automatic rollback is NOT available. Note the OLD project ref from the"
  warn "  dashboard before continuing, so you can restore by hand if this fails."
  read -rp "  continue anyway? [y/N] " ans
  [ "$ans" = "y" ] || [ "$ans" = "Y" ] || fail "aborted"
fi

# --- Swap the four production env vars ----------------------

APPLIED=()

rollback() {
  [ "${#APPLIED[@]}" -gt 0 ] || return 0
  if [ "$ROLLBACK_OK" != 1 ]; then
    warn "Cannot roll back automatically. These variables were CHANGED to the new"
    warn "project and must be restored by hand: ${APPLIED[*]}"
    return 0
  fi
  warn "Rolling back ${#APPLIED[@]} variable(s) ..."
  for v in "${APPLIED[@]}"; do
    if printf '%s' "$(snapshot_value "$v")" \
        | vercel env add "$v" production --force --yes >/dev/null 2>&1; then
      warn "  restored $v"
    else
      warn "  FAILED to restore $v — fix this in the dashboard before the next deploy"
    fi
  done
}

set_env() {
  local name="$1" value="$2"
  # --force upserts. No delete step, so a failed write leaves the old value in
  # place rather than removing the variable entirely.
  if printf '%s' "$value" | vercel env add "$name" production --force --yes >/dev/null; then
    APPLIED+=("$name")
    info "  set $name"
  else
    rollback
    fail "failed to set $name"
  fi
}

info "Updating Vercel production environment ..."
set_env SUPABASE_URL            "$URL"
set_env SUPABASE_SERVICE_KEY    "$SERVICE_KEY"
set_env VITE_SUPABASE_URL       "$URL"
set_env VITE_SUPABASE_ANON_KEY  "$ANON_KEY"

# --- Redeploy (mandatory: VITE_* are build-time) ------------

# Snapshot the served bundle BEFORE the hook fires, so the wait loop below has
# something real to compare against.
before=$("${CURL[@]}" -fsS "$SITE" 2>/dev/null | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 || echo "")

info "Triggering a rebuild ..."
"${CURL[@]}" -fsS -X POST "$VERCEL_HOOK" >/dev/null || { rollback; fail "deploy hook failed"; }

info "Waiting for the new build to go live (up to 5 min) ..."
bundle=""
for _ in $(seq 1 60); do
  sleep 5
  now=$("${CURL[@]}" -fsS "$SITE" 2>/dev/null | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 || echo "")
  if [ -n "$now" ] && [ "$now" != "$before" ]; then
    bundle="$now"
    info "New bundle live: $bundle"
    break
  fi
done

if [ -z "$bundle" ]; then
  warn "The served bundle never changed. The build may have failed, or it is still"
  warn "running. Env vars are already pointing at $REF, so the NEXT successful"
  warn "build picks them up — check the Vercel dashboard rather than re-running."
  fail "cutover not confirmed live"
fi

# --- Post-deploy verification -------------------------------

info "Verifying the deployed frontend points at $REF ..."
"${CURL[@]}" -fsS "$SITE/$bundle" | grep -q "$REF" \
  || fail "the new project ref is NOT in the freshly built bundle — the build did not pick up VITE_SUPABASE_URL."
info "  frontend bundle contains the new project ref."

# NOTE: hitting /sessions with NO token proves nothing — api/_auth.js returns
# null on a missing header before it makes any network call, so a 401 comes back
# even when Supabase is entirely unreachable. Sending a junk token forces the
# fetch to /auth/v1/user, which is the thing we actually want to test.
info "Verifying the API can reach Supabase ..."
code=$("${CURL[@]}" -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer probe.invalid.token" "$SITE/sessions")
case "$code" in
  401) info "  /sessions -> 401 with a junk token: the function reached Supabase and Supabase rejected the token. Correct." ;;
  500) fail "  /sessions -> 500. The function still cannot reach Supabase — check SUPABASE_URL / SUPABASE_SERVICE_KEY in Vercel." ;;
  200) fail "  /sessions -> 200 with a JUNK token. Auth is not being enforced — stop and investigate." ;;
  *)   warn "  /sessions -> $code (unexpected, worth a look)." ;;
esac

cat <<EOF

Done. Remaining manual step, in the new project's dashboard:

  Authentication > URL Configuration
    Site URL:            $SITE
    Redirect URLs:       $SITE/**
  Authentication > Sign In / Providers > Email
    Confirm email:       OFF

Then sign up at $SITE and run one session end to end.
EOF
