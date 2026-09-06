# 📐 ADR 0008: Master API Catalog, Parameter Contracts & Response Envelopes

- **Status**: Accepted
- **Date**: 2026-09-06
- **Authors**: Core Architecture & Security Engineering Team
- **Deciders**: Platform Architecture Board, SecOps, API Governance
- **Correlating Service**: `@observability/auth` (:3001)

---

## 1. Context & Problem Statement

As `@observability/auth` matured into a unified multi-tenant authentication engine serving the Next.js web application, Traefik API gateway, and downstream microservices, the API surface grew to 34 distinct endpoints across 7 functional pillars. Without an authoritative, exhaustive Architecture Decision Record defining every parameter, schema validation rule, query filter, and standard response envelope, integration risks arise across clients, SDKs, and proxies.

This ADR serves as the definitive reference specification for all 34 active HTTP endpoints in `@observability/auth`, detailing path parameters, headers, query parameters, request bodies, success envelopes, error envelopes, and RBAC requirements.

---

## 2. Standardized Global Envelopes

All endpoints in `@observability/auth` return RFC-compliant JSON adhering to a standardized response envelope. Clients never parse raw un-enveloped arrays or primitives.

### 2.1 Standard Success Envelope (HTTP 200 / 201)

```json
{
  "status": "success",
  "message": "Human-readable description of operation result",
  "data": { ... },
  "error": null
}
```

### 2.2 Standard Error Envelope (HTTP 400 / 401 / 403 / 404 / 409 / 500)

```json
{
  "status": "error",
  "message": "Human-readable error description",
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR | INVALID_CREDENTIALS | TOKEN_EXPIRED | FORBIDDEN | NOT_FOUND | CONFLICT",
    "message": "Detailed technical failure reason",
    "details": [ ... ]
  }
}
```

### 2.3 Global Standard Headers

| Header | Type | Required | Description |
|---|---|---|---|
| `Content-Type` | `string` | For POST/PATCH | Must be `application/json` |
| `Authorization` | `string` | For Protected Routes | `Bearer <JWT_TOKEN>` |
| `X-Forwarded-For` | `string` | Optional | Client IP address captured for audit logging |
| `User-Agent` | `string` | Optional | Client browser/runtime identifier for audit logging |
| `x-request-id` | `string` | Optional | Tracing correlation ID propagated to OpenTelemetry span |
| `x-tenant-id` | `string` | Optional | Active tenant context override |

---

## 3. Master API Catalog (All 34 Endpoints)

---

### 3.1 Pillar 1: Health & System Diagnostics

#### `[1] GET /`
- **Name**: Root Service Check
- **Auth Required**: No (Public)
- **Parameters**: None
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Auth Service API v1 is live",
  "data": {
    "service": "auth-service",
    "version": "1.0.0",
    "status": "healthy"
  },
  "error": null
}
```

#### `[2] GET /health`
- **Name**: Standard Health Check
- **Auth Required**: No (Public)
- **Parameters**: None
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Auth service is healthy",
  "data": { "status": "ok" },
  "error": null
}
```

#### `[3] GET /api/v1/auth/health`
- **Name**: V1 Versioned Health Check
- **Auth Required**: No (Public)
- **Parameters**: None
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Auth service is healthy",
  "data": { "status": "ok" },
  "error": null
}
```

---

### 3.2 Pillar 2: Core Authentication & Sessions

#### `[4] POST /api/v1/auth/sign-up`
- **Name**: User & Organization Registration
- **Auth Required**: No (Public)
- **Request Body**:
```json
{
  "email": "user@company.com",
  "password": "StrongPassword123!",
  "name": "Alex Johnson",
  "organization_name": "Acme Global",
  "role": "admin"
}
```
- **Validation**:
  - `email`: Valid RFC 5322 email string.
  - `password`: Minimum 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special character (`!@#$%^&*`).
  - `name`: String, minimum 2 chars.
  - `organization_name`: String, minimum 2 chars.
