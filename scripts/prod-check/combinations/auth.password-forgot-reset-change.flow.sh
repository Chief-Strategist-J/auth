#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

export X_FORWARDED_FOR="198.51.$((RANDOM % 200 + 10)).$((RANDOM % 200 + 10))"
FLOW_EMAIL="pwd-user-$(date +%s)-$((RANDOM % 1000))@example.com"
INITIAL_PWD="${PASSWORD}"
RESET_PWD="${NEW_PASSWORD}"
FINAL_PWD="FinalPassword123!@#"

echo "=== STEP 1: REGISTER USER FOR PASSWORD FLOW ==="
SIGNUP_RES=$(EMAIL="${FLOW_EMAIL}" PASSWORD="${INITIAL_PWD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-up.register-new-user-and-organization.sh")
echo "${SIGNUP_RES}"

echo "=== STEP 2: REQUEST FORGOT PASSWORD RESET TOKEN ==="
FORGOT_RES=$(EMAIL="${FLOW_EMAIL}" "${SCRIPT_DIR}/../password/auth.post.forgot-password.request-password-reset-email-token.sh")
echo "${FORGOT_RES}"

EXTRACTED_RESET_TOKEN=$(echo "${FORGOT_RES}" | sed -n '/^{/,$p' | jq -r '.data.resetToken // .data.token // .data.reset_token // empty' || true)
if [ -n "${EXTRACTED_RESET_TOKEN}" ] && [ "${EXTRACTED_RESET_TOKEN}" != "null" ]; then
  export RESET_TOKEN="${EXTRACTED_RESET_TOKEN}"
fi

echo "=== STEP 3: RESET PASSWORD USING RESET TOKEN ==="
NEW_PASSWORD="${RESET_PWD}" "${SCRIPT_DIR}/../password/auth.post.reset-password.reset-user-password-using-reset-token.sh"

echo "=== STEP 4: SIGN IN WITH NEW RESET PASSWORD ==="
SIGNIN_RES=$(EMAIL="${FLOW_EMAIL}" PASSWORD="${RESET_PWD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-in.authenticate-user-and-issue-jwt-session.sh")
echo "${SIGNIN_RES}"

EXTRACTED_TOKEN=$(echo "${SIGNIN_RES}" | sed -n '/^{/,$p' | jq -r '.data.token // .data.session.token // empty' || true)
if [ -n "${EXTRACTED_TOKEN}" ] && [ "${EXTRACTED_TOKEN}" != "null" ]; then
  export TOKEN="${EXTRACTED_TOKEN}"
fi

echo "=== STEP 5: CHANGE PASSWORD FOR AUTHENTICATED USER ==="
CURRENT_PASSWORD="${RESET_PWD}" NEW_PASSWORD="${FINAL_PWD}" "${SCRIPT_DIR}/../password/auth.post.change-password.change-password-for-authenticated-user.sh"
