/**
 * @file real-redis-cache.adapter.ts
 * @description Production Redis Cache Adapter Re-export from @chief-strategist-j/shared-infra/cache.
 *
 * OVERALL ALGORITHM:
 * 1. Re-export RealRedisCacheAdapter implementing ICachePort via ioredis with connection lifecycle management.
 */

export { RealRedisCacheAdapter } from '@chief-strategist-j/shared-infra/cache';