- **Success Response (201)**:
```json
{
  "status": "success",
  "message": "User and organization successfully registered",
  "data": {
    "token": "eyJzdWIiOiJ1c3Jf...signature",
    "user": {
      "id": "usr_abc123",
      "email": "user@company.com",
      "name": "Alex Johnson",
      "org_id": "org_xyz789",
      "org_name": "Acme Global",
      "role": "admin",
      "blocked": false,
      "user_permissions": []
    }
  },
  "error": null
}
```

#### `[5] POST /api/v1/auth/sign-in`
- **Name**: User Sign-In
- **Auth Required**: No (Public)
- **Request Body**:
```json
{
  "email": "user@company.com",
  "password": "StrongPassword123!"
}
```
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "User signed in successfully",
  "data": {
    "token": "eyJzdWIiOiJ1c3Jf...signature",
    "user": {
      "id": "usr_abc123",
      "email": "user@company.com",
      "name": "Alex Johnson",
      "org_id": "org_xyz789",
      "org_name": "Acme Global",
      "role": "admin",
      "blocked": false,
      "user_permissions": []
    }
  },
  "error": null
}
```
- **Error Responses**:
  - `401 Unauthorized`: Invalid credentials.
  - `403 Forbidden`: Account blocked.

#### `[6] POST /api/v1/auth/sign-out`
- **Name**: Session Sign-Out & Token Revocation
- **Auth Required**: Yes (`Bearer <token>`)
- **Parameters**: None
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Signed out successfully",
  "data": null,
  "error": null
}
```

#### `[7] GET /api/v1/auth/session`
- **Name**: Verify Session Token
- **Auth Required**: Yes (`Bearer <token>`)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Session token verified",
  "data": {
    "sub": "usr_abc123",
    "email": "user@company.com",
    "org": {
      "org_id": "org_xyz789",
      "org_name": "Acme Global",
      "role": "admin"
    },
    "iat": 1788696000,
    "exp": 1788699600
  },
  "error": null
}
```

---

### 3.3 Pillar 3: Password Lifecycle Management

#### `[8] POST /api/v1/auth/forgot-password`
- **Name**: Forgot Password Token Request
- **Auth Required**: No (Public)
- **Request Body**:
```json
{
  "email": "user@company.com"
}
```
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Password reset request processed",
  "data": {
    "resetToken": "rst_9a8b7c6d5e"
  },
  "error": null
}
```

#### `[9] POST /api/v1/auth/reset-password`
- **Name**: Reset Password with Token
- **Auth Required**: No (Public)
- **Request Body**:
```json
{
  "token": "rst_9a8b7c6d5e",
  "new_password": "NewStrongPassword456!"
}
```
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Password successfully reset",
  "data": {
    "success": true
  },
  "error": null
}
```

#### `[10] POST /api/v1/auth/change-password`
- **Name**: Authenticated Password Change
- **Auth Required**: Yes (`Bearer <token>`)
- **Request Body**:
```json
{
  "current_password": "OldPassword123!",
  "new_password": "NewStrongPassword456!"
}
```
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Password successfully changed",
  "data": {
    "success": true
  },
  "error": null
}
```

---

### 3.4 Pillar 4: Organization & Multi-Tenancy

#### `[11] GET /api/v1/auth/organizations`
- **Name**: List User Organizations
- **Auth Required**: Yes (`Bearer <token>`)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Organizations retrieved",
  "data": [
    {
      "id": "org_primary",
      "name": "Acme Global",
      "slug": "acme-global",
      "role": "owner"
    }
  ],
  "error": null
}
```

#### `[12] POST /api/v1/auth/organizations`
- **Name**: Create New Organization
- **Auth Required**: Yes (`Bearer <token>`)
- **Request Body**:
```json
{
  "name": "Acme Research Labs",
  "slug": "acme-research-labs"
}
```
- **Success Response (201)**:
```json
{
  "status": "success",
  "message": "Organization created successfully",
  "data": {
    "id": "org_sec456",
    "name": "Acme Research Labs",
    "slug": "acme-research-labs"
  },
  "error": null
}
```

#### `[13] GET /api/v1/auth/organizations/:id`
- **Name**: Get Organization by ID
- **Auth Required**: No (Public / Internal)
- **Path Parameters**: `id` (string)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Organization retrieved",
  "data": {
    "id": "org_sec456",
    "name": "Acme Research Labs",
    "slug": "acme-research-labs"
  },
  "error": null
}
```

