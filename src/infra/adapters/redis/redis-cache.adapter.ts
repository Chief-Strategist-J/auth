/**
 * @file redis-cache.adapter.ts
 * @description In-memory fallback Redis Cache Adapter Re-export from @chief-strategist-j/shared-infra/cache.
 *
 * OVERALL ALGORITHM:
 * 1. Re-export InMemoryCacheAdapter as RedisCacheAdapter for zero-IO unit/integration testing environments.
 */

export { InMemoryCacheAdapter as RedisCacheAdapter } from '@chief-strategist-j/shared-infra/cache';
