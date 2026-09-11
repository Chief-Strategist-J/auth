import { describe, it, expect, beforeEach } from 'vitest';
import { SessionDenylistService } from '../../src/features/auth/services/session-denylist.service';
import { RedisCacheAdapter } from '../../src/infra/adapters/redis/redis-cache.adapter';

describe('SessionDenylistService', () => {
  let cacheAdapter: RedisCacheAdapter;
  let service: SessionDenylistService;

  beforeEach(() => {
    cacheAdapter = new RedisCacheAdapter();
    service = new SessionDenylistService(cacheAdapter);
  });

  it('should deny a token and verify it is denied', async () => {
    await service.denyToken('token-123', 1000);
    const isDenied = await service.isTokenDenied('token-123');
    expect(isDenied).toBe(true);
  });

  it('should return false for a token that is not denied', async () => {
    const isDenied = await service.isTokenDenied('valid-token');
    expect(isDenied).toBe(false);
  });

  it('should allow a token to expire from the denylist', async () => {
    await service.denyToken('temp-token', 50); // 50ms TTL
    let isDenied = await service.isTokenDenied('temp-token');
    expect(isDenied).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 60));

    isDenied = await service.isTokenDenied('temp-token');
    expect(isDenied).toBe(false);
  });
});