#### `[14] PATCH /api/v1/auth/organizations/:id`
- **Name**: Update Organization
- **Auth Required**: No (Public / Internal)
- **Path Parameters**: `id` (string)
- **Request Body**:
```json
{
  "name": "Acme Advanced Research"
}
```
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Organization updated",
  "data": {
    "id": "org_sec456",
    "name": "Acme Advanced Research",
    "slug": "acme-research-labs"
  },
  "error": null
}
```

#### `[15] DELETE /api/v1/auth/organizations/:id`
- **Name**: Soft-Delete Organization
- **Auth Required**: No (Public / Internal)
- **Path Parameters**: `id` (string)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Organization soft-deleted with 30-day backup retention",
  "data": {
    "success": true,
    "message": "Organization org_sec456 and all associated entity details soft-deleted with 30-day backup retention."
  },
  "error": null
}
```

#### `[16] POST /api/v1/auth/organizations/:id/switch`
- **Name**: Switch Organization Context
- **Auth Required**: Yes (`Bearer <token>`)
- **Path Parameters**: `id` (string) - Target Organization ID
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Organization context switched",
  "data": {
    "token": "eyJzdWIiOiJ1c3Jf...new_signature",
    "payload": {
      "sub": "usr_abc123",
      "email": "user@company.com",
      "org": {
        "org_id": "org_sec456",
        "org_name": "Acme Advanced Research",
        "role": "admin"
      },
      "exp": 1788700000,
      "iat": 1788696400
    }
  },
  "error": null
}
```

---

### 3.5 Pillar 5: User & Member Management

#### `[17] GET /api/v1/auth/users/me`
- **Name**: Get Current User Profile
- **Auth Required**: Yes (`Bearer <token>`)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "User profile retrieved",
  "data": {
    "id": "usr_abc123",
    "email": "user@company.com",
    "name": "Alex Johnson",
    "org_id": "org_xyz789",
    "org_name": "Acme Global",
    "role": "admin",
    "blocked": false,
    "user_permissions": []
  },
  "error": null
}
```

#### `[18] PATCH /api/v1/auth/users/me`
- **Name**: Update Current User Profile
- **Auth Required**: Yes (`Bearer <token>`)
- **Request Body**:
```json
{
  "name": "Alexander Johnson, Ph.D."
}
```
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "User profile updated",
  "data": {
    "id": "usr_abc123",
    "email": "user@company.com",
    "name": "Alexander Johnson, Ph.D.",
    "org_id": "org_xyz789",
    "org_name": "Acme Global",
    "role": "admin",
    "blocked": false,
    "user_permissions": []
  },
  "error": null
}
```

#### `[19] GET /api/v1/auth/users`
- **Name**: List Organization Members
- **Auth Required**: Yes (`Bearer <token>`)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Members retrieved",
  "data": [
    {
      "id": "usr_abc123",
      "email": "user@company.com",
      "name": "Alexander Johnson, Ph.D.",
      "org_id": "org_xyz789",
      "org_name": "Acme Global",
      "role": "admin",
      "blocked": false,
      "user_permissions": []
    }
  ],
  "error": null
}
```

#### `[20] POST /api/v1/auth/users`
- **Name**: Direct Administrative User Creation
- **Auth Required**: No (Public / Internal Service)
- **Request Body**:
```json
{
  "email": "engineer@company.com",
  "password": "StrongPassword123!",
  "name": "Sarah Miller",
  "org_id": "org_xyz789",
  "role": "member",
  "permissions": ["traces:read", "metrics:read"]
}
```
- **Success Response (201)**:
```json
{
  "status": "success",
  "message": "User created in target organization with specific permissions",
  "data": {
    "id": "usr_eng101",
    "email": "engineer@company.com",
    "password_hash": "argon2id_hash...",
    "name": "Sarah Miller",
    "org_id": "org_xyz789",
    "org_name": "",
    "role": "member",
    "blocked": false,
    "user_permissions": ["traces:read", "metrics:read"]
  },
  "error": null
}
```

