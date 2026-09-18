import { describe, it, expect, vi } from 'vitest';
import { RealRedisCacheAdapter } from '../../src/infra/adapters/redis/real-redis-cache.adapter';

describe('RealRedisCacheAdapter — Unit Tests', () => {
  it('should instantiate successfully with custom Redis URL', () => {
    const adapter = new RealRedisCacheAdapter('redis://127.0.0.1:6379/1');
    expect(adapter).toBeDefined();
    expect(typeof adapter.get).toBe('function');
    expect(typeof adapter.set).toBe('function');
    expect(typeof adapter.del).toBe('function');
    expect(typeof adapter.exists).toBe('function');
    expect(typeof adapter.incr).toBe('function');
    adapter.disconnect();
  });

  it('should handle set and get delegation through Redis client interface', async () => {
    const adapter = new RealRedisCacheAdapter('redis://127.0.0.1:6379/1');
    
    // Mock internal client methods to test unit logic without needing live server
    const client = (adapter as any).client;
    const mockStore = new Map<string, string>();
    vi.spyOn(client, 'connect').mockResolvedValue(undefined);
    vi.spyOn(client, 'get').mockImplementation(async (...args: any[]) => mockStore.get(args[0] as string) ?? null);
    vi.spyOn(client, 'set').mockImplementation(async (...args: any[]) => {
      mockStore.set(args[0] as string, args[1] as string);
      return 'OK';
    });
    vi.spyOn(client, 'exists').mockImplementation(async (...args: any[]) => (mockStore.has(args[0] as string) ? 1 : 0));
    vi.spyOn(client, 'del').mockImplementation(async (...args: any[]) => {
      mockStore.delete(args[0] as string);
      return 1;
    });

    await adapter.set('auth:denylist:test-token', 'revoked', 5000);
    const exists = await adapter.exists('auth:denylist:test-token');
    expect(exists).toBe(true);

    const val = await adapter.get('auth:denylist:test-token');
    expect(val).toBe('revoked');

    await adapter.del('auth:denylist:test-token');
    const afterDel = await adapter.exists('auth:denylist:test-token');
    expect(afterDel).toBe(false);

    await adapter.disconnect();
  });
});
