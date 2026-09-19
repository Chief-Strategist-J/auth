# ADR 0001: Hexagonal Architecture & Declarative Rule Engine Router — Staff Interview Q&A

This document contains 25 in-depth architectural interview questions and their corresponding meta-questions (the hidden traps, architectural signals, and criteria evaluated by interviewers) based on [ADR 0001: Hexagonal Architecture & Declarative Rule Engine Router](../0001-hexagonal-architecture-and-rule-engine-router.md).

---

### Question 1
**The Question:**  
In our authentication microservice, we deliberately avoided traditional HTTP routing frameworks like Express, Fastify, or NestJS in favor of a custom, declarative `ROUTE_RULES` table executed inside a raw Node.js HTTP server. What architectural trade-offs, performance advantages, and maintenance challenges emerge when implementing a zero-dependency, table-driven rule router compared to using a production-grade routing framework?

**The Meta-Question:**  
The interviewer is evaluating whether you can critically evaluate framework dependencies versus custom engine implementations without dogmatism. They want to see if you understand how middleware chains in frameworks like Express introduce hidden allocation overhead, unoptimized prototype lookups, and regex recompilations on every route evaluation. They are also testing whether you recognize the maintenance liability of maintaining a custom router, such as handling URI decoding, edge-case path normalization, and security vulnerability scanning.

---

### Question 2
**The Question:**  
The Hexagonal Architecture mandates that our domain layer (`AuthService` and domain services) must remain entirely decoupled from the delivery layer. In TypeScript, how do you enforce at compile time and CI linting time that HTTP headers, request bodies, query strings, and response objects never leak past the router boundary into core domain methods?

**The Meta-Question:**  
The interviewer is testing your ability to establish hard architectural boundaries using automated tooling rather than relying solely on developer discipline or code reviews. They want to hear about architectural linters such as `eslint-plugin-boundaries`, custom TypeScript project references, or strict dependency matrices that prevent domain packages from importing HTTP transport types, thereby preserving hexagonal purity and enabling unit testing without mocking HTTP frameworks.

---

### Question 3
**The Question:**  
Our `ROUTE_RULES` table pairs each route declaration with pre-compiled regular expressions for path matching. When operating at thousands of requests per second with hundreds of potential endpoints, what algorithmic complexity challenges arise from linear array scanning of regex routes, and how would you optimize path matching if the route table scales significantly?

**The Meta-Question:**  
The interviewer is probing your algorithmic systems knowledge beyond basic array iteration. They want to know if you recognize that scanning an array of $O(N)$ regular expressions introduces CPU latency under high traffic. They are testing whether you can propose radix tree (trie) routing, hash-map lookups for static routes, or separate trees partitioned by HTTP method, demonstrating that you understand how high-performance routers like Fastify and Radix3 achieve $O(K)$ matching time where $K$ is URL depth.

---

### Question 4
**The Question:**  
In our request pipeline, `traceHttpMiddleware` wraps the entire request lifecycle and extracts the W3C `traceparent` header before the router evaluates any rules. If an incoming HTTP request contains a malformed or corrupted `traceparent` header, how should your tracing middleware respond to preserve distributed tracing continuity without crashing the process or rejecting legitimate customer traffic?

**The Meta-Question:**  
The interviewer is assessing your knowledge of the W3C Trace Context specification (RFC 3751) and distributed observability resilience. They are checking whether you realize that rejecting requests due to malformed tracing headers is an anti-pattern that causes availability outages. They want to hear that a compliant implementation should gracefully restart the trace context by creating a brand-new root trace ID while logging a debug-level warning and continuing the HTTP dispatch seamlessly.

---

### Question 5
**The Question:**  
Our router architecture executes a session verification step (`handleVerifySession`) directly inside the router engine whenever a matched rule specifies `authRequired: true`. How does embedding authentication enforcement into the routing engine compare with using composable middleware functions, and what are the implications for routes that require optional or conditional authentication?

**The Meta-Question:**  
The interviewer is examining your ability to compare centralized declarative routing gates against modular interceptor pipelines. They want to see if you recognize that hardcoding `authRequired: true` as a binary flag limits flexibility for endpoints that support dual modes (such as anonymous reads with elevated data for authenticated users), and whether you can evolve the declarative rule schema into a strategy-based evaluator supporting `public`, `optional`, or `scoped` credentials.

