# ADR 0002: User Registration, Sign-In, Argon2id Hashing & Audit Logging — Staff Interview Q&A

This document contains 25 in-depth architectural interview questions and their corresponding meta-questions based on [ADR 0002: Sign-Up, Sign-In, Argon2id Hashing, OpenTelemetry Tracing & Audit Logging](../0002-authentication-user-registration-and-signin-flow.md).

---

### Question 1
**The Question:**  
In our authentication flow, we standardized on the Argon2id algorithm for password hashing rather than bcrypt, scrypt, or PBKDF2. What specific architectural and cryptographic advantages does Argon2id provide against modern hardware-accelerated side-channel and GPU/ASIC brute-force attacks, and how do you tune memory cost, time iterations, and parallelism parameters for high-throughput containerized environments?

**The Meta-Question:**  
The interviewer is evaluating your knowledge of modern password hashing cryptography beyond superficial name-dropping. They want to hear that Argon2id provides a hybrid defense: Argon2i protects against side-channel cache-timing attacks, while Argon2d protects against GPU/ASIC cracking via memory hardness. They are testing whether you understand how setting memory cost ($m=65536\text{ KB}$), time cost ($t=3$), and parallelism ($p=4$) impacts container CPU throttling and latency budgets under high concurrent sign-in spikes.

---

### Question 2
**The Question:**  
During user registration (`signUp`), our service executes atomic creation of the organization, the user record, and the organization membership mapping inside a single database transaction. If the database commit succeeds but the subsequent Kafka event publication (`USER_SIGNED_UP`) fails due to a network partition, how does our architecture ensure that downstream services eventually receive the event without resorting to distributed two-phase commit protocols?

**The Meta-Question:**  
The interviewer is testing your grasp of distributed data consistency and the Dual-Write Problem. They want to see if you recognize that dual-writing to a database and a message broker without atomicity creates data loss or zombie states. The expected staff-level answer is the **Transactional Outbox Pattern**: persisting the event inside an `outbox` table in the same SQL transaction as the user creation, followed by a reliable CDC process (like Debezium or a polling relay) publishing to Kafka with at-least-once delivery guarantees.

---

### Question 3
**The Question:**  
In the sign-in sequence flow, when a user submits an incorrect password, the system records the exception, sets the OpenTelemetry span status to `ERROR`, and returns an HTTP 401 Unauthorized response. How do you prevent attackers from conducting user enumeration attacks by exploiting subtle response latency discrepancies between "user not found" and "invalid password" conditions?

**The Meta-Question:**  
The interviewer is testing your depth in defensive authentication engineering and timing side-channel attacks. They want to hear that password verification time (e.g., Argon2id computation taking ~100ms) is drastically higher than a simple database lookup returning null. To prevent enumeration via timing analysis, the system must execute a dummy Argon2id hash verification when a user email is not found, ensuring uniform response latency regardless of whether the account exists.

---

### Question 4
**The Question:**  
Our service injects W3C `traceparent` headers into outgoing Kafka messages when publishing authentication events to `auth.events.v1`. How does distributed trace context propagation differ between synchronous HTTP request-response chains and asynchronous message brokers, and how do you handle trace continuity across batch consumers?

**The Meta-Question:**  
The interviewer is testing your understanding of OpenTelemetry messaging semantic conventions. They want to verify that you know HTTP propagation uses direct parent-child span linking, whereas asynchronous messaging breaks synchronous time boundaries. A consumer reading batches of Kafka records cannot have a single parent span; it must start a new consumer span and link back to each message's trace context using OpenTelemetry span **Links**, preserving the distributed graph without distorting waterfall timelines.

---

### Question 5
**The Question:**  
When generating scoped JWTs on successful sign-in, we embed claims such as `sub`, `org_id`, and `role`. If an enterprise user belongs to multiple organizations or has dozens of fine-grained permissions, what operational problems arise from bloating the JWT payload size, and how do you decide what belongs inside a bearer token versus what should be queried on demand?

**The Meta-Question:**  
The interviewer is evaluating your practical experience with token bloat and HTTP transport limits. They want to hear you discuss how oversized JWTs inflate HTTP headers on every downstream microservice call, leading to `413 Entity Too Large` or `431 Request Header Fields Too Large` errors from ingress proxies like Traefik or NGINX. The correct design philosophy is keeping the JWT minimal (identifiers and tenant boundaries) while fetching dynamic permission bitmasks or large role sets via distributed cache lookups.

