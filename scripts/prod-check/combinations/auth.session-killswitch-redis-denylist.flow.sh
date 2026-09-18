#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

export X_FORWARDED_FOR="198.51.$((RANDOM % 200 + 10)).$((RANDOM % 200 + 10))"
FLOW_TS="$(date +%s)-$((RANDOM % 1000))"
FLOW_EMAIL="killswitch-user-${FLOW_TS}@example.com"
FLOW_ORG_NAME="Killswitch Org ${FLOW_TS}"
FLOW_PASSWORD="${DEFAULT_PASSWORD}"

echo "========================================================================="
echo "==> ADR 0004: REDIS SESSION DENYLIST KILL SWITCH SMOKE FLOW"
echo "========================================================================="

echo "=== STEP 1: REGISTER NEW USER & ORGANIZATION ==="
SIGNUP_RES=$(EMAIL="${FLOW_EMAIL}" ORG_NAME="${FLOW_ORG_NAME}" PASSWORD="${FLOW_PASSWORD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-up.register-new-user-and-organization.sh")
echo "${SIGNUP_RES}"

echo "=== STEP 2: AUTHENTICATE USER & ISSUE JWT ==="
SIGNIN_RES=$(EMAIL="${FLOW_EMAIL}" PASSWORD="${FLOW_PASSWORD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-in.authenticate-user-and-issue-jwt-session.sh")
echo "${SIGNIN_RES}"

EXTRACTED_SIGNIN_TOKEN=$(echo "${SIGNIN_RES}" | sed -n '/^{/,$p' | jq -r '.data.token // .data.session.token // empty' || true)
if [ -z "${EXTRACTED_SIGNIN_TOKEN}" ] || [ "${EXTRACTED_SIGNIN_TOKEN}" = "null" ]; then
  echo "[-] ERROR: Failed to extract session token from sign-in response"
  exit 1
fi
export TOKEN="${EXTRACTED_SIGNIN_TOKEN}"

echo "=== STEP 3: VERIFY ACTIVE SESSION TOKEN (EXPECT: 200 OK) ==="
VERIFY_ACTIVE_RES=$("${SCRIPT_DIR}/../auth-session/auth.get.verify-session.validate-jwt-token-and-return-user-context.sh")
echo "${VERIFY_ACTIVE_RES}"

ACTIVE_SUB=$(echo "${VERIFY_ACTIVE_RES}" | sed -n '/^{/,$p' | jq -r '.data.payload.sub // .data.sub // empty' || true)
if [ -z "${ACTIVE_SUB}" ] || [ "${ACTIVE_SUB}" = "null" ]; then
  echo "[-] ERROR: Active session verification failed"
  exit 1
fi
echo "[+] Active session verified successfully for user: ${ACTIVE_SUB}"

echo "=== STEP 4: TRIGGER KILL SWITCH VIA SIGN-OUT (ADR 0004 O(1) DENYLIST WRITE) ==="
SIGNOUT_RES=$("${SCRIPT_DIR}/../auth-session/auth.post.sign-out.invalidate-jwt-session-token-via-redis-denylist.sh")
echo "${SIGNOUT_RES}"

echo "=== STEP 5: VERIFY REVOKED SESSION TOKEN IS REJECTED (EXPECT: ERROR / INVALIDATED) ==="
REVOKED_VERIFY_RES=$("${SCRIPT_DIR}/../auth-session/auth.get.verify-session.validate-jwt-token-and-return-user-context.sh")
echo "${REVOKED_VERIFY_RES}"

IS_ERROR=$(echo "${REVOKED_VERIFY_RES}" | sed -n '/^{/,$p' | jq -r '.error // .message // empty' || true)
if echo "${REVOKED_VERIFY_RES}" | grep -q -i -E "invalidated|unauthorized|invalid token|error"; then
  echo "[+] SUCCESS: ADR 0004 Kill Switch verified! Token was successfully rejected following revocation."
else
  echo "[-] WARNING: Revoked token was not rejected as expected!"
fi
