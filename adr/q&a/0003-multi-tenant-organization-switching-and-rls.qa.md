# ADR 0003: Multi-Tenant Organization Switching & Row-Level Security (RLS) — Staff Interview Q&A

This document contains 25 in-depth architectural interview questions and their corresponding meta-questions based on [ADR 0003: N-to-N Multi-Tenant Organization Context Switching & RLS](../0003-multi-tenant-organization-switching-and-rls.md).

---

### Question 1
**The Question:**  
In our N-to-N multi-tenant architecture, users can belong to multiple organizations with distinct roles in each. When a user switches their active organization, the service re-issues a new JWT scoped to the target organization while verifying their membership in `auth_user_organizations`. How does this multi-tenant JWT re-issuance model compare with a global session model where a single bearer token contains an array of all organizations the user belongs to?

**The Meta-Question:**  
The interviewer is evaluating your knowledge of multi-tenant security boundaries and token payload economics. They want to see if you understand that embedding an array of all tenant memberships inside a single token creates massive payload bloat, leaks organizational metadata across cross-tenant boundaries, and prevents fine-grained, per-tenant role revocation. The single-active-tenant token model ensures minimal header size, clear tenant context for Row-Level Security, and immediate security isolation.

---

### Question 2
**The Question:**  
To isolate tenant data in our shared PostgreSQL database, we rely on PostgreSQL Row-Level Security (RLS) driven by a session variable: `SET LOCAL app.current_org_id = 'org_123'`. What happens to this session variable when database connections are pooled and reused across multiple concurrent HTTP requests by connection poolers like PgBouncer or the Node.js `pg` Pool, and how do you prevent catastrophic cross-tenant data leakage?

**The Meta-Question:**  
The interviewer is testing your deep understanding of relational database connection pooling mechanics and shared-state hazards. They are looking to see if you know that connection poolers maintain long-lived TCP connections. If a query sets `SET app.current_org_id` without the `LOCAL` keyword, that setting persists on the physical connection and infects subsequent queries from completely different tenants. You must explain why `SET LOCAL` must execute inside an explicit SQL transaction (`BEGIN ... COMMIT`), automatically resetting when the transaction commits or rolls back, or why an explicit `DISCARD ALL` / pool reset hook is mandatory.

---

### Question 3
**The Question:**  
When a user switches organizations, the service issues a new JWT scoped to `targetOrgId`. What happens to the old JWT scoped to the previous organization? Does the user's previous token remain valid for its remaining TTL, and how do you prevent users from continuing to issue requests under their former organizational role if they have been revoked?

**The Meta-Question:**  
The interviewer is testing your comprehension of stateless token invalidation versus organization-level revocation. They are checking whether you realize that issuing a new JWT does not automatically invalidate the old JWT unless the old token's `jti` is explicitly revoked in a Redis denylist, or unless downstream services check a real-time tenant membership status. They want to hear you weigh the trade-offs between adding Redis revocation overhead on every context switch versus accepting bounded token lifetime windows.

---

### Question 4
**The Question:**  
If a user is removed from an organization by an administrator while the user is actively working in that organization context, their existing JWT token still contains valid cryptographic signatures and active claims for that tenant. How does our multi-tenant architecture enforce near-real-time revocation of active sessions when membership changes occur?

**The Meta-Question:**  
The interviewer is evaluating how you bridge the gap between stateless JWT performance and real-time enterprise access governance. They are looking for dual-track solutions: either maintaining a tenant-user revocation version counter in Redis (`tenant:revocations:<org_id>:<user_id>`), publishing a Kafka event (`MEMBER_REMOVED`) that triggers immediate edge cache denylist entries, or enforcing short token lifespans (e.g., 5–15 minutes) with mandatory refresh token re-validation.

---

### Question 5
**The Question:**  
In our relational database schema, we chose a shared-schema, shared-database multi-tenancy model using an `org_id` discriminator column protected by PostgreSQL Row-Level Security, rather than creating a separate PostgreSQL schema or a dedicated database instance for each tenant. What are the operational, performance, and scaling trade-offs of this decision as tenant count grows from hundreds to tens of thousands?