#### `[21] POST /api/v1/auth/users/invite`
- **Name**: Invite Member to Organization
- **Auth Required**: Yes (`Bearer <token>`)
- **Request Body**:
```json
{
  "email": "contractor@partner.com",
  "name": "Contractor User",
  "role": "member",
  "permissions": ["traces:read"]
}
```
- **Success Response (201)**:
```json
{
  "status": "success",
  "message": "User invited to organization",
  "data": {
    "id": "usr_inv202",
    "email": "contractor@partner.com",
    "name": "Contractor User",
    "org_id": "org_xyz789",
    "org_name": "Acme Global",
    "role": "member",
    "blocked": false,
    "user_permissions": ["traces:read"]
  },
  "error": null
}
```

#### `[22] GET /api/v1/auth/users/:id`
- **Name**: Get User by ID
- **Auth Required**: No (Public / Internal)
- **Path Parameters**: `id` (string)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "User retrieved",
  "data": {
    "id": "usr_eng101",
    "email": "engineer@company.com",
    "name": "Sarah Miller",
    "org_id": "org_xyz789",
    "role": "member",
    "blocked": false,
    "user_permissions": ["traces:read", "metrics:read"]
  },
  "error": null
}
```

#### `[23] PATCH /api/v1/auth/users/:id/role`
- **Name**: Update Member Role
- **Auth Required**: No (Public / Internal)
- **Path Parameters**: `id` (string)
- **Request Body**:
```json
{
  "role": "admin"
}
```
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "User role updated",
  "data": null,
  "error": null
}
```

#### `[24] GET /api/v1/auth/users/:id/permissions`
- **Name**: Get User Granular Permissions
- **Auth Required**: No (Public / Internal)
- **Path Parameters**: `id` (string)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "User permissions retrieved",
  "data": ["traces:read", "metrics:read"],
  "error": null
}
```

#### `[25] PATCH /api/v1/auth/users/:id/permissions`
- **Name**: Update User Granular Permissions
- **Auth Required**: No (Public / Internal)
- **Path Parameters**: `id` (string)
- **Request Body**:
```json
{
  "permissions": ["traces:read", "metrics:read", "logs:read"]
}
```
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "User permissions updated",
  "data": null,
  "error": null
}
```

#### `[26] POST /api/v1/auth/users/:id/block`
- **Name**: Administratively Block User Account
- **Auth Required**: No (Public / Internal)
- **Path Parameters**: `id` (string)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "User blocked successfully",
  "data": {
    "success": true,
    "message": "User usr_eng101 blocked successfully."
  },
  "error": null
}
```

#### `[27] DELETE /api/v1/auth/users/:id/unblock`
- **Name**: Unblock User Account
- **Auth Required**: No (Public / Internal)
- **Path Parameters**: `id` (string)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "User unblocked successfully",
  "data": {
    "success": true,
    "message": "User usr_eng101 unblocked successfully."
  },
  "error": null
}
```

#### `[28] DELETE /api/v1/auth/users/:id`
- **Name**: Soft-Delete User with 30-Day Retention
- **Auth Required**: No (Public / Internal)
- **Path Parameters**: `id` (string)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "User soft-deleted with 30-day backup retention",
  "data": {
    "success": true,
    "message": "User usr_eng101 soft-deleted with 30-day backup retention."
  },
  "error": null
}
```

---

### 3.6 Pillar 6: API Keys & Permissions

#### `[29] GET /api/v1/auth/permissions`
- **Name**: List System Permissions
- **Auth Required**: No (Public)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "System permissions retrieved",
  "data": {
    "permissions": [
      "traces:read",
      "traces:write",
      "metrics:read",
      "metrics:write",
      "logs:read",
      "logs:write",
      "alerts:read",
      "alerts:write",
      "admin:all"
    ]
  },
  "error": null
}
```

#### `[30] POST /api/v1/auth/api-keys`
- **Name**: Create 3-Tier API Key
- **Auth Required**: Yes (`Bearer <token>`)
- **Request Body**:
```json
{
  "name": "Production Ingestion Pipeline",
  "org_id": "org_xyz789",
  "key_type": "general",
  "permissions": ["traces:write", "metrics:write"]
}
```
- **Validation**:
  - `key_type`: Must be `"general"`, `"testing"`, or `"super_secret"`.
