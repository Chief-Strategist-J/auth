# ADR 0011: API Key Engine, TTL Revocation, and Transactional Mailer Architecture — Interview Q&A

This document provides a comprehensive technical interview catalog for **ADR 0011: API Key Engine, TTL Revocation, and Transactional Mailer Architecture**. It explores ephemeral credential lifecycles, dual-layer distributed revocation, zero-SDK REST mailer pipelines, cryptographic security invariants, and edge resilience patterns.

---

### Question 1

**The Question:** In modern high-throughput API architectures, why is an API key separated into a public key identifier with a recognizable prefix and a cryptographically random secret suffix, and why must only the hashed representation of the secret suffix be persisted in the primary relational database rather than storing the plaintext token or a reversibly encrypted ciphertext?

**The Meta-Question:** The interviewer is evaluating whether you understand fundamental credential storage hygiene and database threat modeling. They want to hear you explain why storing plaintext or reversibly encrypted keys exposes the system to catastrophic compromise in the event of database dumps or read-replica leaks. A strong answer explains that the public prefix allows O(1) B-Tree indexed lookups without computing expensive hashes across the entire table, while one-way hashing (such as SHA-256 or Scrypt) ensures that even with total database exfiltration, attackers cannot forge outbound API calls.

---

### Question 2

**The Question:** How does ADR 0011 enforce a mandatory ephemeral 90-day time-to-live (TTL) on high-privilege secret keys (`ak_sec_`) while allowing configurable or extended lifetimes on publishable keys (`ak_pub_`), and what automated enforcement mechanisms prevent an expired key from remaining valid across distributed cache tiers?

**The Meta-Question:** The interviewer is probing your ability to design time-bounded security credentials and prevent cache desynchronization. They are looking for you to explain how authorization engines validate expiration timestamps at both the primary persistence layer and distributed caching layers, avoiding scenarios where a stale cache entry serves an expired key. A principal engineer will discuss how TTL metadata is encoded into cache keys or payloads, how monotonic clock checks occur on every request evaluation, and how automated pruning or asynchronous sweeps maintain storage hygiene.

---

### Question 3

**The Question:** When an API key is revoked by an administrator or detected as compromised, how does the dual-layer revocation pipeline guarantee immediate global invalidation across distributed edge nodes while maintaining low sub-millisecond authentication latency?

**The Meta-Question:** The interviewer is testing your understanding of cache invalidation versus persistent state updates in distributed systems. They want to see if you can address the inherent trade-off between read latency and revocation propagation speed. The expected answer details how an atomic write marks the database record as revoked while simultaneously publishing a tombstone key to a high-availability Redis cache cluster (`auth:revoked_api_key:{id}`) with an explicit TTL, allowing downstream authenticators to perform an O(1) in-memory denylist check prior to database hits.

---

### Question 4

**The Question:** How does the API key verification engine prevent subtle timing attacks during the validation of incoming secret tokens, and why is native JavaScript string equality (`===`) unacceptable when comparing submitted credentials against database hashes?

**The Meta-Question:** This question assesses your depth in low-level cryptographic engineering and side-channel vulnerability mitigation. The interviewer is checking if you recognize that standard string comparisons terminate early upon encountering the first mismatched character, creating measurable microsecond timing differentials that permit byte-by-byte token brute-forcing. You should explain why `crypto.timingSafeEqual()` on fixed-width buffer allocations is mandatory and how variable-length inputs must be pre-hashed to constant-length digests prior to buffer allocation.

---

### Question 5

**The Question:** Updating telemetry attributes such as `last_used_at_ms` and `last_used_ip` on every authenticated API request causes massive relational database write amplification; how does ADR 0011 decouple high-frequency audit updates from the synchronous request-response critical path?

**The Meta-Question:** The interviewer is examining your ability to identify database write bottlenecks under severe OLTP read loads. They want to hear how you prevent database row locking and write-ahead log saturation when thousands of concurrent requests touch the same API key. A staff-level response details asynchronous telemetry offloading, such as writing access timestamps to an in-memory buffer, Redis hyperloglog, or Kafka topic, and flushing batched upserts to Postgres on a debounced interval.

---

### Question 6

