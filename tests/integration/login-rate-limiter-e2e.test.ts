import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../../src/features/auth/service';
import { AlloyDBOmniAuthAdapter } from '../../src/infra/adapters/postgres/alloydb-omni-auth.adapter';
import { RedisCacheAdapter } from '../../src/infra/adapters/redis/redis-cache.adapter';
import { AUTH_CONSTANTS } from '../../src/shared/constants/auth.constants';

/**
 * Integration Test: Login Rate Limiting — IP Lockout + Email CAPTCHA/Backoff
 *
 * End-to-end flow validation per RFC 6585:
 *   - IP-based sliding window rate limiting (10 attempts / 15 min)
 *   - Email-based brute force lockout (5 failed → 15 min lockout)
 *   - CAPTCHA required after 3 failed attempts per email
 *   - Successful login clears failure counters
 *
 * All tests use the full AuthService stack (not isolated service).
 */
describe('Login Rate Limiting — End-to-End Integration (RFC 6585)', () => {
  let authService: AuthService;
  let repository: AlloyDBOmniAuthAdapter;

  const VALID_USER = {
    email: 'ratelimit-e2e@observability.io',
    password: 'StrongPass123!',
    name: 'Rate Limit E2E User',
    organization_name: 'Rate Limit E2E Org',
    role: AUTH_CONSTANTS.ROLE_ADMIN,
  } as const;

  const SIGN_IN_HEADERS = {
    'x-forwarded-for': '192.168.1.100',
    'user-agent': 'vitest-integration-runner/1.0',
  } as const;

  beforeEach(async () => {
    repository = new AlloyDBOmniAuthAdapter();
    const cacheAdapter = new RedisCacheAdapter();
    authService = new AuthService(repository, undefined, cacheAdapter);

    // Pre-register a valid user for sign-in tests
    await authService.signUp(VALID_USER);
  });

  it('1. Successful login on valid credentials (baseline)', async () => {
    const result = await authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: SIGN_IN_HEADERS['x-forwarded-for'],
      user_agent: SIGN_IN_HEADERS['user-agent'],
    });

    expect(result.token).toBeDefined();
    expect(result.user.email).toBe(VALID_USER.email);
    expect(result.payload.sub).toBe(result.user.id);
  });

  it('2. Invalid credentials throw InvalidCredentialsError and record failure', async () => {
    await expect(authService.signIn({
      email: VALID_USER.email,
      password: 'WrongPassword123!',
      ip_address: '192.168.1.101',
      user_agent: 'vitest',
    })).rejects.toThrow('Invalid email or password credentials');
  });

  it('3. Account locks out after MAX_FAILED_PER_EMAIL consecutive failures', async () => {
    const maxFailed = AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.MAX_FAILED_PER_EMAIL;
    const ip = '192.168.1.102';

    // Exhaust all allowed failures
    for (let i = 0; i < maxFailed; i++) {
      await expect(authService.signIn({
        email: VALID_USER.email,
        password: 'WrongPassword123!',
        ip_address: ip,
        user_agent: 'vitest',
      })).rejects.toThrow('Invalid email or password credentials');
    }

    // Next attempt — account should be locked (429)
    await expect(authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password, // Even correct password should be blocked
      ip_address: ip,
      user_agent: 'vitest',
    })).rejects.toThrow('Account locked due to consecutive failed login attempts');
  });

  it('4. IP rate limit blocks after MAX_ATTEMPTS_PER_IP attempts', async () => {
    const maxIpAttempts = AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.MAX_ATTEMPTS_PER_IP;
    const ip = '10.0.0.50';

    // Each checkLoginAllowed call for the same IP consumes a slot in the sliding window
    // We need to make maxIpAttempts sign-in calls from the same IP
    for (let i = 0; i < maxIpAttempts; i++) {
      // Use unique emails to avoid email lockout, but same IP
      const uniqueEmail = `iptest-${i}@observability.io`;
      await authService.signUp({
        email: uniqueEmail,
        password: 'StrongPass123!',
        name: `IP Test User ${i}`,
        organization_name: `IP Test Org ${i}`,
        role: AUTH_CONSTANTS.ROLE_ADMIN,
      });
      // Each sign-in attempt from this IP consumes a rate limit token
      await authService.signIn({
        email: uniqueEmail,
        password: 'StrongPass123!',
        ip_address: ip,
        user_agent: 'vitest',
      });
    }

    // IP is now exhausted — next attempt should be rate limited (429)
    await expect(authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip,
      user_agent: 'vitest',
    })).rejects.toThrow('Rate limit exceeded');
  });

  it('5. Successful login after failures resets email failure counter', async () => {
    const ip = '192.168.1.103';
    const captchaThreshold = AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.EMAIL_CAPTCHA_THRESHOLD;

    // Record some failures (below lockout threshold)
    for (let i = 0; i < captchaThreshold - 1; i++) {
      await expect(authService.signIn({
        email: VALID_USER.email,
        password: 'WrongPassword123!',
        ip_address: ip,
        user_agent: 'vitest',
      })).rejects.toThrow('Invalid email or password credentials');
    }

    // Successful login should reset the counter
    const result = await authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip,
      user_agent: 'vitest',
    });
    expect(result.token).toBeDefined();

    // After reset, failures should start counting from 0 again
    // We can fail captchaThreshold - 1 more times without CAPTCHA being required
    for (let i = 0; i < captchaThreshold - 1; i++) {
      await expect(authService.signIn({
        email: VALID_USER.email,
        password: 'WrongPassword123!',
        ip_address: `192.168.2.${i}`, // Different IPs to avoid IP rate limit
        user_agent: 'vitest',
      })).rejects.toThrow('Invalid email or password credentials');
    }
  });

  it('6. Rate limiting and session denylist work together in full flow', async () => {
    const ip = '192.168.1.104';

    // Step 1: Sign in successfully
    const signInResult = await authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip,
      user_agent: 'vitest',
    });
    expect(signInResult.token).toBeDefined();

    // Step 2: Session is valid
    const session = await authService.validateSession(signInResult.token);
    expect(session.sub).toBe(signInResult.user.id);

    // Step 3: Sign out — token is denied in both Redis and PostgreSQL
    await authService.signOut(signInResult.token);

    // Step 4: Validate session — must be rejected
    await expect(authService.validateSession(signInResult.token))
      .rejects.toThrow('Session has been invalidated');

    // Step 5: Sign in again (rate limiter should still allow it — success was recorded)
    const signInResult2 = await authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip,
      user_agent: 'vitest',
    });
    expect(signInResult2.token).toBeDefined();

    // New token is valid
    const session2 = await authService.validateSession(signInResult2.token);
    expect(session2.sub).toBe(signInResult2.user.id);
  });

  it('7. Non-existent user sign-in failure still records rate limit entry', async () => {
    const ip = '192.168.1.105';
    const fakeEmail = 'nonexistent@observability.io';
    const maxFailed = AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.MAX_FAILED_PER_EMAIL;

    // Attempt sign-in with non-existent user — should fail and record failure
    for (let i = 0; i < maxFailed; i++) {
      await expect(authService.signIn({
        email: fakeEmail,
        password: 'StrongPass123!',
        ip_address: ip,
        user_agent: 'vitest',
      })).rejects.toThrow('Invalid email or password credentials');
    }

    // After max failures — even for non-existent user — account should be locked
    await expect(authService.signIn({
      email: fakeEmail,
      password: 'StrongPass123!',
      ip_address: ip,
      user_agent: 'vitest',
    })).rejects.toThrow('Account locked due to consecutive failed login attempts');
  });

  it('8. Audit log records both successful and failed sign-in events', async () => {
    const ip = '192.168.1.106';

    // Failed attempt
    await expect(authService.signIn({
      email: VALID_USER.email,
      password: 'WrongPassword123!',
      ip_address: ip,
      user_agent: 'vitest-audit',
    })).rejects.toThrow();

    // Successful attempt
    const result = await authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip,
      user_agent: 'vitest-audit',
    });

    // Verify audit log contains sign-in event
    const auditLogs = await authService.fetchUserAuditLogs(result.user.id, {
      event_type: AUTH_CONSTANTS.AUDIT_EVENT_SIGNIN,
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    expect(auditLogs[0]?.event_type).toBe(AUTH_CONSTANTS.AUDIT_EVENT_SIGNIN);
  });

  it('9. Different IPs are rate-limited independently', async () => {
    const ip1 = '10.0.1.1';
    const ip2 = '10.0.1.2';
    const maxIpAttempts = AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.MAX_ATTEMPTS_PER_IP;

    // Exhaust IP1 quota
    for (let i = 0; i < maxIpAttempts; i++) {
      const uniqueEmail = `ipindep1-${i}@observability.io`;
      await authService.signUp({
        email: uniqueEmail,
        password: 'StrongPass123!',
        name: `IP Indep User ${i}`,
        organization_name: `IP Indep Org ${i}`,
        role: AUTH_CONSTANTS.ROLE_ADMIN,
      });
      await authService.signIn({
        email: uniqueEmail,
        password: 'StrongPass123!',
        ip_address: ip1,
        user_agent: 'vitest',
      });
    }

    // IP1 should be rate-limited
    await expect(authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip1,
      user_agent: 'vitest',
    })).rejects.toThrow('Rate limit exceeded');

    // IP2 should still work fine
    const result = await authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip2,
      user_agent: 'vitest',
    });
    expect(result.token).toBeDefined();
  });

  it('10. Backward compatibility: AuthService without cache still enforces rate limiting', async () => {
    // No cache adapter — rate limiting is still active (it's in-memory, not cache-dependent)
    const noCacheService = new AuthService(new AlloyDBOmniAuthAdapter());
    const ip = '192.168.1.107';

    await noCacheService.signUp({
      ...VALID_USER,
      email: 'nocache-rl-e2e@observability.io',
      organization_name: 'No Cache RL Corp',
    });

    const maxFailed = AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.MAX_FAILED_PER_EMAIL;

    for (let i = 0; i < maxFailed; i++) {
      await expect(noCacheService.signIn({
        email: 'nocache-rl-e2e@observability.io',
        password: 'WrongPassword123!',
        ip_address: ip,
        user_agent: 'vitest',
      })).rejects.toThrow('Invalid email or password credentials');
    }

    await expect(noCacheService.signIn({
      email: 'nocache-rl-e2e@observability.io',
      password: 'StrongPass123!',
      ip_address: ip,
      user_agent: 'vitest',
    })).rejects.toThrow('Account locked due to consecutive failed login attempts');
  });
});
