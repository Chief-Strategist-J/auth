# ADR 0004: Redis Token Denylist & Session Lifetime Management — Staff Interview Q&A

This document contains 25 in-depth architectural interview questions and their corresponding meta-questions based on [ADR 0004: Redis Token Denylist & Session Lifetime Management](../0004-session-revocation-redis-token-denylist.md).

---

### Question 1
**The Question:**  
Stateless JSON Web Tokens (JWTs) were originally designed to eliminate centralized session lookups entirely. In ADR 0004, we introduce a distributed Redis Token Denylist that requires querying Redis on every authenticated request. Does introducing a mandatory Redis lookup defeat the fundamental purpose of using stateless JWTs, and why is this hybrid approach superior to traditional stateful session cookies stored in a database?

**The Meta-Question:**  
The interviewer is probing your architectural pragmatism and understanding of real-world security versus textbook purity. They want to see if you can explain the core trade-off: traditional stateful sessions store the entire user payload and require database/cache writes on every login and reads on every request. In our hybrid model, tokens remain cryptographically self-contained, and the cache only stores *revoked* token identifiers (`jti`). Ninety-nine percent of keys are never in Redis, keeping memory consumption near zero while providing instant revocation capabilities that pure stateless JWTs cannot achieve.

---

### Question 2
**The Question:**  
When a user signs out, our service extracts the `exp` (expiration) claim and sets the Redis key `denylist:<jti>` with a TTL equal to `exp - Date.now()`. What would happen to Redis memory utilization if we omitted the TTL, and why is matching the Redis key TTL exactly to the token's remaining lifespan an essential memory-bounding invariant?

**The Meta-Question:**  
The interviewer is evaluating your knowledge of memory management and resource leaks in distributed caches. They want to verify that you understand that once a token's cryptographic expiration timestamp passes, standard JWT signature verification automatically rejects the token, making its presence in the Redis denylist redundant. Setting the Redis TTL to the remaining token lifetime guarantees automatic memory cleanup, preventing Redis from accumulating millions of dead keys over time.

---

### Question 3
**The Question:**  
If our Redis cluster experiences a network partition, total node failure, or reaches maximum memory capacity, how should `handleVerifySession` behave? Should the authentication verification pipeline fail closed (rejecting all requests) or fail open (accepting validly signed JWTs without denylist checks), and how do you justify this decision for an enterprise observability platform?

**The Meta-Question:**  
The interviewer is testing your crisis engineering decision-making and understanding of the CAP theorem applied to authentication. They want to see if you can articulate the business and security implications of both choices. For high-security banking or healthcare platforms, failing closed is mandatory to prevent compromised tokens from executing fraud. For high-throughput observability ingestion, failing closed causes a catastrophic platform-wide outage; an architect might choose a degraded fail-open mode with circuit breakers for read telemetry while failing closed for destructive administrative operations.

---

### Question 4
**The Question:**  
In our sequence diagram, the service calls `GET denylist:<jti>` on every authenticated request. At fifty thousand requests per second, performing a network round-trip to Redis on every API call can introduce noticeable latency and network saturation. How would you optimize the denylist check to achieve sub-millisecond verification while keeping Redis network overhead minimal?

**The Meta-Question:**  
The interviewer is testing your caching optimization and low-latency systems design. They want to hear about **in-memory L1/L2 multi-tier caching**: maintaining a small local in-memory LRU cache or Bloom filter directly inside the Node.js process with a 5-second TTL. Alternatively, deploying Redis Sentinel or Redis Cluster with local read replicas colocated in the same availability zone or container network namespace minimizes cross-rack network hops.

---

### Question 5
**The Question:**  
If an enterprise user clicks "Sign Out of All Devices" or changes their master password, our denylist approach based on individual `jti` values would require revoking dozens of unknown active tokens across multiple browsers and mobile apps. How can we evolve our Redis denylist architecture to support global, user-wide instant session invalidation without having to track every active `jti`?

**The Meta-Question:**  
The interviewer is assessing your ability to design user-level revocation strategies beyond single-token denylists. The expected staff-level pattern is **User Token Versioning** or **Minimum Issued-At Timestamp**:
1. Store a single key in Redis: `user:revoked_before:<user_id> = current_timestamp`.
2. When verifying any JWT, check if the token's `iat` (issued-at) claim is less than `user:revoked_before`.
3. If `iat < revoked_before`, reject the token immediately. This invalidates all historic sessions for that user with a single O(1) key write.

