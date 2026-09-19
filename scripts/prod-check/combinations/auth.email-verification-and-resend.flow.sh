#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

export X_FORWARDED_FOR="198.51.$((RANDOM % 200 + 10)).$((RANDOM % 200 + 10))"
FLOW_TS="$(date +%s)-$((RANDOM % 1000))"
FLOW_EMAIL="verify-user-${FLOW_TS}@example.com"
FLOW_ORG_NAME="Verification Org ${FLOW_TS}"

echo "=== STEP 1: REGISTER USER & TRIGGER VERIFICATION DISPATCH ==="
SIGNUP_RES=$(EMAIL="${FLOW_EMAIL}" ORG_NAME="${FLOW_ORG_NAME}" PASSWORD="${DEFAULT_PASSWORD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-up.register-new-user-and-organization.sh")
echo "${SIGNUP_RES}"

echo "=== STEP 2: REQUEST FRESH VERIFICATION TOKEN (RESEND) ==="
RESEND_RES=$(EMAIL="${FLOW_EMAIL}" "${SCRIPT_DIR}/../email-verification/auth.post.resend-verification.request-fresh-verification-token.sh")
echo "${RESEND_RES}"

echo "=== STEP 3: SUBMIT EMAIL VERIFICATION CONFIRMATION ==="
VERIFY_RES=$(VERIFICATION_TOKEN="invalid-or-sample-token" "${SCRIPT_DIR}/../email-verification/auth.post.verify-email.confirm-user-email-address.sh")
echo "${VERIFY_RES}"