**The Question:** What architectural and operational trade-offs motivated the decision to build a zero-SDK AWS SigV4 HMAC-SHA256 signing pipeline for transactional email delivery over Amazon SES rather than importing the official `@aws-sdk/client-ses` package?

**The Meta-Question:** The interviewer is probing your mastery of container footprint optimization, dependency tree governance, and cold-start latency mitigation. They want to see if you can justify building custom cryptographic signing routines against AWS REST endpoints by demonstrating how omitting massive multi-megabyte SDK dependency trees slashes memory overhead and minimizes container attack surfaces, while acknowledging the maintenance responsibility of upholding canonical request hashing and credential scoping per AWS specifications.

---

### Question 7

**The Question:** How does the `BaseRestMailerAdapter` structure its fail-fast four-stage pipeline during outbound transactional email dispatch, and what mechanisms ensure that template compilation failures or network timeouts do not cause phantom state mutations in the caller's transaction?

**The Meta-Question:** This question evaluates your proficiency in transaction demarcation and pipeline isolation. The interviewer wants to know how you prevent external I/O failures from destabilizing internal domain models. You should walk through the explicit sequence: input validation and schema parsing, deterministic template rendering and MIME composition, circuit breaker-governed HTTP dispatch, and structured outcome emission, emphasizing that all external network calls must occur strictly outside relational database transaction locks.

---

### Question 8

**The Question:** Why does the transactional mailer construct RFC 2045 compliant `multipart/alternative` MIME payloads containing both plaintext and HTML message bodies, and how does this affect deliverability metrics and anti-spam heuristic scoring across major mail transfer agents?

**The Meta-Question:** The interviewer is checking your practical knowledge of email deliverability protocols and compliance requirements. They want to verify that you do not view transactional mail as merely posting an arbitrary HTML string to a third-party endpoint. A complete answer discusses how spam scoring engines penalize HTML-only emails lacking ASCII/UTF-8 plaintext fallback representations, how accessibility tools rely on text representations, and how strict MIME boundary formatting prevents payload truncation in corporate firewalls.

---

### Question 9

**The Question:** Describe the single-use lifecycle of email verification tokens (`evf_...`) and explain how the authentication service prevents race conditions when a user clicks a verification link multiple times simultaneously or when automated security scanners pre-fetch URLs.

**The Meta-Question:** The interviewer is evaluating your defensive design against race conditions, idempotency failures, and non-human HTTP interactions. They are looking for you to explain how atomic state transitions (such as SQL `UPDATE ... WHERE id = :id AND status = 'pending' RETURNING id`) guarantee that exactly one execution thread succeeds in verifying an account, while subsequent requests fail gracefully without invalidating already completed sessions or throwing unhandled exceptions.

---

### Question 10

**The Question:** How does the transactional mailer integrate with the `ScalableHttpClient` eight-step resilience pipeline, and how are HTTP status codes 429 and 503 handled differently from 400 or 401 when communicating with external email providers?

**The Meta-Question:** The interviewer is probing your understanding of adaptive client-side resilience and fault classification. They want you to distinguish transient operational failures from permanent semantic errors. A staff engineer will describe how exponential backoff with full jitter and circuit breakers protect against 429 Too Many Requests and 503 Service Unavailable, whereas 400 Bad Request or 401 Unauthorized errors must fail immediately without retry to avoid worsening rate limits or wasting execution budgets.

---

### Question 11

**The Question:** If the primary Redis cache cluster housing the revoked API key denylist becomes completely partitioned or unavailable, should the authentication middleware fail open (allowing requests to reach Postgres) or fail closed (rejecting all authenticated requests), and how is this decision justified?

**The Meta-Question:** This is a classic availability versus security trade-off question designed to test your threat modeling discipline. The interviewer wants to see if you can evaluate system consequences under catastrophic component failure. In enterprise authentication systems, failing open to the persistent database ensures business continuity provided read-replica capacity is sized to handle the un-cached spike, but if the database is also under duress, a calculated fail-closed stance may be mandatory to prevent unauthorized access via revoked credentials.

---

### Question 12

**The Question:** How does ADR 0011 support zero-downtime blue/green API key rotation for automated CI/CD deployment pipelines without creating windows of authorization failure or requiring simultaneous multi-service configuration deployments?

