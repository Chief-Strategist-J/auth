import { describe, it, expect, beforeEach } from 'vitest';
import { LoginRateLimiterService } from '../../src/features/auth/services/login-rate-limiter.service';
import { AUTH_CONSTANTS } from '../../src/shared/constants/auth.constants';

describe('LoginRateLimiterService', () => {
  let service: LoginRateLimiterService;

  beforeEach(() => {
    service = new LoginRateLimiterService();
  });

  it('should allow login attempt initially', async () => {
    const result = await service.checkLoginAllowed('1.2.3.4', 'test@example.com');
    expect(result.allowed).toBe(true);
  });

  it('should require CAPTCHA after configured failures', async () => {
    const ip = '1.2.3.5';
    const email = 'captcha@example.com';
    const captchaThreshold = AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.EMAIL_CAPTCHA_THRESHOLD;

    for (let i = 0; i < captchaThreshold; i++) {
      await service.recordLoginFailure(ip, email);
    }

    const result = await service.checkLoginAllowed(ip, email);
    expect(result.allowed).toBe(true);
    expect(result.requiresCaptcha).toBe(true);
  });

  it('should lock out account after max failed attempts', async () => {
    const ip = '1.2.3.6';
    const email = 'lockout@example.com';
    const maxAttempts = AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.MAX_FAILED_PER_EMAIL;

    for (let i = 0; i < maxAttempts; i++) {
      await service.recordLoginFailure(ip, email);
    }

    const result = await service.checkLoginAllowed(ip, email);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('ACCOUNT_LOCKED');
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('should block IP after max attempts', async () => {
    const ip = '1.2.3.7';
    const email = 'ip@example.com';
    const maxIpAttempts = AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.MAX_ATTEMPTS_PER_IP;

    for (let i = 0; i < maxIpAttempts; i++) {
      await service.checkLoginAllowed(ip, `user${i}@example.com`);
    }

    const result = await service.checkLoginAllowed(ip, email);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('IP_RATE_LIMIT_EXCEEDED');
  });

  it('should reset failures on success', async () => {
    const ip = '1.2.3.8';
    const email = 'success@example.com';
    
    await service.recordLoginFailure(ip, email);
    await service.recordLoginFailure(ip, email);
    
    await service.recordLoginSuccess(ip, email);
    
    const result = await service.checkLoginAllowed(ip, email);
    expect(result.allowed).toBe(true);
    expect(result.requiresCaptcha).toBeUndefined();
  });

  it('should respect custom injected RateLimitConfig parameters', async () => {
    const customService = new LoginRateLimiterService({
      maxAttemptsPerIp: 2,
      maxFailedPerEmail: 2,
      emailCaptchaThreshold: 1,
    });

    const ip = '1.2.3.99';
    const email = 'custom-cfg@example.com';

    // 1 failure should trigger captcha because threshold is 1
    await customService.recordLoginFailure(ip, email);
    const captchaCheck = await customService.checkLoginAllowed(ip, email);
    expect(captchaCheck.allowed).toBe(true);
    expect(captchaCheck.requiresCaptcha).toBe(true);

    // 2 failures should trigger lockout because maxFailed is 2
    await customService.recordLoginFailure(ip, email);
    const lockoutCheck = await customService.checkLoginAllowed(ip, email);
    expect(lockoutCheck.allowed).toBe(false);
    expect(lockoutCheck.reason).toBe('ACCOUNT_LOCKED');
    expect(lockoutCheck.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('should support distributed cache-backed rate limiting via ICachePort', async () => {
    const mockCache = {
      store: new Map<string, string>(),
      async get(key: string) { return this.store.get(key) ?? null; },
      async set(key: string, value: string) { this.store.set(key, value); },
      async del(key: string) { this.store.delete(key); },
      async exists(key: string) { return this.store.has(key); },
      async incr(key: string) {
        const val = (parseInt(this.store.get(key) || '0', 10)) + 1;
        this.store.set(key, String(val));
        return val;
      },
    };

    const cacheService = new LoginRateLimiterService({ maxAttemptsPerIp: 2 }, mockCache);
    const ip = '10.99.88.77';
    const email = 'distributed@example.com';

    expect((await cacheService.checkLoginAllowed(ip, email)).allowed).toBe(true);
    expect((await cacheService.checkLoginAllowed(ip, email)).allowed).toBe(true);
    
    // 3rd attempt exceeds maxAttemptsPerIp: 2
    const blockedCheck = await cacheService.checkLoginAllowed(ip, email);
    expect(blockedCheck.allowed).toBe(false);
    expect(blockedCheck.reason).toBe('IP_RATE_LIMIT_EXCEEDED');
    expect(blockedCheck.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('should support extensible declarative custom rules via rules engine', async () => {
    const customRuleService = new LoginRateLimiterService(undefined, undefined, [
      {
        id: 'login.rule.block_restricted_subnet',
        name: 'Deny login from prohibited subnet',
        category: 'threat_defense',
        priority: 150,
        effect: 'deny',
        conditions: [
          {
            field: 'ip',
            op: 'starts_with',
            value: '192.168.99.',
          },
        ],
      },
    ]);

    // Request from restricted subnet should be denied by custom rule
    const blockedResult = await customRuleService.checkLoginAllowed('192.168.99.42', 'safe@example.com');
    expect(blockedResult.allowed).toBe(false);

    // Request from allowed subnet should pass
    const allowedResult = await customRuleService.checkLoginAllowed('10.0.0.1', 'safe@example.com');
    expect(allowedResult.allowed).toBe(true);
  });

  it('should support async custom rules (e.g. external threat intel checker)', async () => {
    const threatIntelMock = {
      async isHighRisk(email: string): Promise<boolean> {
        return email.endsWith('@compromised-domain.com');
      },
    };

    const asyncRuleService = new LoginRateLimiterService(undefined, undefined, [
      {
        id: 'login.rule.threat_intel_compromised_domain',
        name: 'Deny logins from compromised email domain via async threat intelligence',
        category: 'threat_defense',
        priority: 120,
        effect: 'deny',
        conditions: [],
        asyncCheck: async (ctx) => {
          return await threatIntelMock.isHighRisk(ctx.email as string);
        },
      },
    ]);

    const blockedResult = await asyncRuleService.checkLoginAllowed('1.2.3.4', 'attacker@compromised-domain.com');
    expect(blockedResult.allowed).toBe(false);

    const allowedResult = await asyncRuleService.checkLoginAllowed('1.2.3.4', 'legit@safe-domain.com');
    expect(allowedResult.allowed).toBe(true);
  });

  it('should allow evaluating arbitrary future conditions via extraContext', async () => {
    const geoService = new LoginRateLimiterService(undefined, undefined, [
      {
        id: 'login.rule.geo_fence_embargo',
        name: 'Deny logins from embargoed countries',
        category: 'geo_compliance',
        priority: 130,
        effect: 'deny',
        conditions: [
          {
            field: 'countryCode',
            op: 'in',
            value: ['KP', 'IR', 'SY'],
          },
        ],
      },
    ]);

    const blockedResult = await geoService.checkLoginAllowed('5.6.7.8', 'user@example.com', {
      countryCode: 'IR',
    });
    expect(blockedResult.allowed).toBe(false);

    const allowedResult = await geoService.checkLoginAllowed('5.6.7.8', 'user@example.com', {
      countryCode: 'US',
    });
    expect(allowedResult.allowed).toBe(true);
  });
});