---

### Question 6
**The Question:**  
What Redis eviction policy (`maxmemory-policy`) should be configured on the Redis denylist instance, and what catastrophic security vulnerability occurs if Redis is configured with `allkeys-lru` or `volatile-lru` when memory is exhausted?

**The Meta-Question:**  
The interviewer is testing your deep operational knowledge of Redis memory configurations. They want to see if you spot the vulnerability: if Redis is configured with an LRU eviction policy (`allkeys-lru`), high memory pressure will cause Redis to silently evict older denylist keys. A revoked, stolen token whose denylist entry was evicted will suddenly become valid again! Therefore, an authentication denylist instance must be configured with `noeviction` (which returns errors on writes while keeping existing denylist entries intact) or dedicated memory sizing.

---

### Question 7
**The Question:**  
How does our architecture guarantee that the `jti` claim embedded in our JWTs is cryptographically unguessable and collision-free across millions of generated tokens per day?

**The Meta-Question:**  
The interviewer is checking your random number generation and entropy knowledge. They want to hear that the `jti` must be generated using cryptographically secure pseudorandom number generators (`crypto.randomUUID()` or `crypto.randomBytes(32)`), providing 128 to 256 bits of entropy. Using predictable incremental integers or weak PRNGs allows attackers to guess future `jti` values and pre-emptively deny legitimate user sessions (Denial of Service).

---

### Question 8
**The Question:**  
In a multi-region cloud deployment (e.g., US-East, EU-West, AP-South), how do you replicate the Redis Token Denylist globally so that a sign-out executed in Frankfurt is immediately enforced when the user's mobile app hits an API gateway in Singapore?

**The Meta-Question:**  
The interviewer is evaluating your multi-region distributed systems architecture. They are looking to see if you understand Redis replication across geographic regions. Standard asynchronous primary-replica replication across WAN introduces replication lag (100–300ms). They want to hear about active-active multi-region Redis (such as Redis Enterprise CRDTs or AWS Global Datastore), where writes replicate across regions asynchronously, paired with short token lifetimes so that cross-region windows of vulnerability remain strictly bounded.

---

### Question 9
**The Question:**  
Why do we store the string value `"revoked"` or `"1"` as the Redis key value rather than serializing a complex JSON object containing the user's profile, sign-out reason, and IP address?

**The Meta-Question:**  
The interviewer is testing your memory-efficiency discipline in Redis data modeling. Storing large JSON strings consumes hundreds of bytes per key. Storing a minimal 1-byte value like `"1"` or using a single Redis string allows Redis to allocate minimal memory per key. When dealing with millions of revoked tokens, minimal payload size prevents Redis jemalloc memory fragmentation and maximizes cache capacity.

---

### Question 10
**The Question:**  
If a user's clock on their mobile device or browser is skewed by fifteen minutes into the future, how does clock skew affect the calculation of the Redis denylist TTL (`exp - Date.now()`), and how do you protect against negative or prematurely expiring TTL values?

**The Meta-Question:**  
The interviewer is probing your awareness of distributed time synchronization and clock drift hazards. They want to hear that the server must never calculate TTL based on client-reported timestamps; it must evaluate `exp` against the server's own monotonic, NTP-synchronized system clock (`Date.now()`). Furthermore, if `exp - Date.now() <= 0`, the token is already expired according to the server, so no Redis denylist entry needs to be created.

---

### Question 11
**The Question:**  
Could we implement the token denylist using Redis Sets or Hashes (e.g., `SADD active_denylist <jti>`) instead of individual keys with per-key TTLs, and what are the trade-offs regarding memory and expiration?

**The Meta-Question:**  
The interviewer is testing your knowledge of Redis data structure limitations. In standard Redis, individual elements inside a `Set` or `Hash` cannot have independent TTLs. Using a single `Set` would require a custom background cron or Lua script to scan and prune expired tokens, introducing CPU spikes and complex maintenance. Individual top-level keys with native `EXPIRE` delegate automatic expiration cleanup directly to Redis's internal active/passive expiration algorithms.

---

