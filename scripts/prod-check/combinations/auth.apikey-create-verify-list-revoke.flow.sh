#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

export X_FORWARDED_FOR="198.51.$((RANDOM % 200 + 10)).$((RANDOM % 200 + 10))"
FLOW_TS="$(date +%s)-$((RANDOM % 1000))"
FLOW_EMAIL="apikey-user-${FLOW_TS}@example.com"
FLOW_ORG_NAME="ApiKey Org ${FLOW_TS}"

echo "=== STEP 1: REGISTER USER & ORGANIZATION ==="
SIGNUP_RES=$(EMAIL="${FLOW_EMAIL}" ORG_NAME="${FLOW_ORG_NAME}" PASSWORD="${DEFAULT_PASSWORD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-up.register-new-user-and-organization.sh")
echo "${SIGNUP_RES}"

EXTRACTED_TOKEN=$(echo "${SIGNUP_RES}" | sed -n '/^{/,$p' | jq -r '.data.token // .data.session.token // empty' || true)
EXTRACTED_ORG_ID=$(echo "${SIGNUP_RES}" | sed -n '/^{/,$p' | jq -r '.data.user.org_id // .data.session.org_id // empty' || true)

if [ -n "${EXTRACTED_TOKEN}" ] && [ "${EXTRACTED_TOKEN}" != "null" ]; then
  export TOKEN="${EXTRACTED_TOKEN}"
fi
if [ -n "${EXTRACTED_ORG_ID}" ] && [ "${EXTRACTED_ORG_ID}" != "null" ]; then
  export ORG_ID="${EXTRACTED_ORG_ID}"
  export TARGET_ORG_ID="${EXTRACTED_ORG_ID}"
fi

echo "=== STEP 2: SIGN IN USER ==="
SIGNIN_RES=$(EMAIL="${FLOW_EMAIL}" PASSWORD="${DEFAULT_PASSWORD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-in.authenticate-user-and-issue-jwt-session.sh")
echo "${SIGNIN_RES}"

EXTRACTED_SIGNIN_TOKEN=$(echo "${SIGNIN_RES}" | sed -n '/^{/,$p' | jq -r '.data.token // .data.session.token // empty' || true)
if [ -n "${EXTRACTED_SIGNIN_TOKEN}" ] && [ "${EXTRACTED_SIGNIN_TOKEN}" != "null" ]; then
  export TOKEN="${EXTRACTED_SIGNIN_TOKEN}"
fi

echo "=== STEP 3: GENERATE 3-TIER SCOPED API KEY ==="
CREATE_KEY_RES=$(KEY_NAME="Flow Test Ingestion Key" KEY_TYPE="general" "${SCRIPT_DIR}/../api-keys/auth.post.create-api-key.generate-3-tier-scoped-api-key.sh")
echo "${CREATE_KEY_RES}"

RAW_KEY=$(echo "${CREATE_KEY_RES}" | sed -n '/^{/,$p' | jq -r '.data.rawKey // .data.raw_key // .data.key // empty' || true)
KEY_ID=$(echo "${CREATE_KEY_RES}" | sed -n '/^{/,$p' | jq -r '.data.keyRecord.key_id // .data.key_id // .data.id // empty' || true)

if [ -n "${RAW_KEY}" ] && [ "${RAW_KEY}" != "null" ]; then
  export API_KEY="${RAW_KEY}"
fi
if [ -n "${KEY_ID}" ] && [ "${KEY_ID}" != "null" ]; then
  export KEY_ID="${KEY_ID}"
  export TARGET_KEY_ID="${KEY_ID}"
fi

echo "=== STEP 4: LIST ORGANIZATION API KEYS ==="
"${SCRIPT_DIR}/../api-keys/auth.get.list-api-keys.list-organization-api-keys.sh"

echo "=== STEP 5: VERIFY API KEY ENTITLEMENT ==="
REQUIRED_PERMISSION="traces:read" "${SCRIPT_DIR}/../api-keys/auth.post.verify-api-key.verify-api-key-and-check-permission-entitlement.sh"

echo "=== STEP 6: REVOKE API KEY BY ID ==="
"${SCRIPT_DIR}/../api-keys/auth.post.revoke-api-key.revoke-api-key-by-id.sh"
