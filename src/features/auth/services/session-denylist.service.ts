import { withSpan } from '../../../infra/tracing/tracer';
import type { ICachePort } from '../../../shared/ports/cache.interface';

export class SessionDenylistService {
  constructor(private readonly cache: ICachePort) {}

  async denyToken(jti: string, ttlMs: number): Promise<void> {
    return withSpan('SessionDenylistService.denyToken', async (span) => {
      span.setAttribute('token.jti', jti);
      await this.cache.set(`denylist:jti:${jti}`, 'true', ttlMs);
    });
  }

  async isTokenDenied(jti: string): Promise<boolean> {
    return withSpan('SessionDenylistService.isTokenDenied', async (span) => {
      span.setAttribute('token.jti', jti);
      return await this.cache.exists(`denylist:jti:${jti}`);
    });
  }
}