---

### Question 6
**The Question:**  
When an unhandled exception or database failure occurs inside a domain handler, the router catches the error and wraps it into a standardized JSON response envelope. What specific error categorization and sanitization mechanisms must you implement at the router boundary to ensure sensitive stack traces and database internal error codes never leak to external clients while remaining fully observable to internal engineers?

**The Meta-Question:**  
The interviewer is evaluating your defensive security posture and understanding of OWASP API Security guidelines regarding information leakage. They want to hear you describe an explicit separation between domain-level typed application errors (with public HTTP status codes and machine-readable error codes) and unexpected infrastructure exceptions (which must be masked behind generic 500 envelopes externally while recording full stack traces and correlation IDs in OpenTelemetry spans).

---

### Question 7
**The Question:**  
Our service establishes CORS handling with `Access-Control-Allow-Headers: *` on wildcard preflight options requests. While this ensures that custom OpenTelemetry headers like `traceparent` and `x-request-id` are never blocked by browsers, what security risks does a permissive CORS header wildcard introduce in a production environment with authenticated cookies?

**The Meta-Question:**  
The interviewer is testing your understanding of browser security models, specifically W3C CORS specifications regarding credentialed requests. They are looking to see if you immediately spot the critical browser invariant: the W3C spec strictly prohibits combining `Access-Control-Allow-Origin: *` or wildcard headers with `Access-Control-Allow-Credentials: true`. If authenticated sessions rely on `HttpOnly` cookies, wildcard origins are rejected by browsers, requiring an explicit origin allowlist.

---

### Question 8
**The Question:**  
In Hexagonal Architecture, persistence is abstracted behind `AuthRepositoryPort`. If we decide to swap our current PostgreSQL implementation (`RealPostgresAuthAdapter`) for an in-memory repository during local testing, or a CockroachDB adapter for multi-region active-active deployments, what architectural guarantees ensure that our business transactions and rollbacks remain atomic without tying the domain to SQL syntax?

**The Meta-Question:**  
The interviewer is probing your mastery of the Unit of Work and Repository patterns in clean architecture. They are testing whether you understand how database transactions leak into domain logic if not carefully abstracted. They want to hear how you design a transaction runner or context port that allows domain services to demarcate transactional boundaries while delegating connection pooling, commit, and rollback semantics entirely to the underlying adapter.

---

### Question 9
**The Question:**  
Our router creates an `INTERNAL` span tagged with `user.email` and `x-request-id` before invoking the route handler. Under GDPR Article 4 and strict data residency regulations, storing cleartext email addresses in distributed tracing backends like Grafana Tempo or Jaeger violates compliance policies. How would you adjust this tracing instrumentation to maintain correlation capabilities while eliminating PII exposure?

**The Meta-Question:**  
The interviewer is assessing whether you consider privacy compliance and data residency during systems design. They want to see if you recognize that distributed traces are frequently indexed and exported across regions, making cleartext PII a severe compliance breach. They are looking for solutions such as computing a salted cryptographic HMAC-SHA256 hash of the user identity for span attributes or relying exclusively on opaque UUIDs like `user.id`.

---

### Question 10
**The Question:**  
Because our server uses a single Node.js `http.createServer` instance, handling incoming JSON bodies requires buffering raw byte chunks from the request stream. If an attacker sends a malicious HTTP POST request with a declared `Content-Length` of ten gigabytes or streams endless chunks without closing the connection, how does our raw router protect against event-loop starvation and memory exhaustion?

**The Meta-Question:**  
The interviewer is testing your understanding of Node.js stream mechanics, backpressure, and low-level Denial of Service (DoS) attack vectors. They are checking whether you know how to enforce an immediate byte-count limit during stream chunk accumulation, destroy the incoming socket as soon as the payload exceeds a maximum threshold (e.g., 1MB), and configure request timeouts to prevent Slowloris attacks.

---

### Question 11
**The Question:**  
In our router rules, path parameters like `/api/v1/auth/users/:id` are extracted using captured regular expression groups. How do you design the parameter extraction utility to prevent prototype pollution or parameter hijacking if a client submits URL-encoded characters, malicious keys, or duplicated query strings?

