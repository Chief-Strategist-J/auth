#!/usr/bin/env bash

export AUTH_URL="${AUTH_URL:-http://localhost:3000}"

export TOKEN="${TOKEN:-YOUR_JWT_SESSION_TOKEN_HERE}"
export RESET_TOKEN="${RESET_TOKEN:-sample-reset-token}"
export API_KEY="${API_KEY:-YOUR_API_KEY_STRING_HERE}"

export X_REQUEST_ID="${X_REQUEST_ID:-req-$(date +%s)-12345}"
export X_CORRELATION_ID="${X_CORRELATION_ID:-corr-$(date +%s)-67890}"
export X_TENANT_ID="${X_TENANT_ID:-tenant-acme-corp}"
export TRACEPARENT="${TRACEPARENT:-00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01}"
export TRACESTATE="${TRACESTATE:-rojo=1,congo=2}"

export X_FORWARDED_FOR="${X_FORWARDED_FOR:-127.0.0.1}"
export USER_AGENT="${USER_AGENT:-Mozilla/5.0 (prod-check-curl-runner)}"
export X_CSRF_TOKEN="${X_CSRF_TOKEN:-csrf-token-sample-98765}"

export DEFAULT_EMAIL="${DEFAULT_EMAIL:-admin@example.com}"
export DEFAULT_PASSWORD="${DEFAULT_PASSWORD:-Password123!@#}"
export DEFAULT_NEW_PASSWORD="${DEFAULT_NEW_PASSWORD:-NewPassword123!@#}"
export DEFAULT_USER_NAME="${DEFAULT_USER_NAME:-Admin User}"
export DEFAULT_ORG_NAME="${DEFAULT_ORG_NAME:-Acme Corp}"
export DEFAULT_ORG_SLUG="${DEFAULT_ORG_SLUG:-acme-corp}"
export DEFAULT_ROLE="${DEFAULT_ROLE:-admin}"

export TARGET_ORG_ID="${TARGET_ORG_ID:-target-org-id}"
export TARGET_USER_ID="${TARGET_USER_ID:-target-user-id}"
export TARGET_KEY_ID="${TARGET_KEY_ID:-target-key-id}"

export AUDIT_EVENT_TYPE="${AUDIT_EVENT_TYPE:-USER_SIGNIN}"
export AUDIT_FROM="${AUDIT_FROM:-2026-01-01T00:00:00Z}"
export AUDIT_TO="${AUDIT_TO:-2026-12-31T23:59:59Z}"