---

### Question 6
**The Question:**  
Our user registration flow creates an immutable audit trail entry in `auth_audit_logs`. If an enterprise customer demands that their audit logs comply with SOC 2 Type II and HIPAA audit retention policies, how do you architect the database storage, write path, and retention lifecycle so that audit logs cannot be modified or deleted even by a malicious database administrator?

**The Meta-Question:**  
The interviewer is assessing your knowledge of compliance architecture and Write-Once-Read-Many (WORM) storage. They want to verify that you understand that database tables with standard update/delete permissions do not satisfy strict tamper-proof audit requirements. You should explain table-level PostgreSQL permissions that revoke `UPDATE` and `DELETE`, append-only audit tables with cryptographic hash-chaining (like a Merkle tree), or streaming audit events directly into immutable cloud storage (like AWS S3 with Object Lock or Glacier Vault Lock).

---

### Question 7
**The Question:**  
Argon2id is intentionally CPU- and memory-intensive to defeat brute-force cracking. In a containerized Kubernetes pod with strict CPU limits (e.g., 500m CPU limit), an influx of concurrent sign-in requests can cause CFS CPU throttling, leading to severe latency spikes and potential liveness probe timeouts. How would you design your compute architecture to insulate authentication services from password hashing exhaustion?

**The Meta-Question:**  
The interviewer is probing your systems infrastructure knowledge regarding container resource management and V8 worker threading. They want to see if you understand that CPU-bound crypto operations block Node.js libuv worker threads or trigger Kubernetes CFS throttling. Solutions include offloading password hashing to dedicated, unthrottled worker sidecars, tuning libuv thread pool size (`UV_THREADPOOL_SIZE`), or establishing ingress concurrency rate-limiters that shed load gracefully rather than letting pods collapse.

---

### Question 8
**The Question:**  
In our `signUp` implementation, we check whether an email address already exists before hashing the password. However, under high concurrency, two simultaneous requests with the identical email address can bypass this application-level check. How does our relational database schema prevent duplicate user registrations, and how should the application layer handle the resulting database error?

**The Meta-Question:**  
The interviewer is testing your understanding of race conditions and relational database integrity constraints. They want to hear that relying on application-level checks without database constraints is a critical flaw. The database must enforce a strict `UNIQUE(email)` constraint (or unique partial index ignoring soft-deleted users). When concurrent inserts collide, the database throws a unique constraint violation error (SQLState 23505), which the repository adapter must catch and translate cleanly into a domain `UserAlreadyExistsError`.

---

### Question 9
**The Question:**  
Why do we hash passwords using Argon2id with a randomly generated salt per user, and how does the salt length and storage format impact vulnerability to rainbow table lookups and precomputed hash dictionary attacks?

