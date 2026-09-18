/**
 * @file user-management.service.ts
 * @description Domain Service for User Directory Administration, Invitations, RBAC Role Mutation, and Account Blocking.
 *
 * OVERALL ALGORITHM:
 * 1. User query & profile: Normalize user/org identifier and return user record or throw ValidationError.
 * 2. User invitation & provisioning: Normalize inputs -> check email uniqueness with early throw ->
 *    generate random temporary password and Argon2id hash -> persist user record in organization.
 * 3. RBAC mutation: Validate inputs, update roles and granular permission arrays in repository.
 * 4. Account lifecycle: Expose administrative block, unblock, and soft-delete operations.
 */

import type { AuthRepositoryPort } from '../repository';
import type {
  AuthUserRecord,
  UpdateUserProfileInput,
  InviteUserInput,
  UpdateUserRoleInput,
  UpdateUserPermissionsInput,
  CreateUserInput,
} from '../types';
import {
  UpdateUserProfileInputSchema,
  InviteUserInputSchema,
  UpdateUserRoleInputSchema,
  UpdateUserPermissionsInputSchema,
  CreateUserInputSchema,
} from '../schema/auth.schema';
import { UserAlreadyExistsError, ValidationError } from '../../../shared/errors/auth.errors';
import { hashPassword } from '../../../shared/utils/argon2.util';
import { AUTH_CONSTANTS } from '../../../shared/constants/auth.constants';
import { normalizeString } from '../../../shared/utils/string.util';

export class UserManagementDomainService {
  constructor(private readonly repo: AuthRepositoryPort) {}

  async listUsers(orgId: string): Promise<AuthUserRecord[]> {
    const normalizedOrgId = normalizeString(orgId);
    return this.repo.listUsersByOrgId(normalizedOrgId);
  }

  async getUserById(userId: string): Promise<AuthUserRecord> {
    const normalizedUserId = normalizeString(userId);
    const user = await this.repo.findUserById(normalizedUserId);
    if (!user) throw new ValidationError('User not found');
    return user;
  }

  async getMyProfile(userId: string): Promise<AuthUserRecord> {
    return this.getUserById(userId);
  }

  async updateMyProfile(userId: string, input: UpdateUserProfileInput): Promise<AuthUserRecord> {
    const normalizedUserId = normalizeString(userId);
    const validated = UpdateUserProfileInputSchema.parse(input);
    await this.repo.updateUserProfile(normalizedUserId, validated);
    return this.getUserById(normalizedUserId);
  }

  async inviteUser(input: InviteUserInput, orgId: string, orgName: string): Promise<AuthUserRecord> {
    const validated = InviteUserInputSchema.parse(input);
    const email = normalizeString(validated.email, 'lower');
    const normalizedOrgId = normalizeString(orgId);
    const normalizedOrgName = normalizeString(orgName);

    const existingUser = await this.repo.findUserByEmail(email);
    if (existingUser) {
      throw new UserAlreadyExistsError(email);
    }

    const tempPassword = `Tmp_${Math.random().toString(36).substring(2, 10)}!1A`;
    const passwordHash = await hashPassword(tempPassword);
    const userId = `usr_${Math.random().toString(36).substring(2, 9)}`;

    const userRecord: AuthUserRecord = {
      id: userId,
      email,
      password_hash: passwordHash,
      name: normalizeString(validated.name),
      org_id: normalizedOrgId,
      org_name: normalizedOrgName,
      role: validated.role ?? AUTH_CONSTANTS.ROLE_MEMBER,
      blocked: false,
      user_permissions: Array.isArray(validated.permissions) ? [...validated.permissions] : [],
    };

    await this.repo.createUser(userRecord);
    return userRecord;
  }

  async updateUserRole(userId: string, input: UpdateUserRoleInput): Promise<void> {
    const normalizedUserId = normalizeString(userId);
    const validated = UpdateUserRoleInputSchema.parse(input);
    await this.repo.updateUserRole(normalizedUserId, validated.role);
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.getUserById(userId);
    return Array.isArray(user.user_permissions) ? user.user_permissions : [];
  }

  async updateUserPermissions(userId: string, input: UpdateUserPermissionsInput): Promise<void> {
    const normalizedUserId = normalizeString(userId);
    const validated = UpdateUserPermissionsInputSchema.parse(input);
    await this.repo.updateUserPermissions(normalizedUserId, validated.permissions);
  }

  async createUser(input: CreateUserInput): Promise<AuthUserRecord> {
    const validated = CreateUserInputSchema.parse(input);
    const email = normalizeString(validated.email, 'lower');

    const existingUser = await this.repo.findUserByEmail(email);
    if (existingUser) {
      throw new UserAlreadyExistsError(email);
    }

    const passwordHash = await hashPassword(validated.password);
    const userId = `usr_${Math.random().toString(36).substring(2, 9)}`;

    const userRecord: AuthUserRecord = {
      id: userId,
      email,
      password_hash: passwordHash,
      name: normalizeString(validated.name),
      org_id: normalizeString(validated.org_id),
      org_name: '',
      role: validated.role ?? AUTH_CONSTANTS.ROLE_MEMBER,
      blocked: false,
      user_permissions: Array.isArray(validated.permissions) ? [...validated.permissions] : [],
    };

    await this.repo.createUser(userRecord);
    return userRecord;
  }

  async blockUser(userId: string): Promise<void> {
    const normalizedUserId = normalizeString(userId);
    await this.repo.blockUser(normalizedUserId);
  }

  async unblockUser(userId: string): Promise<void> {
    const normalizedUserId = normalizeString(userId);
    await this.repo.unblockUser(normalizedUserId);
  }

  async deleteUser(userId: string): Promise<void> {
    const normalizedUserId = normalizeString(userId);
    await this.repo.deleteUser(normalizedUserId);
  }
}
