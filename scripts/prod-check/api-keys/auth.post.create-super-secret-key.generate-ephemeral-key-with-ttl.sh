#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/../config.env.sh"
if [ -f "${CONFIG_PATH}" ]; then
  source "${CONFIG_PATH}"
fi

NOW_MS=$(date +%s%3N)
TTL_DAYS="${TTL_DAYS:-14}"
SUPER_SECRET_EXPIRES_AT_MS=$(( NOW_MS + TTL_DAYS * 86400000 ))

echo "==> [api-keys] POST /api/v1/auth/api-keys -> Generate Ephemeral Super Secret Key with Mandatory TTL"
curl -s -X POST "${AUTH_URL}/api/v1/auth/api-keys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "x-request-id: ${X_REQUEST_ID}" \
  -H "x-correlation-id: ${X_CORRELATION_ID}" \
  -H "x-tenant-id: ${X_TENANT_ID}" \
  -H "traceparent: ${TRACEPARENT}" \
  -H "tracestate: ${TRACESTATE}" \
  -H "X-Forwarded-For: ${X_FORWARDED_FOR}" \
  -H "User-Agent: ${USER_AGENT}" \
  -H "X-CSRF-Token: ${X_CSRF_TOKEN}" \
  -d "{
    \"org_id\": \"${TARGET_ORG_ID}\",
    \"name\": \"${KEY_NAME:-Ephemeral Super Secret Key}\",
    \"key_type\": \"super_secret\",
    \"permissions\": [\"admin:all\", \"traces:write\", \"metrics:write\"],
    \"expires_at_ms\": ${SUPER_SECRET_EXPIRES_AT_MS}
  }" | jq . || true
