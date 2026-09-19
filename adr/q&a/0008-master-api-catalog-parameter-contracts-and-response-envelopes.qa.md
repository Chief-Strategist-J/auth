# ADR 0008: Master API Catalog, Parameter Contracts & Response Envelopes — Staff Interview Q&A

This document contains 25 in-depth architectural interview questions and their corresponding meta-questions based on [ADR 0008: Master API Catalog, Parameter Contracts & Response Envelopes](../0008-master-api-catalog-parameter-contracts-and-response-envelopes.md).

---

### Question 1
**The Question:**  
Our service enforces a strict, universal response envelope structure across all thirty-four endpoints (`status`, `message`, `data`, `error`), requiring clients to parse structured objects rather than raw primitives or bare arrays. What are the architectural, backwards-compatibility, and client SDK advantages of enforcing uniform response envelopes, and what trade-offs does this introduce regarding payload size and HTTP semantics?

**The Meta-Question:**  
The interviewer is evaluating your API design philosophy and contract governance maturity. Uniform envelopes ensure that client SDKs can implement standardized deserializers, attach pagination or metadata without breaking changes, and capture machine-readable error codes consistently. The trade-off is slight JSON payload inflation and potential confusion when HTTP status codes (like 400 Bad Request) duplicate the envelope's `"status": "error"` field, which staff engineers justify as defense-in-depth against intermediate proxy truncation.

---

### Question 2
**The Question:**  
In our error envelope design, we provide both a machine-readable `error.code` (e.g., `VALIDATION_ERROR`, `API_KEY_EXPIRED`, `INVALID_CREDENTIALS`) and an array of `error.details`. Why should client applications never base their business logic or conditional branches on the human-readable `message` string, and how do machine-readable error codes decouple frontend localization from backend releases?

**The Meta-Question:**  
The interviewer is probing your client-server contract decoupling and internationalization (i18n) experience. Human-readable error messages change frequently for clarity, grammar, or security phrasing. If frontend clients execute string matching on `message.includes("password expired")`, minor backend copy edits break client behavior. Strict machine-readable error codes act as frozen contractual enum keys, allowing client apps to branch deterministically and map codes to localized user translations.

---

### Question 3
**The Question:**  
When designing query parameters for list endpoints like `GET /api/v1/auth/audit-logs`, we support filtering by `event_type`, `user_id`, `from_ms`, and `to_ms`, along with pagination via `limit` and `page`. Why is offset-based pagination (`page` and `limit` with `OFFSET` and `LIMIT` in SQL) dangerous on large tables with millions of rows, and how would you transition this catalog to cursor-based keyset pagination?

**The Meta-Question:**  
The interviewer is testing your relational database query performance under pagination. Offset pagination causes PostgreSQL to scan and discard all rows prior to the offset (e.g., `OFFSET 100000 LIMIT 20` scans 100,020 rows), resulting in severe database CPU spikes and degrading performance the deeper a user paginates. Keyset pagination passes an opaque cursor based on the primary key and timestamp (`WHERE (timestamp_ms, id) < ($last_timestamp, $last_id) ORDER BY timestamp_ms DESC, id DESC LIMIT 20`), ensuring constant $O(1)$ index seek performance regardless of table depth.

---

### Question 4
**The Question:**  
Our API catalog defines `POST /api/v1/auth/sign-in` as returning `HTTP 200 OK` on success and `HTTP 401 Unauthorized` on bad credentials. If a user account is locked due to excessive failed attempts, returning 401 causes frontend clients to prompt the user to re-enter their credentials. Why is using `HTTP 423 Locked` or `HTTP 429 Too Many Requests` mathematically and operationally critical for automated clients and web applications?

**The Meta-Question:**  
The interviewer is assessing your HTTP protocol semantic accuracy and API contract precision. Returning 401 signals that re-authenticating with different credentials might succeed, encouraging brute-force retry loops. Returning 423 Locked or 429 Too Many Requests with a `Retry-After: 600` header informs both human users and automated API clients that credentials are not the issue and that requests are actively throttled, halting pointless authentication retries and reducing server load.

---

### Question 5
**The Question:**  
In our API catalog, destructive operations like `DELETE /api/v1/auth/organizations/:id` and `DELETE /api/v1/auth/users/:id` mark the record as soft-deleted (`deleted_at = NOW()`) rather than executing a hard SQL `DELETE`. What API contract guarantees must be documented regarding whether a soft-deleted entity's unique attributes (like email or organization slug) can be immediately re-registered by a new user?

