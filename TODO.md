# 📋 Auth Module Feature Roadmap & Pending TODOs

*A structured engineering roadmap, feature matrix, and architectural backlog for `@observability/auth`.*

---

## 📊 1. Feature Implementation Matrix

| Feature Domain | Capability | Current Status | Target Milestone | Priority |
|---|---|---|---|---|
| **Core Authentication** | Email & Password Registration & Login (Argon2id) | ✅ **Completed** | Production v1.0 | Core |
| **Core Authentication** | Multi-Factor Authentication (MFA/2FA via TOTP) | ⏳ **Pending** | v1.1 | **High** |
| **Core Authentication** | WebAuthn / FIDO2 Passkeys (Biometrics) | ⏳ **Pending** | v1.2 | Medium |
| **Core Authentication** | Magic Link / Passwordless Email Login | ⏳ **Pending** | v1.2 | Medium |
| **Session Management** | Scoped JWT Issuance (`sub`, `org`, `role`) | ✅ **Completed** | Production v1.0 | Core |
| **Session Management** | Refresh Token Rotation & Sliding Sessions | ⏳ **Pending** | v1.1 | **High** |
| **Session Management** | Multi-Device Session Listing & Revocation | ⏳ **Pending** | v1.2 | Medium |
| **Session Management** | Direct Redis $O(1)$ Denylist TTL (ADR 0004) | ⏳ **Pending** | v1.1 | **High** |
| **Enterprise Identity** | OAuth2 / OIDC Social Login (Google, GitHub) | ⏳ **Pending** | v1.1 | **High** |
| **Enterprise Identity** | Enterprise SAML 2.0 / OIDC (Okta, Azure AD) | ⏳ **Pending** | v1.3 | **High** |
| **Enterprise Identity** | SCIM 2.0 Directory Sync (Automated Provisioning) | ⏳ **Pending** | v1.3 | Medium |
| **Multi-Tenancy** | Organization CRUD & Multi-Tenant Context Switch | ✅ **Completed** | Production v1.0 | Core |
| **Multi-Tenancy** | Row-Level Security (RLS) Isolation | ✅ **Completed** | Production v1.0 | Core |
| **Multi-Tenancy** | Custom Tenant Domain Mapping (e.g. `tenant.app.io`) | ⏳ **Pending** | v1.3 | Low |
| **User Management** | Member Invites, Roles, Permissions Table | ✅ **Completed** | Production v1.0 | Core |
| **User Management** | Account Blocking & 30-Day Cascade Soft-Delete | ✅ **Completed** | Production v1.0 | Core |
| **User Management** | Automated 30-Day Purge Background Cron | ⏳ **Pending** | v1.2 | Medium |
| **API Key Engine** | 3-Tier API Keys (`ak_gen_`, `ak_tst_`, `ak_sec_`) | ✅ **Completed** | Production v1.0 | Core |
| **API Key Engine** | Key Expiration Timestamps (`expires_at_ms`) | ⏳ **Pending** | v1.1 | Medium |
| **API Key Engine** | Key Usage Analytics & Last-Used Tracking | ⏳ **Pending** | v1.2 | Medium |
| **API Key Engine** | IP / CIDR Allowlist per API Key | ⏳ **Pending** | v1.2 | Medium |
| **Security & Defense** | Timing-Safe Argon2id Password Hashing | ✅ **Completed** | Production v1.0 | Core |
| **Security & Defense** | Brute-Force Rate Limiting & Account Lockout (429) | ⏳ **Pending** | v1.1 | **High** |
| **Security & Defense** | CAPTCHA Integration (Cloudflare Turnstile) | ⏳ **Pending** | v1.2 | Medium |
| **Audit & Compliance** | Event Audit Logging & Query Filters | ✅ **Completed** | Production v1.0 | Core |
| **Audit & Compliance** | GDPR Data Export (DSAR) & Right to Erasure | ⏳ **Pending** | v1.2 | Medium |
| **Audit & Compliance** | Immutable Audit Log Archive (S3 / WORM) | ⏳ **Pending** | v1.3 | Low |
| **Notifications** | Transactional Mailer (SMTP / SES / SendGrid) | ⏳ **Pending** | v1.1 | **High** |
| **Developer Experience** | Database Seed Script (`npm run db:seed`) | ⏳ **Pending** | v1.1 | Medium |

---

## 🎯 2. Detailed Pending Feature Specifications

