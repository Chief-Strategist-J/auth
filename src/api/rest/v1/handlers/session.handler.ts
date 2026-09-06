import type { AuthService } from '../../../../features/auth/service';
import type { AuthTokenPayload } from '../../../../shared/types/auth.types';
import { AUTH_CONSTANTS } from '../../../../shared/constants/auth.constants';
import { UnauthorizedError } from '../../../../shared/errors/auth.errors';

export async function handleVerifySession(service: AuthService, authorizationHeader?: string): Promise<AuthTokenPayload> {
  if (!authorizationHeader || !authorizationHeader.startsWith(AUTH_CONSTANTS.HEADERS.BEARER_PREFIX)) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = authorizationHeader.substring(AUTH_CONSTANTS.HEADERS.BEARER_PREFIX.length);
  return service.validateSession(token);
}
