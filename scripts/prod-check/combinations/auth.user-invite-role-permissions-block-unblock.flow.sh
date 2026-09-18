#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

export X_FORWARDED_FOR="198.51.$((RANDOM % 200 + 10)).$((RANDOM % 200 + 10))"
FLOW_TS="$(date +%s)-$((RANDOM % 1000))"
ADMIN_EMAIL="admin-flow-${FLOW_TS}@example.com"
ADMIN_ORG_NAME="Admin Org ${FLOW_TS}"
MEMBER_EMAIL="member-flow-${FLOW_TS}@example.com"

echo "==> STEP 1: REGISTER ADMIN USER & ORGANIZATION ==="
SIGNUP_RES=$(EMAIL="${ADMIN_EMAIL}" ORG_NAME="${ADMIN_ORG_NAME}" PASSWORD="${DEFAULT_PASSWORD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-up.register-new-user-and-organization.sh")
echo "${SIGNUP_RES}"

EXTRACTED_TOKEN=$(echo "${SIGNUP_RES}" | sed -n '/^{/,$p' | jq -r '.data.token // .data.session.token // empty' || true)
if [ -n "${EXTRACTED_TOKEN}" ] && [ "${EXTRACTED_TOKEN}" != "null" ]; then
  export TOKEN="${EXTRACTED_TOKEN}"
fi

echo "==> STEP 2: SIGN IN ADMIN USER ==="
SIGNIN_RES=$(EMAIL="${ADMIN_EMAIL}" PASSWORD="${DEFAULT_PASSWORD}" "${SCRIPT_DIR}/../auth-session/auth.post.sign-in.authenticate-user-and-issue-jwt-session.sh")
echo "${SIGNIN_RES}"

EXTRACTED_SIGNIN_TOKEN=$(echo "${SIGNIN_RES}" | sed -n '/^{/,$p' | jq -r '.data.token // .data.session.token // empty' || true)
if [ -n "${EXTRACTED_SIGNIN_TOKEN}" ] && [ "${EXTRACTED_SIGNIN_TOKEN}" != "null" ]; then
  export TOKEN="${EXTRACTED_SIGNIN_TOKEN}"
fi

echo "==> STEP 3: LIST ORGANIZATION MEMBERS ==="
"${SCRIPT_DIR}/../users-profile/auth.get.list-users.list-users-in-current-organization.sh"

echo "==> STEP 4: INVITE NEW MEMBER TO ORGANIZATION ==="
INVITE_RES=$(EMAIL="${MEMBER_EMAIL}" NAME="Flow Member User" "${SCRIPT_DIR}/../users-profile/auth.post.invite-user.invite-new-user-to-organization-by-email.sh")
echo "${INVITE_RES}"

EXTRACTED_USER_ID=$(echo "${INVITE_RES}" | sed -n '/^{/,$p' | jq -r '.data.id // .data.user_id // empty' || true)
if [ -n "${EXTRACTED_USER_ID}" ] && [ "${EXTRACTED_USER_ID}" != "null" ]; then
  export USER_ID="${EXTRACTED_USER_ID}"
  export TARGET_USER_ID="${EXTRACTED_USER_ID}"
fi

echo "==> STEP 5: GET MEMBER USER PROFILE BY ID ==="
"${SCRIPT_DIR}/../users-profile/auth.get.get-user-by-id.get-user-profile-by-user-id.sh"

echo "==> STEP 6: GET MEMBER EFFECTIVE PERMISSIONS ==="
"${SCRIPT_DIR}/../users-profile/auth.get.get-user-permissions.get-user-effective-permission-set.sh"

echo "==> STEP 7: UPDATE MEMBER ROLE ==="
NEW_ROLE="member" "${SCRIPT_DIR}/../users-profile/auth.patch.update-user-role.update-user-organization-role.sh"

echo "==> STEP 8: UPDATE MEMBER PERMISSION ENTITLEMENTS ==="
"${SCRIPT_DIR}/../users-profile/auth.patch.update-user-permissions.update-user-permission-entitlements.sh"

echo "==> STEP 9: BLOCK MEMBER ACCESS ==="
"${SCRIPT_DIR}/../users-profile/auth.post.block-user.block-user-access-and-record-block-timestamp.sh"

echo "==> STEP 10: UNBLOCK MEMBER ACCESS ==="
"${SCRIPT_DIR}/../users-profile/auth.delete.unblock-user.unblock-previously-blocked-user.sh"

echo "==> STEP 11: SOFT DELETE MEMBER USER ==="
"${SCRIPT_DIR}/../users-profile/auth.delete.delete-user.soft-delete-user-with-30-day-retention.sh"