**The Meta-Question:**  
The interviewer is probing your architectural decision-making regarding multi-tenancy isolation models (database-per-tenant vs. schema-per-tenant vs. row-level partitioning). They want to hear you articulate that shared-database multi-tenancy drastically simplifies migrations, connection pool efficiency, and infrastructure costs, but introduces challenges with "noisy neighbors," table bloat on high-volume tenants, and the catastrophic blast radius of an RLS policy bypass.

---

### Question 6
**The Question:**  
How does PostgreSQL query optimization and indexing behave when Row-Level Security policies are applied across large tables? Specifically, why is it critical that composite indexes include the `org_id` column as the leading prefix column on every multi-tenant table?

**The Meta-Question:**  
The interviewer is testing your database indexing and query execution plan internals. They want to ensure you understand that RLS policies inject an implicit `WHERE org_id = current_setting('app.current_org_id')` into every single query. If indexes do not feature `org_id` as the leading column, PostgreSQL's query planner is forced to execute expensive Bitmap Index Scans or full table scans, destroying database throughput as table sizes exceed millions of rows.

---

### Question 7
**The Question:**  
Suppose an attacker discovers a SQL injection vulnerability in an administrative reporting query. Does PostgreSQL Row-Level Security provide defense-in-depth against SQL injection, or can an injected SQL string bypass RLS policies?

**The Meta-Question:**  
The interviewer is assessing your knowledge of database security boundaries and RLS privilege enforcement. They want to hear that RLS provides robust defense-in-depth *only if* the database connection user does not have the `BYPASSRLS` attribute or superuser privileges. If application database connections connect as a standard role and tables have `ALTER TABLE ... FORCE ROW LEVEL SECURITY` enabled, an injected `SELECT * FROM users` will still be strictly filtered to the active tenant.

---

### Question 8
**The Question:**  
When executing asynchronous background jobs or scheduled cron tasks that process data across multiple organizations, how should background workers establish the appropriate Row-Level Security context, given that there is no incoming user JWT to extract an `org_id` from?

**The Meta-Question:**  
The interviewer is evaluating your system design skills for asynchronous and background execution within multi-tenant systems. They want to hear that worker threads must run discrete per-tenant tasks, explicitly setting `SET LOCAL app.current_org_id = job.org_id` inside each task's database transaction, or utilize an explicitly audited, elevated database role with monitored access logging to prevent cross-tenant leakage during batch operations.

---

### Question 9
**The Question:**  
In our Redux-Saga frontend architecture described in the ASCII tree, what race conditions can occur if a user rapidly clicks between different organizations in the UI dropdown, and how does the saga pattern prevent stale organization state from overwriting active state?

**The Meta-Question:**  
The interviewer is testing your understanding of frontend concurrency and asynchronous action cancellation in Redux-Saga. They want to see if you identify that using `takeEvery` allows multiple context switch requests to race over the network, where an earlier slow response can arrive after a later fast response and corrupt UI state. The correct pattern is `takeLatest`, which automatically cancels in-flight previous requests when a new organization is selected.

---

### Question 10
**The Question:**  
How do you design database schema migrations in a multi-tenant system using Row-Level Security so that running DDL migrations (such as adding columns or indexes) does not lock tables or interfere with active RLS policy enforcement?

**The Meta-Question:**  
The interviewer is checking your production database operational experience. They want to hear about zero-downtime migration strategies: creating indexes concurrently (`CREATE INDEX CONCURRENTLY`), adding nullable columns or columns with default values without table rewrites, and testing policy modifications in transactions to prevent exclusive table locks from hanging high-concurrency production queries.

---

### Question 11
**The Question:**  
When an organization is soft-deleted (`deleted_at IS NOT NULL`), how does our organization switching logic guarantee that users cannot switch into a decommissioned organization, and how do RLS policies automatically exclude soft-deleted tenant records from analytical queries?

**The Meta-Question:**  
The interviewer is testing your defensive modeling of soft-deletes within multi-tenancy. They want to verify that `handleSwitchOrganization` explicitly verifies `deleted_at IS NULL` before issuing tokens, and that RLS policies or database views systematically incorporate `deleted_at IS NULL` to ensure that soft-deleted organization data is immediately invisible to both users and background workers.

