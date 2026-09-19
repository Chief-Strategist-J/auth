/**
 * @file email-verification.handler.ts
 * @description HTTP handler layer for email verification and resend verification endpoints.
 *
 * OVERALL ALGORITHM:
 * 1. handleVerifyEmail: Extract token from request body -> delegate to AuthService.verifyEmail().
 * 2. handleResendVerification: Extract email from request body -> delegate to AuthService.resendVerificationEmail().
 */

import type { AuthService } from '../../../../features/auth/service';

export async function handleVerifyEmail(service: AuthService, body: unknown): Promise<unknown> {
  const { token } = body as { token: string };
  await service.verifyEmail(token);
  return { verified: true };
}

export async function handleResendVerification(service: AuthService, body: unknown): Promise<unknown> {
  const { email } = body as { email: string };
  await service.resendVerificationEmail(email);
  return { sent: true };
}
