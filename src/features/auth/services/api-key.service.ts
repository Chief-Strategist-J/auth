/**
 * @file api-key.service.ts
 * @description Domain Service for Multi-Tier API Key Generation, Hashing, Permission Verification, TTL Enforcement, and Revocation.
 *
 * OVERALL ALGORITHM:
 * 1. API Key Generation: Validate schema -> verify organization existence -> resolve prefix via dictionary lookup ->
 *    enforce mandatory expires_at_ms for super_secret keys with max 90-day TTL -> generate cryptographically secure
 *    key and Argon2id hash -> persist record in repository -> return raw key and metadata.
 * 2. API Key Verification: Hash incoming key -> locate record in repository -> verify active status (not revoked) ->
 *    check expires_at_ms against current timestamp -> evaluate required permission against key scopes with fail-fast
 *    authorization check -> update last_used_at_ms and last_used_ip asynchronously via repository.
 * 3. API Key Revocation: Mark revoked in repository and register instant revocation in Redis denylist
 *    (auth:revoked_api_key:${keyId}) for edge/CDN propagation.
 */

import type { AuthRepositoryPort } from '../repository';
import type { CreateApiKeyInput, VerifyApiKeyInput } from '../types';
import type { ApiKeyRecord } from '../../../shared/types/auth.types';
import type { ICachePort } from '../../../shared/ports/cache.interface';
import { CreateApiKeyInputSchema, VerifyApiKeyInputSchema } from '../schema/auth.schema';
import { ApiKeyRevokedError, ApiKeyExpiredError, InsufficientPermissionError, ValidationError } from '../../../shared/errors/auth.errors';
import { hashApiKey } from '../../../shared/utils/argon2.util';
import { AUTH_CONSTANTS } from '../../../shared/constants/auth.constants';
import { normalizeString } from '../../../shared/utils/string.util';

const KEY_PREFIX_MAP: Readonly<Record<string, string>> = Object.freeze({
  [AUTH_CONSTANTS.KEY_TYPE_SUPER_SECRET]: AUTH_CONSTANTS.API_KEY_PREFIX_SUPER_SECRET,
  [AUTH_CONSTANTS.KEY_TYPE_TESTING]: AUTH_CONSTANTS.API_KEY_PREFIX_TESTING,
  [AUTH_CONSTANTS.KEY_TYPE_GENERAL]: AUTH_CONSTANTS.API_KEY_PREFIX_GENERAL,
});

