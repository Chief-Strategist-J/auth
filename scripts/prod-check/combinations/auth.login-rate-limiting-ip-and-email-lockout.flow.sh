#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

TEST_IP="198.51.100.$((RANDOM % 200 + 10))"
TARGET_EMAIL="ratelimit-target-$(date +%s)-$((RANDOM % 1000))@example.com"
FAKE_PASSWORD="DefinitivelyWrongPassword999!"

echo "========================================================================="
echo "==> RFC 6585: LOGIN RATE LIMITING & LOCKOUT DEFENSE FLOW"
echo "========================================================================="
echo "Target Email: ${TARGET_EMAIL}"
echo "Source IP   : ${TEST_IP}"
echo ""

echo "=== STEP 1: CONSECUTIVE FAILED LOGINS TO TRIGGER LIMITS ==="
for i in {1..6}; do
  echo "--- Request Attempt ${i} ---"
  RES=$(curl -s -X POST "${AUTH_URL}/api/v1/auth/sign-in" \
    -H "Content-Type: application/json" \
    -H "x-request-id: req-limit-${i}-${RANDOM}" \
    -H "X-Forwarded-For: ${TEST_IP}" \
    -H "User-Agent: ${USER_AGENT}" \
    -d "{
      \"email\": \"${TARGET_EMAIL}\",
      \"password\": \"${FAKE_PASSWORD}\",
      \"ip_address\": \"${TEST_IP}\",
      \"user_agent\": \"${USER_AGENT}\"
    }")
  echo "${RES}" | jq . || echo "${RES}"
  
  if echo "${RES}" | grep -q -i -E "Rate limit exceeded|Account locked|Too Many Requests"; then
    echo "[+] SUCCESS: Rate limit or lockout triggered at attempt ${i}!"
    break
  fi
done

echo ""
echo "=== STEP 2: VERIFY SUBSEQUENT REQUEST REJECTION ==="
LOCKED_RES=$(curl -s -X POST "${AUTH_URL}/api/v1/auth/sign-in" \
  -H "Content-Type: application/json" \
  -H "x-request-id: req-locked-check-${RANDOM}" \
  -H "X-Forwarded-For: ${TEST_IP}" \
  -H "User-Agent: ${USER_AGENT}" \
  -d "{
    \"email\": \"${TARGET_EMAIL}\",
    \"password\": \"${FAKE_PASSWORD}\",
    \"ip_address\": \"${TEST_IP}\",
    \"user_agent\": \"${USER_AGENT}\"
  }")
echo "${LOCKED_RES}" | jq . || echo "${LOCKED_RES}"
