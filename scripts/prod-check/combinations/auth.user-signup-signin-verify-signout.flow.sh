#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

FLOW_EMAIL="flow-user-$(date +%s)@example.com"
FLOW_PASSWORD="${DEFAULT_PASSWORD}"

echo "=== STEP 1: REGISTER NEW USER & ORGANIZATION ==="
SIGNUP_RES=$(EMAIL="${FLOW_EMAIL}" PASSWORD="${FLOW_PASSWORD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-up.register-new-user-and-organization.sh")
echo "${SIGNUP_RES}"

echo "=== STEP 2: AUTHENTICATE USER & ISSUE JWT ==="
SIGNIN_RES=$(EMAIL="${FLOW_EMAIL}" PASSWORD="${FLOW_PASSWORD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-in.authenticate-user-and-issue-jwt-session.sh")
echo "${SIGNIN_RES}"

EXTRACTED_TOKEN=$(echo "${SIGNIN_RES}" | jq -r '.data.token // .data.session.token // empty')

if [ -n "${EXTRACTED_TOKEN}" ] && [ "${EXTRACTED_TOKEN}" != "null" ]; then
  export TOKEN="${EXTRACTED_TOKEN}"
fi

echo "=== STEP 3: VERIFY SESSION TOKEN & CONTEXT ==="
"${SCRIPT_DIR}/../auth-session/auth.get.verify-session.validate-jwt-token-and-return-user-context.sh"

echo "=== STEP 4: SIGN OUT & INVALIDATE SESSION TOKEN ==="
"${SCRIPT_DIR}/../auth-session/auth.post.sign-out.invalidate-jwt-session-token-via-redis-denylist.sh"
