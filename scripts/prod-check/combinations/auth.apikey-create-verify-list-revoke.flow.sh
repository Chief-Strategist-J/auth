#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

FLOW_EMAIL="apikey-user-$(date +%s)@example.com"

echo "=== STEP 1: REGISTER USER & ORGANIZATION ==="
"${SCRIPT_DIR}/../auth-session/auth.post.sign-up.register-new-user-and-organization.sh" > /dev/null || true

echo "=== STEP 2: SIGN IN USER ==="
SIGNIN_RES=$(EMAIL="${FLOW_EMAIL}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-in.authenticate-user-and-issue-jwt-session.sh")
echo "${SIGNIN_RES}"

EXTRACTED_TOKEN=$(echo "${SIGNIN_RES}" | jq -r '.data.token // .data.session.token // empty')
EXTRACTED_ORG_ID=$(echo "${SIGNIN_RES}" | jq -r '.data.user.org_id // .data.session.org_id // empty')

if [ -n "${EXTRACTED_TOKEN}" ] && [ "${EXTRACTED_TOKEN}" != "null" ]; then
  export TOKEN="${EXTRACTED_TOKEN}"
fi
if [ -n "${EXTRACTED_ORG_ID}" ] && [ "${EXTRACTED_ORG_ID}" != "null" ]; then
  export TARGET_ORG_ID="${EXTRACTED_ORG_ID}"
fi

echo "=== STEP 3: GENERATE 3-TIER SCOPED API KEY ==="
CREATE_KEY_RES=$(KEY_NAME="Flow Test Ingestion Key" KEY_TYPE="general" "${SCRIPT_DIR}/../api-keys/auth.post.create-api-key.generate-3-tier-scoped-api-key.sh")
echo "${CREATE_KEY_RES}"

RAW_KEY=$(echo "${CREATE_KEY_RES}" | jq -r '.data.raw_key // .data.key // empty')
KEY_ID=$(echo "${CREATE_KEY_RES}" | jq -r '.data.key_id // .data.id // empty')

if [ -n "${RAW_KEY}" ] && [ "${RAW_KEY}" != "null" ]; then
  export API_KEY="${RAW_KEY}"
fi
if [ -n "${KEY_ID}" ] && [ "${KEY_ID}" != "null" ]; then
  export TARGET_KEY_ID="${KEY_ID}"
fi

echo "=== STEP 4: LIST ORGANIZATION API KEYS ==="
"${SCRIPT_DIR}/../api-keys/auth.get.list-api-keys.list-organization-api-keys.sh"

echo "=== STEP 5: VERIFY API KEY ENTITLEMENT ==="
REQUIRED_PERMISSION="traces:read" "${SCRIPT_DIR}/../api-keys/auth.post.verify-api-key.verify-api-key-and-check-permission-entitlement.sh"

echo "=== STEP 6: REVOKE API KEY BY ID ==="
"${SCRIPT_DIR}/../api-keys/auth.post.revoke-api-key.revoke-api-key-by-id.sh"
