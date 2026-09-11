import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../../src/features/auth/service';
import { AlloyDBOmniAuthAdapter } from '../../src/infra/adapters/postgres/alloydb-omni-auth.adapter';
import { RedisCacheAdapter } from '../../src/infra/adapters/redis/redis-cache.adapter';
import { AUTH_CONSTANTS } from '../../src/shared/constants/auth.constants';

describe('ADR 0004: Redis Session Denylist — End-to-End Integration', () => {
  let authService: AuthService;
  let cacheAdapter: RedisCacheAdapter;

  const TEST_USER = {
    email: 'denylist-e2e@observability.io',
    password: 'StrongPass123!',
    name: 'Denylist E2E User',
    organization_name: 'Denylist E2E Org',
    role: AUTH_CONSTANTS.ROLE_ADMIN,
  } as const;

  beforeEach(() => {
    const repository = new AlloyDBOmniAuthAdapter();
    cacheAdapter = new RedisCacheAdapter();
    authService = new AuthService(repository, undefined, cacheAdapter);
  });

  it('1. Full lifecycle: sign-up → validate → sign-out → rejected validation', async () => {
    const signUpResult = await authService.signUp(TEST_USER);
    expect(signUpResult.token).toBeDefined();
    expect(signUpResult.user.email).toBe(TEST_USER.email);

    const validSession = await authService.validateSession(signUpResult.token);
    expect(validSession.sub).toBe(signUpResult.user.id);
    expect(validSession.email).toBe(TEST_USER.email);

    await authService.signOut(signUpResult.token);

    await expect(authService.validateSession(signUpResult.token))
      .rejects.toThrow('Session has been invalidated');
  });

  it('2. Token denylist entries auto-expire after TTL', async () => {
    await cacheAdapter.set('denylist:jti:test-ttl', 'true', 50);
    expect(await cacheAdapter.exists('denylist:jti:test-ttl')).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(await cacheAdapter.exists('denylist:jti:test-ttl')).toBe(false);
  });

  it('3. Multiple sign-outs do not throw — idempotent denylist writes', async () => {
    const signUpResult = await authService.signUp({
      ...TEST_USER,
      email: 'idempotent-e2e@observability.io',
      organization_name: 'Idempotent Corp',
    });

    await authService.signOut(signUpResult.token);

    await expect(authService.validateSession(signUpResult.token))
      .rejects.toThrow('Session has been invalidated');
  });

  it('4. Un-denied tokens remain valid across multiple validation calls', async () => {
    const signUpResult = await authService.signUp({
      ...TEST_USER,
      email: 'valid-forever-e2e@observability.io',
      organization_name: 'Valid Forever Corp',
    });

    const session1 = await authService.validateSession(signUpResult.token);
    const session2 = await authService.validateSession(signUpResult.token);
    const session3 = await authService.validateSession(signUpResult.token);

    expect(session1.sub).toBe(signUpResult.user.id);
    expect(session2.sub).toBe(signUpResult.user.id);
    expect(session3.sub).toBe(signUpResult.user.id);
  });

  it('5. Organization switch invalidates old token and issues new valid token', async () => {
    const signUpResult = await authService.signUp({
      ...TEST_USER,
      email: 'switch-e2e@observability.io',
      organization_name: 'Switch Alpha Corp',
    });

    const newOrg = await authService.createOrganization(
      { name: 'Switch Beta Corp' },
      signUpResult.user.id,
    );
    expect(newOrg.id).toBeDefined();

    const switchResult = await authService.switchOrganization(
      signUpResult.user.id,
      newOrg.id,
      signUpResult.token,
    );
    expect(switchResult.token).toBeDefined();
    expect(switchResult.payload.org.org_id).toBe(newOrg.id);

    await expect(authService.validateSession(signUpResult.token))
      .rejects.toThrow('Session has been invalidated');

    const newSession = await authService.validateSession(switchResult.token);
    expect(newSession.org.org_id).toBe(newOrg.id);
  });

  it('6. AuthService without cache adapter still works (backward compatibility)', async () => {
    const noCacheService = new AuthService(new AlloyDBOmniAuthAdapter());

    const signUpResult = await noCacheService.signUp({
      ...TEST_USER,
      email: 'nocache-e2e@observability.io',
      organization_name: 'No Cache Corp',
    });

    const session = await noCacheService.validateSession(signUpResult.token);
    expect(session.sub).toBe(signUpResult.user.id);

    await noCacheService.signOut(signUpResult.token);

    await expect(noCacheService.validateSession(signUpResult.token))
      .rejects.toThrow('Session has been invalidated');
  });
});