**The Meta-Question:**  
The interviewer is probing your data integrity rules and business lifecycle modeling. If an organization with slug `acme` is soft-deleted, can another customer create an organization named `acme`? If yes, database unique constraints must be partial indexes (`CREATE UNIQUE INDEX ON auth_organizations(slug) WHERE deleted_at IS NULL`). The API catalog must document whether soft-deletion frees the namespace or permanently reserves the identifier to prevent namespace confusion.

---

### Question 6
**The Question:**  
When an API consumer submits a request with unexpected or undeclared JSON body fields (e.g., submitting `{ "email": "...", "role": "admin", "unknown_field": 123 }` to `signUp`), should our schema validation engine strip the unknown fields, reject the request with `VALIDATION_ERROR`, or allow them through?

**The Meta-Question:**  
The interviewer is testing your defensive schema validation posture. In security-sensitive authentication services, stripping unknown fields or silently allowing them through can lead to Mass Assignment vulnerabilities (where an attacker injects `is_admin: true`). Modern security standards favor strict schema rejection (Zod `.strict()`), rejecting requests containing undeclared fields with an explicit 400 Validation Error to prevent parameter injection attacks and catch client typos immediately.

---

### Question 7
**The Question:**  
In the API catalog, endpoints like `POST /api/v1/auth/api-keys` accept an array of permissions: `["admin:all", "traces:write", "metrics:write"]`. How does our schema validation ensure that client applications cannot inject arbitrary or malformed permission strings, and how are permissions structured to allow hierarchical wildcard matching?

**The Meta-Question:**  
The interviewer is checking your authorization domain modeling and input validation rigor. Permissions must be validated against a strict schema enum or regex pattern (e.g., `^[a-z]+:[a-z*]+$`). Wildcard hierarchies (`traces:*` granting `traces:read` and `traces:write`) require an evaluation engine that splits permission segments by colons and checks matches iteratively, ensuring invalid strings are rejected during request schema parsing before touching the database.

---

### Question 8
**The Question:**  
Our API catalog defines `GET /health` as a public health check endpoint returning `HTTP 200 OK`. In production Kubernetes deployments, what is the architectural difference between a Liveness Probe (`GET /live`), a Readiness Probe (`GET /ready`), and a Startup Probe (`GET /startup`), and why should `/health` never query downstream databases or Redis for liveness checks?

**The Meta-Question:**  
The interviewer is evaluating your cloud-native container orchestration and SRE knowledge. They want to verify that you know the danger: if a Liveness probe checks database connectivity and the database experiences a transient 5-second network hiccup, Kubernetes will restart *every single auth pod simultaneously*, turning a minor database slowdown into a catastrophic cascading platform outage! Liveness checks must only verify process health; only Readiness probes should inspect downstream dependency availability to manage traffic routing.

---

### Question 9
**The Question:**  
When clients call `PATCH /api/v1/auth/users/:id`, only modified fields (like `name` or `role`) are supplied in the request body. What is the semantic and architectural difference between HTTP `PUT` and HTTP `PATCH`, and how does our schema validation distinguish between an omitted field (do not change) and a field explicitly sent as `null` (clear existing value)?

**The Meta-Question:**  
The interviewer is testing your precision regarding HTTP REST semantics and partial updates in TypeScript. `PUT` represents complete resource replacement (omitted fields are cleared or reset to defaults); `PATCH` represents partial modification. In TypeScript and JSON parsing, distinguishing between `undefined` (key absent $\rightarrow$ retain existing value) and `null` (key present with null value $\rightarrow$ clear column in database) requires schema validation tools like Zod that explicitly differentiate `.optional()` from `.nullable()`.

---

### Question 10
**The Question:**  
Our API documentation specifies that all timestamps returned in response envelopes (e.g., `created_at_ms`, `expires_at_ms`, `timestamp_ms`) are serialized as 64-bit integer epoch milliseconds rather than ISO 8601 strings. What are the precision, timezone ambiguity, and client-side arithmetic benefits of numeric epoch timestamps compared to string formats?

**The Meta-Question:**  
The interviewer is evaluating your data formatting consistency and cross-platform client architecture. String formats like ISO 8601 (`2026-09-06T12:00:00.000Z`) introduce client parsing differences, timezone string formatting bugs, and require expensive string parsing in client-side performance loops. Numeric epoch milliseconds provide universal timezone independence, instant integer comparison ($t_1 > t_2$), and eliminate datetime parsing overhead in high-throughput client applications.

---

### Question 11
**The Question:**  
In our API catalog, what guarantees does the service provide regarding idempotency on POST requests? If a network timeout occurs while calling `POST /api/v1/auth/organizations`, how does the client safely retry the request without creating duplicate organizations?