**The Meta-Question:**  
The interviewer is evaluating your knowledge of Node.js JavaScript engine vulnerabilities, specifically prototype pollution and parameter parsing attacks. They want to hear that path parameter objects must be instantiated using `Object.create(null)` rather than plain object literals `{}` to eliminate inherited `__proto__` properties, and that extracted values must pass through strict schema validation (such as Zod or compiled type guards) before reaching domain services.

---

### Question 12
**The Question:**  
How does declarative routing via a static `ROUTE_RULES` configuration table simplify automated test generation, contract verification, and OpenAPI specification generation compared to imperative route registration?

**The Meta-Question:**  
The interviewer is probing your developer experience (DX) and automated tooling architecture skills. They want to see if you realize that treating routes as static data structures allows you to iterate over the entire routing table programmatically to generate Swagger/OpenAPI documentation, generate mock test suites, and verify contract parity without spinning up a live network server.

---

### Question 13
**The Question:**  
Our hexagonal design defines secondary adapters for Kafka event publishing and OpenTelemetry span export. If the Kafka broker becomes unreachable or experiences severe backpressure during user authentication, how does the hexagonal architecture isolate this messaging failure to prevent blocking the HTTP sign-in response?

**The Meta-Question:**  
The interviewer is testing your grasp of fault tolerance, bounded contexts, and asynchronous failure decoupling. They want to hear whether you know how to implement an in-memory outbox or local buffer so that messaging failures do not degrade core authentication availability, ensuring that secondary adapter failures never compromise primary user transactions.

---

### Question 14
**The Question:**  
Why does the `AuthRestV1Router` design instantiate route handlers as pure functions accepting a context object `(ctx, session)` rather than binding them to class instances with mutable `this` context?

**The Meta-Question:**  
The interviewer is assessing your functional programming principles and understanding of concurrent state safety in Node.js. They want to verify that you understand that mutable instance properties in singleton class handlers cause dangerous request cross-contamination in asynchronous runtimes, whereas pure functions taking an explicit request context guarantee thread-safe, stateless execution.

---

### Question 15
**The Question:**  
In our sequence diagram, database operations within the domain are instrumented with OpenTelemetry spans of kind `CLIENT` (`SpanKind.CLIENT`). Why is distinguishing between `SERVER`, `INTERNAL`, and `CLIENT` span kinds critical when analyzing distributed service graphs and trace waterfalls in Grafana Tempo?

**The Meta-Question:**  
The interviewer is testing your depth in distributed systems observability and OpenTelemetry semantic conventions. They want to ensure you know that tracing backends use `SpanKind.CLIENT` and `SpanKind.SERVER` to compute service dependency maps, measure network edge latency between microservices, and differentiate application internal execution time from downstream database wait times.

---

### Question 16
**The Question:**  
If a route handler in our system needs to call multiple secondary adapters in parallel (such as verifying a token in Redis while looking up user metadata in PostgreSQL), how does the domain service coordinate these concurrent operations without leaking adapter-specific concurrency primitives or thread locks into the domain layer?

**The Meta-Question:**  
The interviewer is checking your ability to manage asynchronous concurrency within clean architecture. They are testing whether you use standard language concurrency mechanisms like `Promise.all` or structured concurrency libraries within the domain service, while keeping the ports strictly focused on returning typed domain models.

---

### Question 17
**The Question:**  
Our router extracts `x-request-id` and `x-correlation-id` from incoming request headers. If these headers are missing, how should the router generate them, and how are they propagated across downstream database queries, log formatters, and Kafka messages?

**The Meta-Question:**  
The interviewer is assessing your understanding of distributed correlation context propagation. They want to hear that missing request IDs must be generated immediately at the edge using cryptographically secure UUIDv4 or ULID, attached to the request context, injected into SQL comments for database log tracing, and serialized into Kafka message headers to preserve cross-system auditability.

---

### Question 18
**The Question:**  
When designing domain exceptions in our Hexagonal Architecture, why is it considered an architectural anti-pattern for domain errors to define HTTP status codes like 404 or 401 directly inside their error classes?

**The Meta-Question:**  
The interviewer is probing your understanding of boundary separation and protocol independence. They want to see if you understand that domain errors must describe business reality (e.g., `UserNotFoundError` or `InvalidCredentialsError`). Assigning HTTP status codes inside the domain couples it to the HTTP protocol, preventing the domain from being reused in gRPC, CLI, or message queue consumers. The translation from domain error to HTTP status must occur solely in the router's error mapper.

