#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

echo "==> [system-health] GET /api/v1/auth/health -> Verify V1 Auth Subsystem Health"
curl -s -X GET "${AUTH_URL}/api/v1/auth/health" \
  -H "Accept: application/json" \
  -H "x-request-id: ${X_REQUEST_ID}" \
  -H "x-correlation-id: ${X_CORRELATION_ID}" \
  -H "x-tenant-id: ${X_TENANT_ID}" \
  -H "traceparent: ${TRACEPARENT}" \
  -H "tracestate: ${TRACESTATE}" \
  -H "X-Forwarded-For: ${X_FORWARDED_FOR}" \
  -H "User-Agent: ${USER_AGENT}" \
  -H "X-CSRF-Token: ${X_CSRF_TOKEN}" | jq . || true
