#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

FLOW_EMAIL="audit-user-$(date +%s)@example.com"

echo "=== STEP 1: REGISTER & SIGN IN USER TO GENERATE AUDIT EVENTS ==="
"${SCRIPT_DIR}/../auth-session/auth.post.sign-up.register-new-user-and-organization.sh" > /dev/null || true

SIGNIN_RES=$(EMAIL="${FLOW_EMAIL}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-in.authenticate-user-and-issue-jwt-session.sh")
echo "${SIGNIN_RES}"

EXTRACTED_TOKEN=$(echo "${SIGNIN_RES}" | sed -n '/^{/,$p' | jq -r '.data.token // .data.session.token // empty' || true)
if [ -n "${EXTRACTED_TOKEN}" ] && [ "${EXTRACTED_TOKEN}" != "null" ]; then
  export TOKEN="${EXTRACTED_TOKEN}"
fi

echo "=== STEP 2: LIST ALL SYSTEM PERMISSION DEFINITIONS & SCOPES ==="
"${SCRIPT_DIR}/../governance-audit/auth.get.list-permissions.list-all-system-permission-definitions.sh"

echo "=== STEP 3: FETCH SECURITY AUDIT LOGS WITH EVENT TYPE FILTER ==="
AUDIT_EVENT_TYPE="USER_SIGNIN" "${SCRIPT_DIR}/../governance-audit/auth.get.fetch-audit-logs.fetch-security-audit-logs-with-filters.sh"