---

### Question 19
**The Question:**  
How does our declarative rule router facilitate canary routing, feature flagging, and route deprecation headers (`Deprecation` and `Sunset` RFC 8594) compared to modifying individual handler files?

**The Meta-Question:**  
The interviewer is evaluating your experience with API lifecycle governance at scale. They want to hear how static route metadata enables attaching operational policies—such as sunset timestamps or feature flag keys—directly to the route definition row, allowing the router to automatically emit deprecation headers or divert a percentage of traffic without touching business logic.

---

### Question 20
**The Question:**  
Suppose an attacker discovers a path traversal flaw by submitting encoded dot-segments like `/api/v1/auth/users/..%2fadmin`. How does our rule engine route matcher sanitize and normalize request paths before evaluating regex matches to prevent path traversal bypasses?

**The Meta-Question:**  
The interviewer is testing your API security knowledge regarding URL parsing evasion techniques. They want to verify that you know incoming paths must be decoded and passed through path normalization (such as POSIX path normalization) prior to route matching, preventing directory traversal and regex bypasses that exploit differences between gateway routing and service routing.

---

### Question 21
**The Question:**  
In our Hexagonal Architecture, how do we handle dependency injection for domain services and infrastructure adapters to ensure high testability without introducing heavy runtime reflection frameworks like InversifyJS?

**The Meta-Question:**  
The interviewer is assessing your pragmatic approach to dependency injection in modern TypeScript. They want to see if you favor simple, lightweight factory functions or composition roots (`registerEntity` or manual constructor injection) over complex, runtime-heavy reflection libraries that inflate startup time, degrade bundle size, and break tree-shaking.

---

### Question 22
**The Question:**  
When handling high-concurrency workloads, how does the Node.js event loop behavior differ when using our table-driven router versus frameworks that rely heavily on deeply nested middleware callbacks and promises?

**The Meta-Question:**  
The interviewer is evaluating your understanding of V8 internal execution, microtask queue scheduling, and asynchronous call stacks. They want to hear you explain that flat, iterative table lookups execute synchronously within the current tick of the event loop, avoiding microtask queue thrashing and promise chain allocations that degrade V8 garbage collection under heavy load.

---

### Question 23
**The Question:**  
If a downstream microservice needs to consume authentication capabilities via gRPC or WebSockets instead of REST, how does our Hexagonal Architecture accommodate these new transport protocols alongside our existing `AuthRestV1Router`?

**The Meta-Question:**  
The interviewer is verifying that you truly understand the primary benefit of Ports and Adapters: multiple primary (driving) adapters. They want you to explain that a gRPC server or WebSocket gateway is simply another driving adapter that parses incoming protocol buffers or socket frames and calls the exact same `AuthService` domain methods without changing a single line of business logic.

---

### Question 24
**The Question:**  
In our sequence diagram, the router tags the current OpenTelemetry span with `SpanStatus.ERROR` whenever validation or authentication fails. How do you distinguish between client-side user errors (like invalid passwords, which are expected operational occurrences) and system-level crashes to prevent polluting SLO and error budget alerting in Grafana?

**The Meta-Question:**  
The interviewer is testing your understanding of Site Reliability Engineering (SRE) principles, Service Level Objectives (SLOs), and alert fatigue. They want to hear you explain that 4xx client errors should record an exception attribute or specific status on the span for debugging, but should not mark the span status as an unhandled infrastructure error that trips production error rate alerts.

---

### Question 25
**The Question:**  
Looking at the overall architecture of ADR 0001, what is the single biggest architectural risk of maintaining an in-house declarative rule engine router, and under what organizational or technical conditions would you recommend migrating to a standardized community framework like Fastify?

**The Meta-Question:**  
The interviewer is looking for engineering maturity, self-awareness, and pragmatism. They are evaluating whether you can recognize the limits of custom tooling. The expected signal is that as the engineering team scales to dozens of developers and hundreds of routes, the burden of maintaining custom routing, HTTP parsing edge cases, community plugin ecosystems, and security audits outweighs the marginal performance gains of an in-house router, making a migration to a high-performance, well-maintained framework like Fastify the prudent architectural decision.