### Question 12
**The Question:**  
Suppose our service receives thousands of requests per second with expired or malformed JWTs. In what exact order should cryptographic signature verification, expiration check, and Redis denylist check occur to minimize latency and CPU overhead?

**The Meta-Question:**  
The interviewer is evaluating your execution pipeline optimization. The cost of operations is:
1. Header decode & JSON parse: microsecond cost.
2. Expiration check (`exp < now`): single integer comparison (cheapest).
3. Cryptographic signature verification: CPU-bound crypto (~1ms).
4. Redis denylist lookup: I/O network round-trip (~1–2ms).
Checking `exp` first rejects naturally expired tokens in nanoseconds. Checking the cryptographic signature second rejects forged tokens before touching the network. Only valid, unexpired tokens trigger the Redis I/O lookup, protecting Redis from malicious unauthenticated traffic.

---

### Question 13
**The Question:**  
In our Redux-Saga frontend architecture, when `signOutSubmitted` is dispatched, the saga fires the `POST /api/v1/auth/sign-out` request. What should happen if the client is offline or the network request fails? Should the frontend clear its local token and log the user out immediately, or keep the user logged in?

**The Meta-Question:**  
The interviewer is assessing frontend resilient UX and security behavior. They want to hear that from a client perspective, sign-out must always succeed locally (optimistic local logout). The frontend must clear local storage, cookies, and Redux state immediately to prevent local unauthorized access, while queueing a background beacon or acknowledging that the token's server-side validity will expire naturally via its TTL.

---

### Question 14
**The Question:**  
How does our Redis denylist architecture prevent an attacker from executing a Denial-of-Service attack by flooding the `/api/v1/auth/sign-out` endpoint with random fake tokens to fill up Redis memory?

**The Meta-Question:**  
The interviewer is testing your defensive API boundary protection. They want to verify that the `sign-out` endpoint requires valid bearer token authentication. Before writing any key to Redis, the server verifies the token's cryptographic signature. An attacker cannot inject arbitrary random keys into the Redis denylist because fake or forged tokens are rejected during signature verification before any Redis command is issued.

---

### Question 15
**The Question:**  
What OpenTelemetry metrics and alerts should be configured on the Redis denylist integration to detect operational anomalies before they cause user-facing authentication failures?

**The Meta-Question:**  
The interviewer is checking your production SRE observability readiness. Key metrics include:
1. Redis command latency (alerting if p99 exceeds 5ms).
2. Redis connection pool saturation / queue wait time.
3. Cache error rate (tracking failed Redis calls).
4. Denylist hit rate (tracking sudden surges in revoked token usage, which indicates active credential exfiltration).
5. Redis memory usage percentage (`used_memory` vs `maxmemory`).

---

### Question 16
**The Question:**  
When executing automated integration tests for ADR 0004, how do you verify token revocation deterministically without introducing fragile `sleep()` statements while waiting for token expiration?