---

### Question 12
**The Question:**  
If a user holds the role of `viewer` in Organization A but `owner` in Organization B, how does our RBAC and route authorization middleware ensure that elevated permissions from Organization B cannot be exercised against resources belonging to Organization A?

**The Meta-Question:**  
The interviewer is testing your role-tenant binding integrity. They want to hear that permissions and roles are strictly scoped to the `org_id` embedded in the JWT claims and validated against the RLS context. The authorization middleware evaluates permissions solely within the active tenant envelope, making it mathematically impossible for role privileges from one tenant to bleed into another.

---

### Question 13
**The Question:**  
In high-scale enterprise deployments, some massive tenants may generate ninety percent of total database load (the "noisy neighbor" problem). How does our shared-database multi-tenant architecture detect, isolate, and throttle disproportionate resource consumption by a single tenant without degrading performance for other tenants?

**The Meta-Question:**  
The interviewer is evaluating your experience with multi-tenant capacity planning and noisy-neighbor mitigation. They want to hear about tenant-aware rate limiting (token buckets keyed by `org_id`), connection pool quotas, query timeout limits (`SET LOCAL statement_timeout`), and read-replica routing for read-heavy tenants, demonstrating that you can protect shared multi-tenant infrastructure from single-tenant exhaustion.

---

### Question 14
**The Question:**  
Why should our database connection pool never connect using the PostgreSQL `postgres` superuser role when enforcing Row-Level Security in production?

**The Meta-Question:**  
The interviewer is testing fundamental database security principles. In PostgreSQL, superusers and roles with the `BYPASSRLS` attribute automatically ignore and bypass all Row-Level Security policies regardless of session variables. Application connection pools must connect using a dedicated, least-privileged application user role (`auth_app_user`) to guarantee that RLS policies are strictly and unconditionally enforced.

---

### Question 15
**The Question:**  
When logging user actions and generating audit trails across multi-tenant context switches, why is it critical to record both the user ID and the active organization ID in every audit record, and what audit vulnerabilities occur if organization ID is omitted?

**The Meta-Question:**  
The interviewer is probing your knowledge of compliance and non-repudiation audit trails. They want you to explain that without `org_id`, administrators cannot reconstruct tenant-specific timelines, calculate tenant billing, or fulfill tenant-level GDPR data subject export requests. Omission of `org_id` prevents organizations from auditing administrative actions performed within their specific boundary.

---

### Question 16
**The Question:**  
In our sequence diagram, `handleVerifySession` checks whether the current token is revoked in Redis before processing the organization switch. Why is verifying the existing token necessary even though we are about to issue a brand-new token?

**The Meta-Question:**  
The interviewer is evaluating your defensive token exchange design. They are checking whether you realize that allowing a revoked or stolen token to be exchanged for a fresh, valid token creates an infinite token rejuvenation vulnerability, completely defeating the purpose of session revocation and sign-out kill switches.

---

### Question 17
**The Question:**  
How does our architecture handle tenant invitations when an existing user is invited to join a new organization? How is the invitation token validated, and how is the membership atomically created without exposing existing organization memberships to the inviting admin?

**The Meta-Question:**  
The interviewer is assessing multi-tenant privacy boundaries and user onboarding. They want to hear that invitations are issued via opaque cryptographic tokens scoped to the target organization. When accepted, the service atomically inserts a new row into `auth_user_organizations`. At no point does the inviting administrator gain visibility into the user's other organizational memberships, preserving cross-tenant confidentiality.

---

### Question 18
**The Question:**  
What are the performance implications of using `current_setting('app.current_org_id', true)` in PostgreSQL RLS policies, and why is passing the second boolean argument (`missing_ok = true`) essential for query execution stability?

**The Meta-Question:**  
The interviewer is testing your deep familiarity with PostgreSQL internal functions. In PostgreSQL, calling `current_setting('app.current_org_id')` without the second parameter throws a runtime SQL error if the variable has not been initialized in the current session. Passing `true` (`missing_ok`) ensures the function returns `NULL` rather than crashing the transaction, allowing safe fallback evaluation.

---

