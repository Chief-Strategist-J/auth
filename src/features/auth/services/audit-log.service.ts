/**
 * @file audit-log.service.ts
 * @description Domain Service for Querying Security Audit Trails and Purging Soft-Deleted Records.
 *
 * OVERALL ALGORITHM:
 * 1. Normalize user identifier and filter criteria (safe date range conversion and event type normalization).
 * 2. Query repository adapter for user audit trail matching criteria.
 * 3. Expose maintenance operation to purge expired soft-deleted audit records.
 */

import type { AuthRepositoryPort } from '../repository';
import type { AuditLogRecord, AuditLogFilter } from '../types';
import { normalizeString } from '../../../shared/utils/string.util';

export class AuditLogDomainService {
  constructor(private readonly repo: AuthRepositoryPort) {}

  async fetchUserAuditLogs(userId: string, filters?: AuditLogFilter): Promise<AuditLogRecord[]> {
    const normalizedUserId = normalizeString(userId);
    const fromTime = filters?.from ? new Date(filters.from).getTime() : undefined;
    const toTime = filters?.to ? new Date(filters.to).getTime() : undefined;

    const mapped = filters
      ? {
          event_type: filters.event_type ? normalizeString(filters.event_type) : undefined,
          from_ms: typeof fromTime === 'number' && Number.isFinite(fromTime) ? fromTime : undefined,
          to_ms: typeof toTime === 'number' && Number.isFinite(toTime) ? toTime : undefined,
        }
      : undefined;

    return this.repo.fetchUserAuditLogs(normalizedUserId, mapped);
  }

  async purgeExpiredSoftDeletes(): Promise<number> {
    return this.repo.purgeExpiredSoftDeletes();
  }
}
