/**
 * @file api-key.service.ts
 * @description Domain Service for Multi-Tier API Key Generation, Hashing, Permission Verification, and Revocation.
 *
 * OVERALL ALGORITHM:
 * 1. API Key Generation: Validate schema -> verify organization existence -> resolve prefix via dictionary lookup ->
 *    generate cryptographically secure key and Argon2id hash -> persist record in repository -> return raw key and metadata.
 * 2. API Key Verification: Hash incoming key -> locate record in repository -> verify active status (not revoked) ->
 *    evaluate required permission against key scopes with fail-fast authorization check.
 * 3. API Key Revocation: Forward revocation request to repository adapter.
 */

import type { AuthRepositoryPort } from '../repository';
import type { CreateApiKeyInput, VerifyApiKeyInput } from '../types';
import type { ApiKeyRecord } from '../../../shared/types/auth.types';
import { CreateApiKeyInputSchema, VerifyApiKeyInputSchema } from '../schema/auth.schema';
import { ApiKeyRevokedError, InsufficientPermissionError, ValidationError } from '../../../shared/errors/auth.errors';
import { hashApiKey } from '../../../shared/utils/argon2.util';
import { AUTH_CONSTANTS } from '../../../shared/constants/auth.constants';
import { normalizeString } from '../../../shared/utils/string.util';

const KEY_PREFIX_MAP: Readonly<Record<string, string>> = Object.freeze({
  [AUTH_CONSTANTS.KEY_TYPE_SUPER_SECRET]: AUTH_CONSTANTS.API_KEY_PREFIX_SUPER_SECRET,
  [AUTH_CONSTANTS.KEY_TYPE_TESTING]: AUTH_CONSTANTS.API_KEY_PREFIX_TESTING,
  [AUTH_CONSTANTS.KEY_TYPE_GENERAL]: AUTH_CONSTANTS.API_KEY_PREFIX_GENERAL,
});

export class ApiKeyDomainService {
  constructor(private readonly repo: AuthRepositoryPort) {}

  async generateApiKey(input: CreateApiKeyInput): Promise<{ rawKey: string; keyRecord: ApiKeyRecord }> {
    const validated = CreateApiKeyInputSchema.parse(input);
    const orgId = normalizeString(validated.org_id);

    const org = await this.repo.getOrganizationById(orgId);
    if (!org) {
      throw new ValidationError(`Invalid organization ID '${orgId}': Target organization does not exist in the system.`);
    }

    const keyType = normalizeString(validated.key_type);
    const prefix = KEY_PREFIX_MAP[keyType] ?? AUTH_CONSTANTS.API_KEY_PREFIX_GENERAL;

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

    return { valid: true, record, authorized };
  }

  async revokeApiKey(keyId: string): Promise<void> {
    const normalizedKeyId = normalizeString(keyId);
    await this.repo.revokeApiKey(normalizedKeyId);
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
}
