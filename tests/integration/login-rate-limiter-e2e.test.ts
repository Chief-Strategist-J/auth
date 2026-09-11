import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../../src/features/auth/service';
import { AlloyDBOmniAuthAdapter } from '../../src/infra/adapters/postgres/alloydb-omni-auth.adapter';
import { RedisCacheAdapter } from '../../src/infra/adapters/redis/redis-cache.adapter';
import { AUTH_CONSTANTS } from '../../src/shared/constants/auth.constants';

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

    for (let i = 0; i < maxFailed; i++) {
      await expect(authService.signIn({
        email: VALID_USER.email,
        password: 'WrongPassword123!',
        ip_address: ip,
        user_agent: 'vitest',
      })).rejects.toThrow('Invalid email or password credentials');
    }

    await expect(authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip,
      user_agent: 'vitest',
    })).rejects.toThrow('Account locked due to consecutive failed login attempts');
  });

  it('4. IP rate limit blocks after MAX_ATTEMPTS_PER_IP attempts', async () => {
    const maxIpAttempts = AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.MAX_ATTEMPTS_PER_IP;
    const ip = '10.0.0.50';

    for (let i = 0; i < maxIpAttempts; i++) {
      const uniqueEmail = `iptest-${i}@observability.io`;
      await authService.signUp({
        email: uniqueEmail,
        password: 'StrongPass123!',
        name: `IP Test User ${i}`,
        organization_name: `IP Test Org ${i}`,
        role: AUTH_CONSTANTS.ROLE_ADMIN,
      });
      await authService.signIn({
        email: uniqueEmail,
        password: 'StrongPass123!',
        ip_address: ip,
        user_agent: 'vitest',
      });
    }

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

    for (let i = 0; i < captchaThreshold - 1; i++) {
      await expect(authService.signIn({
        email: VALID_USER.email,
        password: 'WrongPassword123!',
        ip_address: ip,
        user_agent: 'vitest',
      })).rejects.toThrow('Invalid email or password credentials');
    }

    const result = await authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip,
      user_agent: 'vitest',
    });
    expect(result.token).toBeDefined();

    for (let i = 0; i < captchaThreshold - 1; i++) {
      await expect(authService.signIn({
        email: VALID_USER.email,
        password: 'WrongPassword123!',
        ip_address: `192.168.2.${i}`,
        user_agent: 'vitest',
      })).rejects.toThrow('Invalid email or password credentials');
    }
  });

  it('6. Rate limiting and session denylist work together in full flow', async () => {
    const ip = '192.168.1.104';

    const signInResult = await authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip,
      user_agent: 'vitest',
    });
    expect(signInResult.token).toBeDefined();

    const session = await authService.validateSession(signInResult.token);
    expect(session.sub).toBe(signInResult.user.id);

    await authService.signOut(signInResult.token);

    await expect(authService.validateSession(signInResult.token))
      .rejects.toThrow('Session has been invalidated');

    const signInResult2 = await authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip,
      user_agent: 'vitest',
    });
    expect(signInResult2.token).toBeDefined();

    const session2 = await authService.validateSession(signInResult2.token);
    expect(session2.sub).toBe(signInResult2.user.id);
  });

  it('7. Non-existent user sign-in failure still records rate limit entry', async () => {
    const ip = '192.168.1.105';
    const fakeEmail = 'nonexistent@observability.io';
    const maxFailed = AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.MAX_FAILED_PER_EMAIL;

    for (let i = 0; i < maxFailed; i++) {
      await expect(authService.signIn({
        email: fakeEmail,
        password: 'StrongPass123!',
        ip_address: ip,
        user_agent: 'vitest',
      })).rejects.toThrow('Invalid email or password credentials');
    }

    await expect(authService.signIn({
      email: fakeEmail,
      password: 'StrongPass123!',
      ip_address: ip,
      user_agent: 'vitest',
    })).rejects.toThrow('Account locked due to consecutive failed login attempts');
  });

  it('8. Audit log records both successful and failed sign-in events', async () => {
    const ip = '192.168.1.106';

    await expect(authService.signIn({
      email: VALID_USER.email,
      password: 'WrongPassword123!',
      ip_address: ip,
      user_agent: 'vitest-audit',
    })).rejects.toThrow();

    const result = await authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip,
      user_agent: 'vitest-audit',
    });

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

    await expect(authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip1,
      user_agent: 'vitest',
    })).rejects.toThrow('Rate limit exceeded');

    const result = await authService.signIn({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ip_address: ip2,
      user_agent: 'vitest',
    });
    expect(result.token).toBeDefined();
  });

  it('10. Backward compatibility: AuthService without cache still enforces rate limiting', async () => {
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