**The Meta-Question:** The interviewer is testing your real-world experience with machine-to-machine credential lifecycle management. They want to hear about overlapping validity windows. A senior answer describes generating a secondary active key for the service identity, allowing both keys to authenticate concurrently during the rollout window, monitoring access telemetry to confirm the old key is no longer receiving traffic, and subsequently revoking the deprecated key upon deployment verification.

---

### Question 13

**The Question:** Why should rate limiting for API keys be enforced at the individual key identifier level rather than exclusively at the client origin IP address level, and how does this protect multi-tenant infrastructure against distributed credential abuse?

**The Meta-Question:** The interviewer is evaluating your knowledge of identity-aware perimeter defense. They want you to explain that clients operating from shared corporate proxies, cloud environments, or distributed microservice clusters share IP pools, making IP rate limiting either ineffective against botnets or punitive toward legitimate co-located users. Key-based rate limiting isolates tenant consumption quotas regardless of client topology, while IP-based rate limiting remains a fallback against unauthenticated volumetric DDoS attacks.

---

### Question 14

**The Question:** How does the API key engine handle distributed clock skew across edge verification nodes when evaluating the expiration of short-lived tokens, and what threshold of drift tolerance is considered acceptable without compromising security invariants?

**The Meta-Question:** The interviewer is testing your awareness of physical time anomalies in distributed systems. They want to see if you understand that Network Time Protocol (NTP) synchronization can drift by dozens of milliseconds across host instances. A strong answer discusses implementing a small, tightly bounded clock skew tolerance window (e.g., 60 seconds) for expiration boundaries, logging clock anomaly warnings, and ensuring that generation timestamps never accept future dates beyond that narrow margin.

---

### Question 15

**The Question:** What audit logging schema is required when an API key is generated, updated, or revoked, and how does the engine ensure that audit logs cannot be tampered with or accidentally leak credential secret material?

**The Meta-Question:** The interviewer is assessing your knowledge of regulatory compliance (such as SOC 2, ISO 27001, and PCI-DSS) and secure logging practices. They are looking for you to emphasize that secret keys must never appear in log parameters, structured payload metadata, or traces. Only public key identifiers, actor IDs, client IP addresses, and specific scope deltas should be recorded, ideally forwarded to append-only immutable storage pipelines.

---

### Question 16

**The Question:** In user onboarding flows, what are the security and operational trade-offs between sending a magic link containing an embedded verification token versus sending a six-digit numerical one-time passcode (OTP)?

**The Meta-Question:** This question evaluates your ability to balance user experience, channel constraints, and threat vectors. The interviewer expects you to contrast magic link vulnerabilities (such as corporate email link crawlers automatically clicking and consuming tokens, or URL leakage in browser history and referrer headers) against OTP trade-offs (shorter entropy requiring aggressive rate limiting against brute force, yet immunity to pre-fetching crawlers and seamless mobile copy-paste workflows).

---

### Question 17

**The Question:** How does the transactional mailer sanitize dynamic email template variables to prevent template injection, header injection (CRLF attacks), and cross-site scripting in email clients rendering HTML bodies?

**The Meta-Question:** The interviewer is probing your defense-in-depth knowledge regarding email-specific input sanitization. They want to hear how you prevent CRLF (`\r\n`) injection into `To`, `Subject`, or `From` headers which allows attackers to inject arbitrary headers or hijack email routing. Additionally, you should describe context-aware HTML entity encoding in template rendering engines to prevent malicious payloads from executing in webmail interfaces.

---

### Question 18

**The Question:** What measures prevent malicious actors from performing brute-force enumeration attacks against public API key identifiers (`ak_pub_...` or `ak_sec_...`), and how does the authentication response prevent leakage of whether an identifier exists in the database?

**The Meta-Question:** The interviewer is evaluating your resistance to user and credential enumeration attacks. They want you to explain that high-entropy random generation (e.g., 128-bit cryptographically secure random bytes formatted with base62 or hex encoding) renders computational brute-forcing statistically impossible, and that verification failure responses must return generic unauthorized errors with identical status codes and uniform timing profiles regardless of whether the key ID was missing, revoked, or presented with an invalid secret.

---

### Question 19

**The Question:** How does the API key authorization model enforce fine-grained, least-privilege scoping across disparate microservices, and how does the engine evaluate whether an API key possesses permission to invoke a specific REST endpoint?