### Question 19
**The Question:**  
If an enterprise customer demands their own isolated database due to strict regulatory compliance (such as FedRAMP or HIPAA banking requirements), how can our Hexagonal Architecture support hybrid tenancy—where standard tenants share a database while dedicated enterprise tenants route to separate database instances?

**The Meta-Question:**  
The interviewer is testing your capability to architect hybrid multi-tenancy at scale. They want to hear how the `AuthRepositoryPort` can be backed by a dynamic routing adapter (a `TenantDatabaseRouter`) that inspects the incoming `org_id` and routes queries to either a shared connection pool or a dedicated tenant-specific connection pool, completely transparent to the core domain services.

---

### Question 20
**The Question:**  
When caching multi-tenant query results in a distributed Redis cache, how do you structure cache keys to prevent accidental cross-tenant data leakage or cache poisoning across organization context switches?

**The Meta-Question:**  
The interviewer is assessing your cache partitioning and namespace discipline. They want to verify that all cache keys strictly incorporate the tenant prefix: `tenant:<org_id>:resource:<id>`. Omitting the `org_id` allows users in Tenant B to retrieve cached data from Tenant A, causing severe data breaches. They also want to hear about tenant-level cache invalidation strategies using Redis key tagging or namespace deletion.

---

### Question 21
**The Question:**  
In our multi-tenant JWT structure, how do you handle cross-tenant administrative operations, such as a platform Super-Admin inspecting a customer's workspace for debugging support without adding the Super-Admin permanently to the customer's organization?

**The Meta-Question:**  
The interviewer is evaluating your experience with administrative impersonation and elevated privileges (Break-Glass workflows). They want to hear about time-boxed, explicitly audited impersonation tokens that carry an `impersonated_by: super_admin_id` claim, require multi-factor re-authentication (Step-Up auth), and log every action to a dedicated immutable audit ledger.

---

### Question 22
**The Question:**  
How does the database handle unique constraints across multiple tenants in a shared table (e.g., ensuring a project name or user slug is unique within an organization, but allowing duplicate names across different organizations)?

**The Meta-Question:**  
The interviewer is testing your relational data modeling foundations. They want to hear that unique constraints in multi-tenant tables must be compound indexes incorporating the tenant discriminator: `UNIQUE(org_id, slug)`. Enforcing global uniqueness on customer-defined names causes inter-tenant namespace collisions, allowing one tenant to block another tenant from using common names.

---

### Question 23
**The Question:**  
What happens if a user's role inside an organization changes (e.g., promoted from `member` to `admin`) while they are actively using the application? When does the new role take effect, and how can the frontend update its UI capabilities without requiring a manual logout?

**The Meta-Question:**  
The interviewer is checking your coordination between backend authorization and frontend capability rendering. They want to hear that role updates can be communicated via background WebSocket events or server-sent events (SSE) triggering a silent organization token refresh, or that critical operations always perform server-side permission checks regardless of stale JWT claims.

---

### Question 24
**The Question:**  
In a multi-tenant environment, how do you implement tenant-specific data backup and export (such as satisfying GDPR Data Portability or tenant offboarding) when all tenants share the same physical database tables?

**The Meta-Question:**  
The interviewer is evaluating your operational and regulatory compliance capabilities in shared-database architectures. They want to hear you describe parameterized tenant-scoped ETL pipelines (`pg_dump` with selective table filters or streaming export scripts that filter by `org_id`) that generate isolated JSON/SQL archive dumps without exposing adjacent tenant records.

---

### Question 25
**The Question:**  
Looking critically at ADR 0003, what is the single biggest security vulnerability inherent in relying on Row-Level Security as the primary tenant isolation mechanism, and what defense-in-depth layers must accompany it?

**The Meta-Question:**  
The interviewer is looking for engineering realism and defensive systems thinking. The expected answer is that a developer writing a raw SQL query that forgets to set `SET LOCAL app.current_org_id`, or a bug in an ORM query builder, can result in queries executing without tenant filters. Defense-in-depth requires:
1. Automated unit tests verifying RLS policy denial when context is omitted.
2. An ORM/query builder layer that automatically injects `WHERE org_id = ?` as an application-level guard.
3. Strict database connection role restrictions prohibiting superuser access.