**The Meta-Question:**  
The interviewer is checking your fundamental understanding of password storage mechanics. They want to verify that you know salts must be cryptographically secure random bytes (minimum 16 bytes) generated per password to guarantee that identical passwords produce completely different hash strings, rendering rainbow tables useless. They also want to hear that the salt and cryptographic parameters are serialized directly into the standard modular crypt format string (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`).

---

### Question 10
**The Question:**  
When a user signs in, our architecture issues a signed JWT with an expiration time of 3,600 seconds (one hour). What are the trade-offs between issuing short-lived access tokens (e.g., 15 minutes) paired with refresh tokens versus issuing longer-lived tokens (e.g., 24 hours), particularly regarding edge latency, revocation responsiveness, and token storage?

**The Meta-Question:**  
The interviewer is testing your grasp of modern session architecture tradeoffs. They want you to explain that long-lived JWTs reduce auth service traffic but create an unacceptably wide window of vulnerability if a token is stolen. Short-lived access tokens paired with refresh tokens force periodic revalidation, but require a robust refresh token rotation strategy and storage mechanism (such as Redis or database family trees) to detect token reuse attacks.

---

### Question 11
**The Question:**  
Our user registration flow publishes a `USER_SIGNED_UP` event containing the user's ID, email, and organization ID to Kafka. How do you prevent event consumers from processing duplicate events if Kafka producers experience transient network errors and retry their delivery?

**The Meta-Question:**  
The interviewer is testing your understanding of idempotent consumer design. They want to hear you explain that Kafka provides at-least-once delivery by default. Downstream consumers must implement idempotency using unique event IDs or transaction deduplication tables in their local data stores, ensuring that processing the exact same `USER_SIGNED_UP` event multiple times causes no unintended side effects (such as sending duplicate welcome emails or provisioning duplicate billing accounts).

---

### Question 12
**The Question:**  
In `AuthRestV1Router.route()`, the OpenTelemetry span tags the `user.email` attribute if present in the payload. If the incoming sign-in request fails due to an invalid password, why is it dangerous to log or tag the candidate password itself anywhere in spans, logs, or error metadata, and how do you programmatically sanitize request bodies?

**The Meta-Question:**  
The interviewer is evaluating your awareness of sensitive data hygiene and credential leakage. They are checking whether you realize that users frequently mistype their passwords into username fields or vice versa. The logging and tracing pipeline must implement recursive field sanitization that matches an allowlist or redacts sensitive keys like `password`, `secret`, and `token` before serializing spans or logs to persistent observability collectors.

---

### Question 13
**The Question:**  
How does our authentication service handle password migration if we need to upgrade our hashing algorithm or increase Argon2id memory parameters in the future without forcing all users to undergo an inconvenient password reset?

**The Meta-Question:**  
The interviewer is evaluating your experience with credential lifecycle maintenance and algorithm evolution. The expected answer is the **upgrade-on-login pattern**: on every successful sign-in, the system inspects the algorithm version and parameters stored in the crypt string. If the parameters are outdated compared to the current security standard, the plaintext password provided in the login request is immediately re-hashed using the new parameters and saved back to the database transparently.

---

### Question 14
**The Question:**  
During user registration, why do we create both an `auth_users` table row and an `auth_user_organizations` mapping table row instead of simply embedding the `org_id` as a foreign key column directly on the `auth_users` table?

**The Meta-Question:**  
The interviewer is testing your relational data modeling foresight regarding multi-tenancy. They want to see if you recognize that embedding a single `org_id` on the user record locks your data model into a strict 1-to-N relationship, preventing users from ever joining multiple organizations, switching workspaces, or collaborating across enterprise teams without a massive, painful schema refactor.

---

### Question 15
**The Question:**  
In our sign-in flow, how do we distinguish between an authentication failure caused by bad credentials and an account lockout caused by security policy enforcement (such as an administrative block or excessive failed attempts), and why is returning appropriate distinct error codes critical for client applications?

**The Meta-Question:**  
The interviewer is probing your API contract design and user experience architecture. They want to hear that while timing attacks require uniform execution paths for credentials, deliberate policy lockouts (like an admin blocking an account or an adaptive rate limiter triggering) must return explicit, distinct HTTP error codes (`423 Locked` or `403 Forbidden` with machine-readable codes like `ACCOUNT_BLOCKED`) so frontend clients can guide the user to support rather than prompting them to retry passwords fruitlessly.

---

### Question 16
**The Question:**  
Suppose our database client pool size is 20 connections, and our service experiences a surge of 500 concurrent sign-in requests per second. How does the interaction between long Argon2id hashing times in Node.js worker threads and database connection acquisition times lead to cascading request timeouts if connection pooling is not carefully calibrated?

**The Meta-Question:**  
The interviewer is evaluating your understanding of saturation, queuing theory, and resource contention in Node.js microservices. They want to hear that holding database connections open while performing asynchronous crypto operations exhausts the connection pool. The database query should execute quickly to fetch the user hash, the connection should be released immediately back to the pool, and only then should the CPU-bound Argon2id verification execute.

---

### Question 17
**The Question:**  
How does our service prevent credential stuffing and automated bot attacks on the `POST /api/v1/auth/sign-in` endpoint before the expensive Argon2id hashing engine is invoked?

**The Meta-Question:**  
The interviewer is assessing your layered defense-in-depth strategy. They want to ensure you don't rely solely on application password hashing to survive bot attacks. They want to hear about ingress rate limiters, Cloudflare Turnstile/CAPTCHA challenges, and sliding-window IP counters that throttle repeated attempts at the gateway layer before the request ever reaches the CPU-expensive Argon2id engine.

---

### Question 18
**The Question:**  
In ADR 0002, the registration flow creates an organization along with the initial user. How does our architecture assign default role permissions (such as `owner` or `admin`) to this first user, and how does the system prevent non-owners from elevating their permissions during subsequent sign-ins?

**The Meta-Question:**  
The interviewer is testing your Role-Based Access Control (RBAC) foundation. They want to verify that the registration flow automatically binds the first user to the highest immutable role (`owner`) within that organization context, and that all subsequent role evaluations occur via server-side claims validation rather than trusting client-supplied role parameters.

---

### Question 19
**The Question:**  
When generating a JWT, why is the `jti` (JWT ID) claim included in the token payload, and what role does it play in distributed session tracking and single-token revocation?

**The Meta-Question:**  
The interviewer is checking your mastery of token revocation mechanics. They want you to explain that stateless JWTs cannot be revoked individually unless they carry a unique cryptographically random identifier (`jti`). When a user signs out, storing this `jti` in a distributed Redis denylist with an expiration matching the token's remaining TTL allows edge proxies to invalidate that specific session instantly without tracking user state in databases.

---

### Question 20
**The Question:**  
If a user's password contains complex Unicode characters or emojis (e.g., combining accents or multi-byte glyphs), how can differences in client-side text encoding lead to login failures across different devices, and how should an authentication service normalize password inputs?

**The Meta-Question:**  
The interviewer is testing your attention to internationalization edge cases and Unicode normalization standards. They want to hear you explain Unicode Normalization Form C or KC (NFC/NFKC). If a client submits an accented character as a precomposed character on iOS but as decomposed combining characters on Android, the raw byte hashes will not match unless the authentication engine normalizes the string to a consistent Unicode form before hashing.

---

### Question 21
**The Question:**  
In our OpenTelemetry tracing setup, what attributes should be attached to the database client span during user lookup to enable effective query debugging in Tempo without violating database query plan caching?

**The Meta-Question:**  
The interviewer is evaluating your knowledge of OpenTelemetry database semantic conventions. They want to see if you know that spans must record parameterized SQL templates (e.g., `SELECT * FROM auth_users WHERE email = $1`) rather than raw interpolated SQL strings. Interpolating literal email addresses into query strings breaks OpenTelemetry trace grouping, pollutes span attribute indexes, and exposes PII in tracing backends.

---

### Question 22
**The Question:**  
When an authenticated user signs in successfully, why should the application generate a completely fresh JWT session rather than renewing or returning an existing active token?

**The Meta-Question:**  
The interviewer is probing your understanding of session fixation vulnerabilities. They want to hear that re-authenticating must always produce a new cryptographic session token with an updated `jti` and fresh `iat` (issued-at) timestamp. Reusing existing tokens allows attackers who have intercepted an old session to maintain unauthorized access even after legitimate credential validation.

---

### Question 23
**The Question:**  
How does our architecture ensure that password reset flows and initial sign-up verifications cannot be triggered by third parties to flood legitimate user inboxes with spam (known as email bombing or transactional mail denial-of-wallet)?

**The Meta-Question:**  
The interviewer is testing your real-world operational security knowledge regarding transactional notification abuse. They want you to discuss per-email rate limiting, cooldown timers (e.g., maximum 1 reset/verification email per 60 seconds per email), and CAPTCHA thresholds to protect against malicious actors using your sign-up endpoint to harass users or exhaust third-party email sending quotas.

---

### Question 24
**The Question:**  
In our ASCII call stack, `traceHttpMiddleware` starts a root `SERVER` span that encloses the entire request lifecycle. If the Node.js process crashes unexpectedly during password hashing due to an Out-Of-Memory (OOM) error, what happens to this active span, and how does your observability infrastructure detect crashed requests?

**The Meta-Question:**  
The interviewer is assessing your understanding of OpenTelemetry span exporting mechanics and telemetry loss during fatal crashes. They want to hear that in-memory spans that are never ended (`span.end()`) will not be exported by the OTLP batch processor. Detecting these crashes requires external synthetic monitoring, edge proxy access logs (which record 502 Bad Gateway or severed connections), and container restart metrics from Kubernetes (`OOMKilled` events).

---

### Question 25
**The Question:**  
Looking critically at ADR 0002, what is the biggest scalability limitation of handling password hashing, database transactions, audit logging, and Kafka publishing within a single monolithic service process, and how would you evolve this architecture as user sign-ins scale to millions per hour?

**The Meta-Question:**  
The interviewer is testing your high-level architectural vision and scaling capability. The expected staff-level answer identifies the fundamental mismatch between compute-heavy CPU workloads (Argon2id hashing) and I/O-heavy workloads (database reads, Kafka dispatches). As traffic scales, password verification should be isolated into an independently autoscaled compute tier or serverless hashing workers, freeing the API gateway and routing layer to handle millions of low-latency I/O requests without CPU contention.