- **Success Response (201)**:
```json
{
  "status": "success",
  "message": "API key successfully created",
  "data": {
    "rawKey": "ak_gen_org_xyz789_8rrtcr6pl641q067z45wm8",
    "keyRecord": {
      "key_id": "key_97v48p7",
      "org_id": "org_xyz789",
      "key_type": "general",
      "key_hash": "adcaf2abd8dec73f809824c363f137bda91138f314ba270699ff26b9e660cf96",
      "prefix": "ak_gen_",
      "name": "Production Ingestion Pipeline",
      "permissions": ["traces:write", "metrics:write"],
      "created_at_ms": 1788696196481,
      "revoked": false
    }
  },
  "error": null
}
```

#### `[31] POST /api/v1/auth/api-keys/verify`
- **Name**: Verify API Key
- **Auth Required**: No (Public / Gateway Verification)
- **Request Body**:
```json
{
  "key": "ak_gen_org_xyz789_8rrtcr6pl641q067z45wm8",
  "required_permission": "traces:write"
}
```
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "API key verified",
  "data": {
    "valid": true,
    "record": {
      "key_id": "key_97v48p7",
      "org_id": "org_xyz789",
      "key_type": "general",
      "prefix": "ak_gen_",
      "name": "Production Ingestion Pipeline",
      "permissions": ["traces:write", "metrics:write"],
      "created_at_ms": 1788696196481,
      "revoked": false
    },
    "authorized": true
  },
  "error": null
}
```

#### `[32] GET /api/v1/auth/api-keys`
- **Name**: List Organization API Keys
- **Auth Required**: Yes (`Bearer <token>`)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "API keys retrieved",
  "data": [
    {
      "key_id": "key_97v48p7",
      "org_id": "org_xyz789",
      "key_type": "general",
      "prefix": "ak_gen_",
      "name": "Production Ingestion Pipeline",
      "permissions": ["traces:write", "metrics:write"],
      "created_at_ms": 1788696196481,
      "revoked": false
    }
  ],
  "error": null
}
```

#### `[33] POST /api/v1/auth/api-keys/:id/revoke`
- **Name**: Revoke API Key
- **Auth Required**: Yes (`Bearer <token>`)
- **Path Parameters**: `id` (string) - API Key ID (`key_*`)
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "API key revoked",
  "data": null,
  "error": null
}
```

---

### 3.7 Pillar 7: Audit Logging & Observability

#### `[34] GET /api/v1/auth/audit-logs`
- **Name**: Filtered Audit Event Logs
- **Auth Required**: Yes (`Bearer <token>`)
- **Query Parameters**:
  - `event_type` (`string`, optional): e.g. `"ORG_SWITCH"`, `"SIGN_IN"`, `"USER_INVITED"`, `"USER_ROLE_UPDATED"`.
  - `from` (`string`, optional): ISO timestamp string.
  - `to` (`string`, optional): ISO timestamp string.
- **Example Request**:
  `GET /api/v1/auth/audit-logs?event_type=ORG_SWITCH`
- **Success Response (200)**:
```json
{
  "status": "success",
  "message": "Audit logs retrieved",
  "data": [
    {
      "id": "audit_8oiue2r",
      "user_id": "usr_abc123",
      "org_id": "org_xyz789",
      "event_type": "ORG_SWITCH",
      "ip_address": "198.51.100.24",
      "user_agent": "CurlE2ETest/1.0",
      "timestamp_ms": 1788696195467
    }
  ],
  "error": null
}
```

---

## 4. Live Verification Results (Automated Curl Test Suite)

All 34 endpoints have been verified in real time against the running `@observability/auth` container (:3001) using [`tests/e2e/test-curl-endpoints.sh`](../tests/e2e/test-curl-endpoints.sh):

```bash
==========================================================
 Running Complete Live Curl API Test Suite (34 Endpoints) 
 Target URL: http://localhost:3001                         