### 2.1 Multi-Factor Authentication (MFA / 2FA - TOTP)
- **Objective**: Protect user accounts against credential stuffing and compromised passwords.
- **Scope**:
  - `POST /api/v1/auth/mfa/setup`: Generates standard RFC 6238 TOTP secret, returns base32 secret and QR code URI for authenticator apps (Google Authenticator, Authy, 1Password).
  - `POST /api/v1/auth/mfa/verify`: Validates 6-digit TOTP code and activates MFA on user profile.
  - `POST /api/v1/auth/mfa/recovery-codes`: Generates 10 single-use cryptographically random recovery codes (hashed with SHA-256 before database storage).
  - Modify `handleSignIn`: If user has `mfa_enabled = true`, issue a short-lived intermediate token (`mfa_pending`) requiring 2FA code verification before releasing the final session JWT.

### 2.2 Enterprise SSO & OAuth2 Providers (Google, GitHub, Okta, SAML)
- **Objective**: Allow enterprise customers to authenticate using corporate identity providers.
- **Scope**:
  - Developer logins: Google OAuth2 and GitHub OAuth2 integration with state parameter CSRF validation.
  - Enterprise SAML 2.0 / OIDC connector supporting Okta, Microsoft Entra ID (Azure AD), and Ping Identity.
  - Just-In-Time (JIT) user provisioning: automatically creates user record and maps to the appropriate organization upon successful initial SSO assertion.

### 2.3 Refresh Token Rotation & Sliding Sessions
- **Objective**: Minimize the exposure window of stolen JWT access tokens while maintaining a seamless user session.
- **Scope**:
  - Shorten access JWT lifetime to 15 minutes.
  - Issue cryptographically secure refresh token stored in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
  - `POST /api/v1/auth/refresh`: Validates refresh token, invalidates the old refresh token (reuse detection / family revocation), and issues a fresh token pair.

### 2.4 Server-Side Brute-Force Rate Limiting & Account Lockout
- **Objective**: Prevent automated credential brute-force and dictionary attacks on sign-in endpoints.
- **Scope**:
  - Track failed login attempts per email and per client IP in Redis.
  - On 5 consecutive failed attempts within 15 minutes:
    - Return `HTTP 429 Too Many Requests` with `Retry-After` header.
    - Emit security alert event `auth.events.v1:BRUTE_FORCE_DETECTED` via Kafka.
    - Temporarily lock account for 15 minutes or require email-based unlock.

### 2.5 Direct Redis Token Denylist Integration (Completing ADR 0004)
- **Objective**: Offload token revocation checks from PostgreSQL to Redis for sub-millisecond latency.
- **Scope**:
  - Direct connection to `llmobs-redis-ledger` (`redis://:31413`).
  - Store revoked tokens using `SETEX denylist:{token_hash} {ttl_seconds} 1`.
  - In `handleVerifySession`, execute $O(1)$ `EXISTS` check in Redis before database queries.
  - Implement Redis Pub/Sub broadcast across multi-instance auth pods.

### 2.6 Transactional Mailer Service
- **Objective**: Dispatch real automated emails for authentication workflows.
- **Scope**:
  - Integrate SMTP / AWS SES / SendGrid adapter with HTML templates.
  - Send email verification link upon `sign-up`.
  - Send password reset tokens upon `forgot-password`.
  - Send organization invitation emails with one-click acceptance links upon `invite-user`.

### 2.7 Scoped & Expiring API Keys
- **Objective**: Provide enterprise-grade API key lifecycle management.
- **Scope**:
  - Add `expires_at_ms` column to `auth_api_keys` to support automatically expiring keys (e.g. 30, 90, 365 days).
  - Add `last_used_at_ms` and usage counter to track stale/unused keys.
  - Add CIDR/IP allowlist column (`allowed_ips`) to restrict API key usage to specific corporate IP subnets.

### 2.8 Compliance Primitives (GDPR / SOC2 / Right to be Forgotten)
- **Objective**: Comply with data privacy regulations and security audit standards.
- **Scope**:
  - Automated background worker to permanently purge records marked with `deleted_at` older than the 30-day grace retention period.
  - `GET /api/v1/auth/users/me/export`: Exports user profile, organization memberships, and activity audit trails in JSON format.

---

## 🛠 3. Developer Experience & Tooling TODOs

- [ ] **Database Seeder (`database/seeds/seed.ts`)**:
  - Implement `npm run db:seed` script to populate standard development fixtures (Demo Admin, Viewer, Default Organization, sample API keys) in fresh databases.
- [ ] **Host-Level TypeScript Toolchain Link**:
  - Ensure `typescript` binary is linked in local node_modules so `npm run typecheck` runs natively outside of Docker containers.
- [ ] **Grafana Alert Rules for Auth Metrics**:
  - Add Prometheus alert rules for authentication failure spikes (>5% failure rate), elevated latency (>250ms), and token revocation volume.
