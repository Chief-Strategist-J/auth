#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

echo "========================================================================"
echo "          STARTING FULL END-TO-END AUTH SERVICE SYSTEM SMOKE TEST       "
echo "========================================================================"

echo ""
echo "------------------------------------------------------------------------"
echo " [PHASE 1] System Health Checks"
echo "------------------------------------------------------------------------"
"${SCRIPT_DIR}/../system-health/auth.get.root-check.verify-service-alive-and-healthy.sh"
"${SCRIPT_DIR}/../system-health/auth.get.health-check.verify-system-health-status.sh"
"${SCRIPT_DIR}/../system-health/auth.get.health-check-v1.verify-v1-auth-subsystem-health.sh"

echo ""
echo "------------------------------------------------------------------------"
echo " [PHASE 2] User Authentication & Session Lifecycle Flow"
echo "------------------------------------------------------------------------"
"${SCRIPT_DIR}/auth.user-signup-signin-verify-signout.flow.sh"

echo ""
echo "------------------------------------------------------------------------"
echo " [PHASE 3] Organization Management & Context Switch Lifecycle Flow"
echo "------------------------------------------------------------------------"
"${SCRIPT_DIR}/auth.organization-create-switch-update-delete.flow.sh"

echo ""
echo "------------------------------------------------------------------------"
echo " [PHASE 4] User Management & RBAC Permissions Flow"
echo "------------------------------------------------------------------------"
"${SCRIPT_DIR}/auth.user-invite-role-permissions-block-unblock.flow.sh"

echo ""
echo "------------------------------------------------------------------------"
echo " [PHASE 5] 3-Tier API Key Management Lifecycle Flow"
echo "------------------------------------------------------------------------"
"${SCRIPT_DIR}/auth.apikey-create-verify-list-revoke.flow.sh"

echo ""
echo "------------------------------------------------------------------------"
echo " [PHASE 6] Password Recovery & Reset Lifecycle Flow"
echo "------------------------------------------------------------------------"
"${SCRIPT_DIR}/auth.password-forgot-reset-change.flow.sh"

echo ""
echo "------------------------------------------------------------------------"
echo " [PHASE 7] Governance & Security Audit Log Inspection Flow"
echo "------------------------------------------------------------------------"
"${SCRIPT_DIR}/auth.audit-logs-and-permissions-inspection.flow.sh"

echo ""
echo "========================================================================"
echo "       ALL END-TO-END WORKFLOW COMBINATION SMOKE TESTS COMPLETED       "
echo "========================================================================"
