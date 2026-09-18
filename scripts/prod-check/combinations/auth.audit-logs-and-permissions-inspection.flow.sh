#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

export X_FORWARDED_FOR="198.51.$((RANDOM % 200 + 10)).$((RANDOM % 200 + 10))"
FLOW_TS="$(date +%s)-$((RANDOM % 1000))"
FLOW_EMAIL="audit-user-${FLOW_TS}@example.com"
FLOW_ORG_NAME="Audit Org ${FLOW_TS}"

echo "=== STEP 1: REGISTER & SIGN IN USER TO GENERATE AUDIT EVENTS ==="
SIGNUP_RES=$(EMAIL="${FLOW_EMAIL}" ORG_NAME="${FLOW_ORG_NAME}" PASSWORD="${DEFAULT_PASSWORD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-up.register-new-user-and-organization.sh")
echo "${SIGNUP_RES}"

EXTRACTED_TOKEN=$(echo "${SIGNUP_RES}" | sed -n '/^{/,$p' | jq -r '.data.token // .data.session.token // empty' || true)
if [ -n "${EXTRACTED_TOKEN}" ] && [ "${EXTRACTED_TOKEN}" != "null" ]; then
  export TOKEN="${EXTRACTED_TOKEN}"
fi

SIGNIN_RES=$(EMAIL="${FLOW_EMAIL}" PASSWORD="${DEFAULT_PASSWORD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-in.authenticate-user-and-issue-jwt-session.sh")
echo "${SIGNIN_RES}"

EXTRACTED_SIGNIN_TOKEN=$(echo "${SIGNIN_RES}" | sed -n '/^{/,$p' | jq -r '.data.token // .data.session.token // empty' || true)
if [ -n "${EXTRACTED_SIGNIN_TOKEN}" ] && [ "${EXTRACTED_SIGNIN_TOKEN}" != "null" ]; then
  export TOKEN="${EXTRACTED_SIGNIN_TOKEN}"
fi

echo "=== STEP 2: LIST ALL SYSTEM PERMISSION DEFINITIONS & SCOPES ==="
"${SCRIPT_DIR}/../governance-audit/auth.get.list-permissions.list-all-system-permission-definitions.sh"

echo "=== STEP 3: FETCH SECURITY AUDIT LOGS WITH EVENT TYPE FILTER ==="
AUDIT_EVENT_TYPE="USER_SIGNIN" "${SCRIPT_DIR}/../governance-audit/auth.get.fetch-audit-logs.fetch-security-audit-logs-with-filters.sh"
