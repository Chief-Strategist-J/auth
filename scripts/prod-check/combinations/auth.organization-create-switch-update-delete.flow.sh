#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

export X_FORWARDED_FOR="198.51.$((RANDOM % 200 + 10)).$((RANDOM % 200 + 10))"
FLOW_EMAIL="org-owner-$(date +%s)-$((RANDOM % 1000))@example.com"
FLOW_ORG_NAME="Flow Org $(date +%s)"
FLOW_ORG_SLUG="flow-org-$(date +%s)"

echo "=== STEP 1: REGISTER OWNER USER & PRIMARY ORG ==="
SIGNUP_RES=$(EMAIL="${FLOW_EMAIL}" PASSWORD="${DEFAULT_PASSWORD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-up.register-new-user-and-organization.sh")
echo "${SIGNUP_RES}"

EXTRACTED_TOKEN=$(echo "${SIGNUP_RES}" | sed -n '/^{/,$p' | jq -r '.data.token // .data.session.token // empty' || true)
if [ -n "${EXTRACTED_TOKEN}" ] && [ "${EXTRACTED_TOKEN}" != "null" ]; then
  export TOKEN="${EXTRACTED_TOKEN}"
fi

echo "=== STEP 2: SIGN IN OWNER USER ==="
SIGNIN_RES=$(EMAIL="${FLOW_EMAIL}" PASSWORD="${DEFAULT_PASSWORD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-in.authenticate-user-and-issue-jwt-session.sh")
echo "${SIGNIN_RES}"

EXTRACTED_SIGNIN_TOKEN=$(echo "${SIGNIN_RES}" | sed -n '/^{/,$p' | jq -r '.data.token // .data.session.token // empty' || true)
if [ -n "${EXTRACTED_SIGNIN_TOKEN}" ] && [ "${EXTRACTED_SIGNIN_TOKEN}" != "null" ]; then
  export TOKEN="${EXTRACTED_SIGNIN_TOKEN}"
fi

echo "=== STEP 3: CREATE SECONDARY ORGANIZATION ==="
CREATE_ORG_RES=$(ORG_NAME="${FLOW_ORG_NAME}" ORG_SLUG="${FLOW_ORG_SLUG}" "${SCRIPT_DIR}/../organizations/auth.post.create-organization.create-new-multi-tenant-organization.sh")
echo "${CREATE_ORG_RES}"

EXTRACTED_ORG_ID=$(echo "${CREATE_ORG_RES}" | sed -n '/^{/,$p' | jq -r '.data.id // .data.org_id // empty' || true)
if [ -n "${EXTRACTED_ORG_ID}" ] && [ "${EXTRACTED_ORG_ID}" != "null" ]; then
  export ORG_ID="${EXTRACTED_ORG_ID}"
  export TARGET_ORG_ID="${EXTRACTED_ORG_ID}"
fi

echo "=== STEP 4: GET ORGANIZATION DETAILS ==="
"${SCRIPT_DIR}/../organizations/auth.get.get-organization.get-organization-details-by-id.sh"

echo "=== STEP 5: SWITCH ACTIVE TENANT CONTEXT ==="
SWITCH_RES=$("${SCRIPT_DIR}/../organizations/auth.post.switch-organization.switch-active-tenant-context-and-reissue-token.sh")
echo "${SWITCH_RES}"

NEW_TOKEN=$(echo "${SWITCH_RES}" | sed -n '/^{/,$p' | jq -r '.data.token // empty' || true)
if [ -n "${NEW_TOKEN}" ] && [ "${NEW_TOKEN}" != "null" ]; then
  export TOKEN="${NEW_TOKEN}"
fi

echo "=== STEP 6: UPDATE ORGANIZATION DETAILS ==="
"${SCRIPT_DIR}/../organizations/auth.patch.update-organization.update-organization-name-and-slug.sh"

echo "=== STEP 7: LIST ALL USER ORGANIZATIONS ==="
"${SCRIPT_DIR}/../organizations/auth.get.list-organizations.list-all-organizations-for-authenticated-user.sh"

echo "=== STEP 8: DELETE ORGANIZATION WITH 30-DAY RETENTION ==="
"${SCRIPT_DIR}/../organizations/auth.delete.delete-organization.soft-delete-organization-with-30-day-retention.sh"