**The Meta-Question:**  
The interviewer is evaluating your automated testing hygiene. They want to hear that tests should use time-mocking libraries (like Vitest's `vi.useFakeTimers()` or Sinon) to advance virtual time instantly, or generate tokens with ultra-short lifespans (e.g., 100 milliseconds) paired with deterministic Redis `EXISTS` assertions, ensuring fast, non-flaky test suite execution.

---

### Question 17
**The Question:**  
If our application uses both short-lived access tokens (15-minute TTL) and long-lived refresh tokens (7-day TTL), does the Redis denylist need to store revoked access tokens, revoked refresh tokens, or both?

**The Meta-Question:**  
The interviewer is probing your token architecture clarity. They want you to explain that revoking a refresh token prevents obtaining *future* access tokens, but leaves the *current* access token valid for up to 15 minutes. For immediate revocation (e.g., upon suspicious activity), both the access token's `jti` and the refresh token's `jti` must be denied, or the access token TTL must be kept short enough that the 15-minute window is an acceptable security trade-off.

---

### Question 18
**The Question:**  
In high-throughput environments, how can pipelining or Redis connection pooling be tuned in the Node.js `ioredis` or `redis` client to prevent connection exhaustion under high request volume?

**The Meta-Question:**  
The interviewer is assessing your Node.js Redis client performance tuning experience. They want to hear that a single Node.js Redis client multiplexes all commands over a single TCP connection by default. However, under intense workloads, creating a connection pool or utilizing command pipelining for concurrent requests reduces event loop latency and avoids TCP socket buffer saturation.

---

### Question 19
**The Question:**  
What security risks arise if the Redis instance hosting our Token Denylist is shared with application-level caching (e.g., caching database queries or dashboard analytics), and why is dedicated instance isolation recommended?

**The Meta-Question:**  
The interviewer is testing your infrastructure isolation principles. Sharing an authentication security cache with application caching introduces severe risks:
1. A runaway application query cache can exhaust Redis memory, triggering eviction or blocking security checks.
2. A vulnerability in application cache key formatting could allow cache overwrite attacks.
3. Noisy-neighbor latency from large serialized database objects can increase authentication verification latency. Authentication infrastructure must always run on an isolated Redis instance or cluster.

---

### Question 20
**The Question:**  
How does the Redis denylist interact with administrative impersonation tokens? When an administrator ends an impersonation session, how does our system revoke the impersonation token without revoking the administrator's own primary session?

**The Meta-Question:**  
The interviewer is checking your understanding of scoped session independence. They want to hear that the impersonation token possesses its own unique `jti`. When the administrator exits impersonation, only the impersonation token's `jti` is added to the denylist, leaving the administrator's primary session token completely intact and active.

---

### Question 21
**The Question:**  
If a user signs out from a browser with multiple open tabs, how can the frontend coordinate across tabs so that all open tabs transition to the logged-out state immediately without waiting for the user to refresh each tab?

**The Meta-Question:**  
The interviewer is testing your browser cross-tab synchronization knowledge. They want to hear about the `BroadcastChannel` API or `window.addEventListener('storage')`. When tab A signs out, it emits a logout event over the broadcast channel, allowing tabs B and C to immediately clear their in-memory state and redirect to the login screen.

---

### Question 22
**The Question:**  
In our sequence diagram, what happens if an incoming request has a valid signature and passes the Redis check, but the user account was deleted or blocked in the database five minutes ago?

**The Meta-Question:**  
The interviewer is testing your understanding of identity state freshness. They want to hear that stateless tokens verify cryptographic integrity and non-revocation, but cannot detect database user status changes without a database check. To solve this without hitting the database on every request, administrative actions that block or delete a user must publish an event that writes a user-level block entry to Redis (`user:blocked:<user_id>`), allowing edge checks to reject the session.

---

### Question 23
**The Question:**  
How do you monitor and alert on potential Redis denylist bypasses or unauthorized cache flushing (e.g., an engineer or attacker executing `FLUSHALL` or `FLUSHDB`)?

**The Meta-Question:**  
The interviewer is assessing your security auditing and operational hardening for Redis. They want to hear that dangerous commands like `FLUSHALL`, `FLUSHDB`, and `CONFIG` must be disabled or renamed using `rename-command` in `redis.conf`. Additionally, configuring Redis keyspace notifications or monitoring total key count metrics will instantly alert security teams if denylist keys drop to zero unexpectedly.

---

### Question 24
**The Question:**  
Could we use Bloom filters (via RedisBloom) to check for revoked tokens instead of standard string keys, and what are the benefits and critical flaws of using Bloom filters for security revocation?

**The Meta-Question:**  
The interviewer is probing your advanced algorithmic data structures knowledge. A Bloom filter offers massive memory savings and O(1) membership checks. However, Bloom filters suffer from two fatal flaws in this context:
1. False positives: a legitimate user's token might be falsely flagged as revoked, locking them out.
2. Standard Bloom filters cannot delete or expire items when their TTL passes, leading to filter saturation over time unless complex Counting Bloom filters or Scalable Bloom filters are deployed.

---

### Question 25
**The Question:**  
Looking at ADR 0004 as a whole, what is the ultimate architectural evolution of token revocation if an organization grows to hundreds of microservices processing billions of requests globally?

**The Meta-Question:**  
The interviewer is testing your vision for global-scale architecture. The staff-level answer describes moving the denylist check out of application microservices entirely and pushing it to the API Edge/Gateway layer (e.g., Cloudflare Workers, AWS CloudFront Functions, or Envoy edge proxies). The gateway verifies signatures and checks local edge Redis caches before traffic ever touches internal service meshes, completely offloading session verification from backend microservices.
