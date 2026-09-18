#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

_TS="$(date +%s)-$((RANDOM % 9999))"

# Capture caller-supplied overrides before config.env.sh can clobber them.
# Callers pass EMAIL and ORG_NAME via env-prefix: EMAIL=x ORG_NAME=y ./script.sh
_CALLER_EMAIL="${EMAIL:-}"
_CALLER_ORG="${ORG_NAME:-}"

CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

# Caller-supplied values win; otherwise always generate a unique value.
export EMAIL="${_CALLER_EMAIL:-signup-user-${_TS}@example.com}"
export ORG_NAME="${_CALLER_ORG:-Test Org ${_TS}}"
export PASSWORD="${PASSWORD:-${DEFAULT_PASSWORD:-Password123!@#}}"

echo "==> [auth-session] POST /api/v1/auth/sign-up -> Register New User and Organization"
curl -s -X POST "${AUTH_URL}/api/v1/auth/sign-up" \
  -H "Content-Type: application/json" \
  -H "x-request-id: ${X_REQUEST_ID}" \
  -H "x-correlation-id: ${X_CORRELATION_ID}" \
  -H "x-tenant-id: ${X_TENANT_ID}" \
  -H "traceparent: ${TRACEPARENT}" \
  -H "tracestate: ${TRACESTATE}" \
  -H "X-Forwarded-For: ${X_FORWARDED_FOR}" \
  -H "User-Agent: ${USER_AGENT}" \
  -H "X-CSRF-Token: ${X_CSRF_TOKEN}" \
  -d "{
    \"email\": \"${EMAIL}\",
    \"password\": \"${PASSWORD}\",
    \"name\": \"${NAME}\",
    \"organization_name\": \"${ORG_NAME}\",
    \"role\": \"${ROLE}\"
  }" | jq . || true
