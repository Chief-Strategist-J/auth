import { withSpan } from '../../../infra/tracing/tracer';
import { AUTH_CONSTANTS } from '../../../shared/constants/auth.constants';

export class LoginRateLimiterService {
  private readonly failedAttempts = new Map<string, { count: number; lockedUntilMs: number }>();
  private readonly rateLimitMap = new Map<string, number[]>();

  public async checkLoginAllowed(ip: string, email: string): Promise<{ allowed: boolean; reason?: string; retryAfterMs?: number; requiresCaptcha?: boolean }> {
    return withSpan('LoginRateLimiterService.checkLoginAllowed', async (span) => {
      span.setAttribute('ip', ip);
      span.setAttribute('email', email);

      const now = Date.now();
      const windowMs = AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.IP_WINDOW_MS;
      const maxAttempts = AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.MAX_ATTEMPTS_PER_IP;

      const ipTimestamps = (this.rateLimitMap.get(ip) ?? []).filter((t) => now - t < windowMs);
      
      if (ipTimestamps.length >= maxAttempts) {
        return { allowed: false, reason: 'IP_RATE_LIMIT_EXCEEDED' };
      }
      ipTimestamps.push(now);
      this.rateLimitMap.set(ip, ipTimestamps);

      const record = this.failedAttempts.get(email);
      if (record) {
        if (now < record.lockedUntilMs) {
          return { allowed: false, reason: 'ACCOUNT_LOCKED', retryAfterMs: record.lockedUntilMs - now };
        } else if (record.lockedUntilMs > 0) {
          this.failedAttempts.delete(email);
        } else {
          const requiresCaptcha = record.count >= AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.EMAIL_CAPTCHA_THRESHOLD;
          if (requiresCaptcha) {
             return { allowed: true, requiresCaptcha: true };
          }
        }
      }

      return { allowed: true };
    });
  }

  public async recordLoginSuccess(ip: string, email: string): Promise<void> {
    return withSpan('LoginRateLimiterService.recordLoginSuccess', async (span) => {
      span.setAttribute('ip', ip);
      span.setAttribute('email', email);
      this.failedAttempts.delete(email);
    });
  }

  public async recordLoginFailure(ip: string, email: string): Promise<void> {
    return withSpan('LoginRateLimiterService.recordLoginFailure', async (span) => {
      span.setAttribute('ip', ip);
      span.setAttribute('email', email);
      
      const record = this.failedAttempts.get(email) ?? { count: 0, lockedUntilMs: 0 };
      record.count += 1;
      
      if (record.count >= AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.MAX_FAILED_PER_EMAIL) {
        record.lockedUntilMs = Date.now() + AUTH_CONSTANTS.SECURITY_CONFIG.RATE_LIMIT.EMAIL_LOCKOUT_MS;
      }
      
      this.failedAttempts.set(email, record);
    });
  }
}