**The Meta-Question:**  
The interviewer is assessing your knowledge of network failure recovery and Idempotency Keys (IETF draft). They want to hear that clients should generate a unique `Idempotency-Key` header (e.g., UUIDv4) on mutating requests. The server records the idempotency key and cached response in Redis during the initial execution. If the client retries with the same key, the server returns the cached response immediately without re-executing the database insert, preventing duplicate resource creation.

---

### Question 12
**The Question:**  
Our catalog requires the `x-request-id` header to be propagated across all requests. If a client provides an invalid or excessively long string (e.g., a 10KB string designed to exhaust memory), how does our gateway and router sanitize the header before logging or storing it?

**The Meta-Question:**  
The interviewer is testing your defensive header validation. Unrestricted headers can cause log injection, memory exhaustion, or header buffer overflow in downstream proxies. The routing middleware must enforce strict validation on correlation headers (e.g., alphanumeric and hyphen characters only, maximum 64 bytes). If the client provides a malformed or oversized header, the server discards it and generates a clean UUIDv4.

---

### Question 13
**The Question:**  
In our API catalog, endpoints returning lists of resources (like `GET /api/v1/auth/users`) include a `total` count in the pagination metadata. On tables containing millions of rows, why is executing `SELECT COUNT(*)` for every paginated query a severe database performance bottleneck, and how can API pagination be redesigned to avoid exact counts?

**The Meta-Question:**  
The interviewer is testing your database performance knowledge regarding PostgreSQL table scans. In PostgreSQL, `COUNT(*)` must scan the entire MVCC table visibility map to count live rows. On large tables, computing `COUNT(*)` on every page request dominates query latency. Solutions include returning estimated counts using PostgreSQL `pg_class.reltuples`, omitting `total` in favor of a simple boolean `has_more` flag (infinite scroll model), or caching counts in Redis with a 5-minute TTL.

---

### Question 14
**The Question:**  
When an API client receives a `409 Conflict` response code from our service, what specific business and data integrity scenarios does this status code represent across our thirty-four endpoints?

**The Meta-Question:**  
The interviewer is checking your semantic understanding of HTTP status codes in business contexts. `409 Conflict` should be reserved for resource collisions where retrying without modifying the payload will consistently fail:
1. Attempting to register an email that already exists.
2. Attempting to create an organization with an existing slug.
3. Concurrent updates where a resource version or concurrency token has advanced (optimistic concurrency failure).

---

### Question 15
**The Question:**  
How does our API catalog handle API versioning? We currently expose `/api/v1/auth/*`. When breaking changes are introduced in the future, what are the architectural trade-offs between URI path versioning (`/v2/`), header-based versioning (`Accept: application/vnd.company.v2+json`), and query parameter versioning?

**The Meta-Question:**  
The interviewer is evaluating your experience with long-term API lifecycle management and enterprise deprecation. Path versioning (`/api/v1/` vs `/api/v2/`) is explicit, transparent, highly cache-friendly for proxies like Traefik, and simple for developers to understand. Header versioning is cleaner RESTfully but complicates proxy routing, breaks simple browser testing, and makes CDN caching rules difficult to configure.

---

### Question 16
**The Question:**  
In our API catalog, sensitive endpoints like `POST /api/v1/auth/admin/impersonate/:user_id` require high-privilege roles (`super_admin`). How does the router evaluate role authorization before executing the handler, and why should role evaluation occur at the routing gate rather than deep within domain methods?

**The Meta-Question:**  
The interviewer is probing your defense-in-depth and authorization gate placement. Evaluating roles at the routing gate (declarative route rules with `requiredRole: 'super_admin'`) ensures unauthorized requests are rejected in $0\text{ms}$ before allocating domain memory or opening database connections. Domain methods should still enforce invariant assertions, but the routing gate provides the primary perimeter guard against unauthorized traffic.

---

### Question 17
**The Question:**  
Our API documentation specifies that the `Authorization` header must strictly follow the format `Bearer <TOKEN>`. If an API consumer submits `bearer <token>` (lowercase) or omits the space, how should our header extraction utility handle case-insensitivity and formatting variations?

**The Meta-Question:**  
The interviewer is testing your adherence to RFC 6750 (OAuth 2.0 Bearer Token Usage) and robust parser design. The HTTP specification dictates that header names are case-insensitive, but header values may have case-sensitive schemes. A robust extraction regex (`/^Bearer\s+(.+)$/i`) handles case-insensitive "bearer" prefixes gracefully while rejecting malformed inputs cleanly without throwing unhandled exceptions.

---

### Question 18
**The Question:**  
When returning user records in API responses (such as `POST /api/v1/auth/sign-in` or `GET /api/v1/auth/users/:id`), how does our serialization layer guarantee that internal security fields—specifically `password_hash`—are never accidentally serialized into the JSON response envelope?