**The Meta-Question:** The interviewer is examining your understanding of authorization delegation and Role-Based/Attribute-Based Access Control (RBAC/ABAC). They want to know how scope strings (such as `telemetry:write`, `models:read`, `admin:*`) are structured, stored, and validated. A staff response discusses matching incoming route intents against cached key scope arrays using deterministic hierarchical matching rules, ensuring that broad administrative keys cannot be generated by standard tenants.

---

### Question 20

**The Question:** When an external transactional email provider webhook fires to report a delivery bounce, spam complaint, or open tracking event, how does the system authenticate the webhook payload to prevent replay and forgery attacks?

**The Meta-Question:** The interviewer is testing your implementation of secure asynchronous webhook ingestion. They want to hear about HMAC signature verification using a shared webhook secret, timestamp validation within a narrow tolerance window to prevent replay attacks, and recording processed webhook event IDs in an idempotent deduplication table before triggering downstream user state changes.

---

### Question 21

**The Question:** How does ADR 0011 manage the lifecycle and eventual cleanup of millions of expired API keys, consumed email verification tokens, and associated audit logs without causing blocking table locks or degradation of active OLTP queries?

**The Meta-Question:** The interviewer is probing your experience with database garbage collection and high-volume table maintenance. They want to hear you describe partitioning strategies (such as range partitioning by creation date), asynchronous chunked deletion jobs utilizing indexed ranges with explicit batch limits and pauses, or archiving cold data to object storage (such as S3 or Cloud Storage) rather than running unindexed, bulk `DELETE` queries on active tables.

---

### Question 22

**The Question:** How does the elimination of third-party cloud SDKs affect connection pooling and cold-start latency in serverless or auto-scaled container environments, and what custom HTTP agent configurations are essential to maintain socket reuse?

**The Meta-Question:** This question assesses your low-level networking knowledge within Node.js runtimes. The interviewer is checking whether you understand that omitting monolithic SDKs reduces JavaScript parsing and compilation times during container cold starts, and that custom HTTP/HTTPS clients must explicitly configure persistent `Keep-Alive` agent pools with appropriate socket timeouts to prevent renegotiating TLS handshakes on every outbound transactional email or cloud API call.

---

### Question 23

**The Question:** How does the transactional mailer mitigate Server-Side Request Forgery (SSRF) vulnerabilities if tenant configurations allow specifying custom SMTP relay endpoints or webhook notification targets?

**The Meta-Question:** The interviewer is evaluating your defense against internal network reconnaissance and cloud metadata service exploitation. They want to hear how you implement strict egress IP address validation: resolving destination hostnames, blocking private RFC 1918 subnets, loopback addresses (`127.0.0.1`), link-local metadata addresses (`169.254.169.254`), and enforcing allowlists before initiating outbound HTTP or SMTP sockets.

---

### Question 24

**The Question:** What OpenTelemetry metrics, span attributes, and distributed trace contexts must be captured across the API key verification engine and transactional mailer to diagnose latency degradation and deliverability regressions in production?

**The Meta-Question:** The interviewer is testing your commitment to production observability and telemetry instrumentation. A senior engineer will identify key metrics such as API key verification latency percentiles (p50, p95, p99), cache hit/miss ratios on revocation lookups, mailer dispatch durations, and delivery failure rates categorized by provider error codes, while ensuring trace spans redact sensitive payload fields and propagate W3C `traceparent` headers to downstream services.

---

### Question 25

**The Question:** If an organization's primary transactional mail provider experiences an unannounced global outage during peak registration hours, how does the system ensure zero registration dropped requests without causing catastrophic unbounded memory queue growth in the authentication service?

**The Meta-Question:** The interviewer is testing your architectural resilience and disaster recovery strategy. They want to see how you combine graceful degradation with persistent asynchronous buffering. A staff response outlines routing outbound emails through an event-driven outbox pattern or durable message queue (such as Kafka or RabbitMQ) with persistent dead-letter storage, triggering automatic fallback to a secondary configured mail provider (e.g., SendGrid to AWS SES) via circuit breaker state changes, while immediately acknowledging the user registration HTTP call with instructions to check their inbox shortly.
