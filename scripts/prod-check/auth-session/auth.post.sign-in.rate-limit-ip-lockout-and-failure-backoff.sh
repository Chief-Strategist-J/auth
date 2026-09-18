#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

TARGET_IP="${X_FORWARDED_FOR:-198.51.100.$((RANDOM % 200 + 10))}"
TARGET_EMAIL="${EMAIL:-rate-limit-test-$((RANDOM % 10000))@example.com}"
INVALID_PASSWORD="DefinitivelyWrongPassword999!"

echo "==> [auth-session] POST /api/v1/auth/sign-in -> Enforce Login Rate Limiting and Failure Backoff (RFC 6585)"
echo "    Target Email : ${TARGET_EMAIL}"
echo "    Client IP    : ${TARGET_IP}"
echo ""

echo "--- Sending failed login attempt 1 ---"
curl -s -X POST "${AUTH_URL}/api/v1/auth/sign-in" \
  -H "Content-Type: application/json" \
  -H "x-request-id: ${X_REQUEST_ID}" \
  -H "x-correlation-id: ${X_CORRELATION_ID}" \
  -H "x-tenant-id: ${X_TENANT_ID}" \
  -H "traceparent: ${TRACEPARENT}" \
  -H "tracestate: ${TRACESTATE}" \
  -H "X-Forwarded-For: ${TARGET_IP}" \
  -H "User-Agent: ${USER_AGENT}" \
  -H "X-CSRF-Token: ${X_CSRF_TOKEN}" \
  -d "{
    \"email\": \"${TARGET_EMAIL}\",
    \"password\": \"${INVALID_PASSWORD}\",
    \"ip_address\": \"${TARGET_IP}\",
    \"user_agent\": \"${USER_AGENT}\"
  }" | jq . || true

echo ""
echo "--- Exceeding failed login threshold to trigger rate limit / lockout ---"
for i in {2..6}; do
  echo "--- Attempt ${i} ---"
  curl -s -X POST "${AUTH_URL}/api/v1/auth/sign-in" \
    -H "Content-Type: application/json" \
    -H "x-request-id: req-${i}-${RANDOM}" \
    -H "X-Forwarded-For: ${TARGET_IP}" \
    -H "User-Agent: ${USER_AGENT}" \
    -d "{
      \"email\": \"${TARGET_EMAIL}\",
      \"password\": \"${INVALID_PASSWORD}\",
      \"ip_address\": \"${TARGET_IP}\",
      \"user_agent\": \"${USER_AGENT}\"
    }" | jq . || true
done