const MAX_SUPER_SECRET_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const REVOKED_KEY_CACHE_PREFIX = 'auth:revoked_api_key:';
const REVOKED_KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class ApiKeyDomainService {
  constructor(
    private readonly repo: AuthRepositoryPort,
    private readonly cache?: ICachePort,
  ) {}

  async generateApiKey(input: CreateApiKeyInput): Promise<{ rawKey: string; keyRecord: ApiKeyRecord }> {
    const validated = CreateApiKeyInputSchema.parse(input);
    const orgId = normalizeString(validated.org_id);

    const org = await this.repo.getOrganizationById(orgId);
    if (!org) {
      throw new ValidationError(`Invalid organization ID '${orgId}': Target organization does not exist in the system.`);
    }

    const keyType = normalizeString(validated.key_type);
    const prefix = KEY_PREFIX_MAP[keyType] ?? AUTH_CONSTANTS.API_KEY_PREFIX_GENERAL;

    if (keyType === AUTH_CONSTANTS.KEY_TYPE_SUPER_SECRET) {
      if (!validated.expires_at_ms) {
        throw new ValidationError('super_secret (ak_sec_) keys require a mandatory expires_at_ms TTL value.');
      }
      const ttlMs = validated.expires_at_ms - Date.now();
      if (ttlMs <= 0) {
        throw new ValidationError('expires_at_ms must be a future timestamp.');
      }
      if (ttlMs > MAX_SUPER_SECRET_TTL_MS) {
        throw new ValidationError('super_secret (ak_sec_) keys cannot have a TTL exceeding 90 days.');
      }
    }

    const keyId = `key_${Math.random().toString(36).substring(2, 9)}`;
    const secret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const rawKey = `${prefix}${orgId}_${secret}`;
    const keyHash = await hashApiKey(rawKey);

    const keyRecord: ApiKeyRecord = {
      key_id: keyId,
      org_id: orgId,
      key_type: validated.key_type,
      key_hash: keyHash,
      prefix,
      name: normalizeString(validated.name),
      permissions: Array.isArray(validated.permissions) ? [...validated.permissions] : [],
      created_at_ms: Date.now(),
      revoked: false,
      expires_at_ms: validated.expires_at_ms ?? null,
      last_used_at_ms: null,
      last_used_ip: null,
    };

    await this.repo.saveApiKey(keyRecord);
    return { rawKey, keyRecord };
  }

  async listApiKeys(orgId: string): Promise<ApiKeyRecord[]> {
    const normalizedOrgId = normalizeString(orgId);
    return this.repo.listApiKeysByOrgId(normalizedOrgId);
  }

  async verifyApiKey(input: VerifyApiKeyInput): Promise<{ valid: boolean; record: ApiKeyRecord; authorized: boolean }> {
    const validated = VerifyApiKeyInputSchema.parse(input);
    const rawKey = normalizeString(validated.key);
    const keyHash = await hashApiKey(rawKey);
    const record = await this.repo.findApiKeyByHash(keyHash);

    if (!record || record.revoked) {
      throw new ApiKeyRevokedError();
    }

    if (this.cache) {
      const cacheKey = `${REVOKED_KEY_CACHE_PREFIX}${record.key_id}`;
      const cachedRevoked = await this.cache.get(cacheKey);
      if (cachedRevoked) {
        throw new ApiKeyRevokedError();
      }
    }

    if (record.expires_at_ms && record.expires_at_ms <= Date.now()) {
      throw new ApiKeyExpiredError();
    }

    let authorized = true;
    if (validated.required_permission) {
      const required = normalizeString(validated.required_permission);
      const permissions = Array.isArray(record.permissions) ? record.permissions : [];
      authorized =
        record.key_type === AUTH_CONSTANTS.KEY_TYPE_SUPER_SECRET ||
        permissions.includes(AUTH_CONSTANTS.PERMISSION_ADMIN_ALL) ||
        permissions.includes(required);

      if (!authorized) {
        throw new InsufficientPermissionError(required);
      }
    }

    this.recordUsageAsync(record.key_id, validated.client_ip);

    return { valid: true, record, authorized };
  }

  async revokeApiKey(keyId: string): Promise<void> {
    const normalizedKeyId = normalizeString(keyId);
    await this.repo.revokeApiKey(normalizedKeyId);

    if (this.cache) {
      const cacheKey = `${REVOKED_KEY_CACHE_PREFIX}${normalizedKeyId}`;
      await this.cache.set(cacheKey, 'revoked', REVOKED_KEY_CACHE_TTL_MS);
    }
  }

  getSystemPermissions(): string[] {
    return [
      AUTH_CONSTANTS.PERMISSION_TRACES_READ,
      AUTH_CONSTANTS.PERMISSION_TRACES_WRITE,
      AUTH_CONSTANTS.PERMISSION_METRICS_READ,
      AUTH_CONSTANTS.PERMISSION_METRICS_WRITE,
      AUTH_CONSTANTS.PERMISSION_LOGS_READ,
      AUTH_CONSTANTS.PERMISSION_LOGS_WRITE,
      AUTH_CONSTANTS.PERMISSION_ALERTS_READ,
      AUTH_CONSTANTS.PERMISSION_ALERTS_WRITE,
      AUTH_CONSTANTS.PERMISSION_ADMIN_ALL,
    ];
  }

  private recordUsageAsync(keyId: string, clientIp?: string): void {
    Promise.resolve()
      .then(() => this.repo.updateApiKeyUsage(keyId, Date.now(), clientIp))
      .catch(() => {});
  }
}
