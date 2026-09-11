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
});