==========================================================

--- [1/34] GET / (Root Health Check) --- HTTP_STATUS:200
--- [2/34] GET /health (Standard Health Check) --- HTTP_STATUS:200
--- [3/34] GET /api/v1/auth/health (V1 Health Check) --- HTTP_STATUS:200
--- [4/34] POST /api/v1/auth/sign-up (Register Admin & Org) --- HTTP_STATUS:201
--- [5/34] POST /api/v1/auth/sign-in (Sign In Authenticated User) --- HTTP_STATUS:200
--- [6/34] GET /api/v1/auth/session (Verify Session Token) --- HTTP_STATUS:200
--- [7/34] GET /api/v1/auth/users/me (Get Profile) --- HTTP_STATUS:200
--- [8/34] PATCH /api/v1/auth/users/me (Update Profile) --- HTTP_STATUS:200
--- [9/34] POST /api/v1/auth/change-password (Change Password) --- HTTP_STATUS:200
--- [10/34] POST /api/v1/auth/forgot-password (Forgot Password) --- HTTP_STATUS:200
--- [11/34] POST /api/v1/auth/reset-password (Reset Password) --- HTTP_STATUS:200
--- [12/34] POST /api/v1/auth/organizations (Create Secondary Org) --- HTTP_STATUS:201
--- [13/34] GET /api/v1/auth/organizations (List User Organizations) --- HTTP_STATUS:200
--- [14/34] GET /api/v1/auth/organizations/:id (Get Org By ID) --- HTTP_STATUS:200
--- [15/34] PATCH /api/v1/auth/organizations/:id (Update Organization) --- HTTP_STATUS:200
--- [16/34] POST /api/v1/auth/organizations/:id/switch (Switch Org Context) --- HTTP_STATUS:200
--- [17/34] POST /api/v1/auth/users (Direct User Creation) --- HTTP_STATUS:201
--- [18/34] POST /api/v1/auth/users/invite (Invite Team Member) --- HTTP_STATUS:201
--- [19/34] GET /api/v1/auth/users (List Organization Users) --- HTTP_STATUS:200
--- [20/34] GET /api/v1/auth/users/:id (Get User By ID) --- HTTP_STATUS:200
--- [21/34] PATCH /api/v1/auth/users/:id/role (Update User Role) --- HTTP_STATUS:200
--- [22/34] GET /api/v1/auth/users/:id/permissions (Get User Permissions) --- HTTP_STATUS:200
--- [23/34] PATCH /api/v1/auth/users/:id/permissions (Update User Permissions) --- HTTP_STATUS:200
--- [24/34] POST /api/v1/auth/users/:id/block (Block User Account) --- HTTP_STATUS:200
--- [25/34] DELETE /api/v1/auth/users/:id/unblock (Unblock User Account) --- HTTP_STATUS:200
--- [26/34] DELETE /api/v1/auth/users/:id (Soft-Delete User) --- HTTP_STATUS:200
--- [27/34] GET /api/v1/auth/permissions (List System Permissions) --- HTTP_STATUS:200
--- [28/34] POST /api/v1/auth/api-keys (Create General API Key) --- HTTP_STATUS:201
--- [29/34] POST /api/v1/auth/api-keys (Create Secret API Key) --- HTTP_STATUS:201
--- [30/34] POST /api/v1/auth/api-keys/verify (Verify API Key) --- HTTP_STATUS:200
--- [31/34] GET /api/v1/auth/api-keys (List Organization API Keys) --- HTTP_STATUS:200
--- [32/34] POST /api/v1/auth/api-keys/:id/revoke (Revoke API Key) --- HTTP_STATUS:200
--- [33/34] GET /api/v1/auth/audit-logs (Query Parameter Filtered Audit Logs) --- HTTP_STATUS:200
--- [34/34] DELETE /api/v1/auth/organizations/:id (Soft-Delete Organization) --- HTTP_STATUS:200
--- [BONUS] POST /api/v1/auth/sign-out (Sign Out & Revoke Session) --- HTTP_STATUS:200

==========================================================
 All 34 Auth Endpoints Executed and Verified Successfully! 
==========================================================
```