**The Meta-Question:**  
The interviewer is checking your defensive serialization and data projection practices. Relying on developers to manually `delete user.password_hash` in handlers is prone to human error. The system must use explicit Data Transfer Object (DTO) mappers, entity serializers, or schema transform operations (like `JsonMapOp` with `pick` or `omit`) that construct public response objects using strict allowlists of public fields before sending data over the wire.

---

### Question 19
**The Question:**  
If an API consumer submits a request with an unsupported `Content-Type` header (such as `application/xml` or `text/plain`) to a JSON endpoint, why should the server return `HTTP 415 Unsupported Media Type` rather than attempting to parse the body as JSON or returning `HTTP 400 Bad Request`?

**The Meta-Question:**  
The interviewer is testing your precise adherence to HTTP/1.1 and REST standards. Returning `HTTP 415` explicitly communicates to the client that the media encoding is the failure reason, allowing API clients to adjust their serialization format automatically. Returning generic 400 errors obfuscates the failure cause and complicates automated client debugging.

---

### Question 20
**The Question:**  
In our API catalog, what rate limiting headers (such as `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` conforming to IETF draft standards) should be returned on authentication responses, and how do these headers help client SDKs pace their requests?

**The Meta-Question:**  
The interviewer is evaluating your client developer experience (DX) and rate limiting transparency. Emitting standardized rate limiting headers allows client SDKs to implement proactive backpressure: slowing down requests when remaining quota is low and sleeping until the reset timestamp rather than crashing into hard 429 Too Many Requests errors.

---

### Question 21
**The Question:**  
How does our API catalog document and enforce payload size limits (e.g., maximum 1MB body size for JSON inputs) to prevent memory exhaustion from oversized request bodies?

**The Meta-Question:**  
The interviewer is testing your defensive API boundary protection against buffer overflow and DoS attacks. Request stream accumulation in the raw HTTP server must check incoming chunk byte size against `maxBodySize`. If the limit is breached, the server immediately returns `HTTP 413 Payload Too Large` and destroys the TCP socket, preventing the process from consuming memory on malicious megabyte/gigabyte payloads.

---

### Question 22
**The Question:**  
When an API client calls `GET /api/v1/auth/organizations/:id`, what status code should be returned if the organization exists in the database but the authenticated user does not have permission to view it: `HTTP 403 Forbidden` or `HTTP 404 Not Found`?

**The Meta-Question:**  
The interviewer is probing your understanding of resource enumeration and security information disclosure. Returning `403 Forbidden` confirms to an attacker that the organization ID *does* exist, allowing enumeration of customer tenant IDs. To prevent user and tenant enumeration, security-conscious APIs return `404 Not Found` for resources outside the user's authorized scope, concealing the existence of unauthorized resources.

---

### Question 23
**The Question:**  
How can the master API catalog in ADR 0008 be used to automatically validate contract parity between backend route handlers and frontend mock services (like Mock Service Worker / MSW) in automated CI pipelines?

**The Meta-Question:**  
The interviewer is assessing your automated contract testing practices. Because ADR 0008 defines exhaustive schemas and parameter envelopes, these contracts can be compiled into TypeScript types and shared between backend route handlers and MSW handlers in frontend test suites. CI pipelines can run contract assertion tests that ensure frontend mocks never drift from live backend API response envelopes.

---

### Question 24
**The Question:**  
In our API catalog, endpoints like `POST /api/v1/auth/api-keys/verify` are designed for machine-to-machine (M2M) consumption by edge proxies and SDKs rather than human browser users. How should the API response envelope and error handling differ between human-facing web endpoints and high-speed machine-to-machine validation endpoints?

**The Meta-Question:**  
The interviewer is testing your ability to tailor contracts to the consumer context. M2M validation endpoints prioritize raw throughput and parsing speed. While human endpoints benefit from rich descriptive messages, high-speed M2M endpoints require compact payloads, minimal JSON nesting, and explicit binary booleans (`valid: true, authorized: true`) to minimize serialization overhead in high-QPS proxy filters.

---

### Question 25
**The Question:**  
Looking critically at the 34-endpoint surface in ADR 0008, what governance process should an architecture team establish to prevent "API sprawl," ensure consistent parameter naming across new endpoints, and enforce automated breaking-change detection during pull request reviews?

**The Meta-Question:**  
The interviewer is evaluating your engineering leadership and API governance at scale. They want to hear about:
1. Automated schema linting in CI (such as Spectral or OpenAPI diff tools) that flags breaking changes or inconsistent naming conventions (e.g., mixing camelCase and snake_case).
2. Architectural review checklists for new endpoints.
3. Centralized schema definitions where DTOs and envelopes are generated from a single source of truth, ensuring that individual developers cannot invent ad-hoc response structures.
