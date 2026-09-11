import { withSpan } from '../../../infra/tracing/tracer';
import type { ICachePort } from '../../../shared/ports/cache.interface';

export class SessionDenylistService {
  constructor(private readonly cache: ICachePort) {}

  /**
   * Adds a token JTI to the denylist
   * @param jti Token ID
   * @param ttlMs Time to live in milliseconds
   */
  async denyToken(jti: string, ttlMs: number): Promise<void> {
    return withSpan('SessionDenylistService.denyToken', async (span) => {
      span.setAttribute('token.jti', jti);
      await this.cache.set(`denylist:jti:${jti}`, 'true', ttlMs);
    });
  }

  /**
   * Checks if a token JTI is denylisted
   * @param jti Token ID
   */
  async isTokenDenied(jti: string): Promise<boolean> {
    return withSpan('SessionDenylistService.isTokenDenied', async (span) => {
      span.setAttribute('token.jti', jti);
      return await this.cache.exists(`denylist:jti:${jti}`);
    });
  }
}
