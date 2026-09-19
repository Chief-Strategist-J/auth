# Enterprise Authentication Architecture — Staff & Principal Q&A Master Catalog

This directory hosts an exhaustive, interview-grade architectural Question and Meta-Question catalog corresponding to all 11 Architecture Decision Records (ADRs) within the enterprise authentication platform.

Each document contains a minimum of **25 deeply technical questions and meta-questions** (275 total questions) written entirely in **narrative paragraph format**. They explore operational edge cases, failure modes, trade-off analyses, distributed systems hazards, and cryptographic security invariants.

---

## Category Index

### 1. System Topology, Microkernels & Domain Boundaries
Architecture patterns establishing strict separation of concerns, plugin extensibility, and domain-layer purity.

* **[ADR 0001: Hexagonal Architecture and Rule Engine Router](file:///home/btpl-lap-22/live/llm-obs-node-packages/auth/adr/q&a/0001-hexagonal-architecture-and-rule-engine-router.qa.md)**
  * *Focus*: Ports and adapters isolation, zero-dependency domain models, dynamic router rule engines, context propagation across hexagonal layers, mockability, and boundary enforcement.
  * *Questions*: 25 in-depth technical questions with accompanying meta-questions.

---

### 2. Identity, Registration & Authentication Workflows
Secure credential processing, password hashing economics, authentication state machines, and account onboarding.

* **[ADR 0002: Authentication User Registration and Signin Flow](file:///home/btpl-lap-22/live/llm-obs-node-packages/auth/adr/q&a/0002-authentication-user-registration-and-signin-flow.qa.md)**
  * *Focus*: Argon2id parameters and CPU cost tuning, timing attack defenses, email enumeration prevention, atomic account creation, password reset tokens, and MFA integration.
  * *Questions*: 25 in-depth technical questions with accompanying meta-questions.

---

### 3. Multi-Tenancy, Isolation & Row-Level Security
Tenant boundary enforcement, multi-organization membership, context propagation, and database-level isolation.

* **[ADR 0003: Multi-Tenant Organization Switching and RLS](file:///home/btpl-lap-22/live/llm-obs-node-packages/auth/adr/q&a/0003-multi-tenant-organization-switching-and-rls.qa.md)**
  * *Focus*: PostgreSQL Row-Level Security (`app.current_org_id`), transaction boundary isolation, connection pool contamination prevention, cross-tenant data leakage, and role assignment.
  * *Questions*: 25 in-depth technical questions with accompanying meta-questions.

---

### 4. Distributed Session Management & Revocation Pipelines
High-speed stateless tokens, instant edge invalidation, distributed cache synchronization, and token family governance.

* **[ADR 0004: Session Revocation Redis Token Denylist](file:///home/btpl-lap-22/live/llm-obs-node-packages/auth/adr/q&a/0004-session-revocation-redis-token-denylist.qa.md)**
  * *Focus*: Redis JWT `jti` denylists, TTL-driven cache pruning, distributed cache partitioning, fail-open vs. fail-closed trade-offs, and cluster synchronization.
  * *Questions*: 25 in-depth technical questions with accompanying meta-questions.

* **[ADR 0010: Redis JTI Session Denylist and Adaptive Login Rate Limiting](file:///home/btpl-lap-22/live/llm-obs-node-packages/auth/adr/q&a/0010-redis-jti-session-denylist-and-adaptive-login-rate-limiting.qa.md)**
  * *Focus*: Token family rotation, replay detection, sliding window rate limiters (Lua scripts), credential stuffing mitigation, Redis failover, and tiered authentication penalties.
  * *Questions*: 25 in-depth technical questions with accompanying meta-questions.

---

### 5. Distributed Observability, Tracing Invariants & Middleware
Telemetry collection, context propagation, span hierarchy, and privacy-compliant request tracing.

* **[ADR 0005: OpenTelemetry End-to-End Auth Tracing and Middleware](file:///home/btpl-lap-22/live/llm-obs-node-packages/auth/adr/q&a/0005-opentelemetry-end-to-end-auth-tracing-and-middleware.qa.md)**
  * *Focus*: OpenTelemetry W3C trace context propagation, asynchronous span lifecycle, attribute scrubbing for PII/tokens, sampling strategies, and Prometheus metric correlation.
  * *Questions*: 25 in-depth technical questions with accompanying meta-questions.

---

### 6. Event Streaming & Asynchronous Pipelines
Durable messaging, asynchronous decoupled event publishing, and consumer resilience.

* **[ADR 0006: Kafka Messaging Pipeline and Distributed Tracing](file:///home/btpl-lap-22/live/llm-obs-node-packages/auth/adr/q&a/0006-kafka-messaging-pipeline-and-distributed-tracing.qa.md)**
  * *Focus*: Transactional outbox pattern, partition key strategies, consumer group rebalancing, dead-letter queues, idempotent message processing, and trace context injection.
  * *Questions*: 25 in-depth technical questions with accompanying meta-questions.

---

### 7. Storage Engine & Database Performance
Relational storage optimization, resource contention management, and query efficiency.

* **[ADR 0007: AlloyDB Omni Resource Constraints and OLTP Tuning](file:///home/btpl-lap-22/live/llm-obs-node-packages/auth/adr/q&a/0007-alloydb-omni-resource-constraints-and-oltp-tuning.qa.md)**
  * *Focus*: Buffer pool sizing, connection pool tuning with pgBouncer, index access paths, lock contention, write-ahead log flush throughput, and columnar engine boundaries.
  * *Questions*: 25 in-depth technical questions with accompanying meta-questions.

---

### 8. API Design, Contracts & Envelopes
Predictable client interfaces, schema enforcement, and defensive protocol design.

* **[ADR 0008: Master API Catalog Parameter Contracts and Response Envelopes](file:///home/btpl-lap-22/live/llm-obs-node-packages/auth/adr/q&a/0008-master-api-catalog-parameter-contracts-and-response-envelopes.qa.md)**
  * *Focus*: Strict JSON Schema/Zod validation, uniform API error envelopes, idempotency keys, API versioning strategies, backward compatibility, and client SDK ergonomics.
  * *Questions*: 25 in-depth technical questions with accompanying meta-questions.

---

### 9. Runtime Optimization, Container Hardening & Memory Tuning
Deployment artifacts, Node.js V8 engine constraints, container security, and memory governance.

* **[ADR 0009: Docker Production Image Optimization, Tree Shaking, and V8 Memory Tuning](file:///home/btpl-lap-22/live/llm-obs-node-packages/auth/adr/q&a/0009-docker-production-image-optimization-tree-shaking-and-v8-memory-tuning.qa.md)**
  * *Focus*: Multi-stage container builds, non-root user execution, AST dead-code elimination, V8 heap limits (`--max-old-space-size`), garbage collection overhead, and container signals.
  * *Questions*: 25 in-depth technical questions with accompanying meta-questions.

---

### 10. Machine Credentials, Zero-SDK Mailer & Resilience Pipelines
Machine-to-machine authentication, external service integration, and client-side fault tolerance.

* **[ADR 0011: API Key Engine, TTL Revocation, and Transactional Mailer Architecture](file:///home/btpl-lap-22/live/llm-obs-node-packages/auth/adr/q&a/0011-api-key-engine-ttl-revocation-and-transactional-mailer.qa.md)**
  * *Focus*: Ephemeral 90-day TTL enforcement, constant-time secret comparison, dual-layer instant revocation, zero-SDK AWS SigV4 HMAC-SHA256 signing, RFC 2045 MIME handling, and circuit-broken HTTP pipelines.
  * *Questions*: 25 in-depth technical questions with accompanying meta-questions.

---

## How to Use This Catalog

1. **For System Architects & Interviewers**: Each question is paired with a comprehensive **Meta-Question** revealing the exact architectural competency under evaluation, the subtle traps candidates fall into, and the depth expected of Staff or Principal level candidates.
2. **For Staff Engineers & System Implementers**: Use each question as an operational checklist against code changes to verify that security, reliability, latency, and consistency guarantees remain intact across all auth service components.
