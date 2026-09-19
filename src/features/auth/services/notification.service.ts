/**
 * @file notification.service.ts
 * @description Domain Notification Service coordinating MailerPort for transactional email delivery.
 *
 * OVERALL ALGORITHM:
 * 1. Accept high-level email dispatch requests (password reset, invitation, email verification).
 * 2. Construct text/plain and text/html body payloads with embedded dynamic tokens and metadata.
 * 3. Delegate to MailerPort adapter for actual delivery (SMTP, SES, SendGrid, or Mock).
 * 4. Return SendMailResult for caller error handling without coupling to provider specifics.
 * 5. Configuration accepts 'from' address for sender identity control.
 */

import type { MailerPort, SendMailResult } from '../../../shared/ports/mailer.port';

export interface NotificationConfig {
  from: string;
  appName?: string;
  appUrl?: string;
}

export class NotificationDomainService {
  private readonly from: string;
  private readonly appName: string;
  private readonly appUrl: string;

  constructor(
    private readonly mailer: MailerPort,
    config: NotificationConfig,
  ) {
    this.from = config.from;
    this.appName = config.appName ?? 'LLM Observability';
    this.appUrl = config.appUrl ?? 'http://localhost:3000';
  }

  async sendPasswordResetEmail(email: string, name: string, token: string): Promise<SendMailResult> {
    const resetUrl = `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const textBody = `Hi ${name},\n\nYou requested a password reset for your ${this.appName} account.\n\nUse this link to reset your password (valid for 1 hour):\n${resetUrl}\n\nIf you did not request this, please ignore this email.\n\n— ${this.appName} Team`;
    const htmlBody = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>Password Reset</h2><p>Hi ${name},</p><p>You requested a password reset for your <strong>${this.appName}</strong> account.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Reset Password</a></p><p style="color:#6b7280;font-size:14px">This link is valid for 1 hour. If you did not request this, ignore this email.</p><hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"><p style="color:#9ca3af;font-size:12px">— ${this.appName} Team</p></div>`;

    return this.mailer.send({
      from: this.from,
      to: email,
      subject: `[${this.appName}] Password Reset Request`,
      textBody,
      htmlBody,
    });
  }

  async sendUserInviteEmail(email: string, name: string, orgName: string, tempPassword: string): Promise<SendMailResult> {
    const loginUrl = `${this.appUrl}/sign-in`;
    const textBody = `Hi ${name},\n\nYou have been invited to join "${orgName}" on ${this.appName}.\n\nYour temporary credentials:\n  Email: ${email}\n  Password: ${tempPassword}\n\nSign in at: ${loginUrl}\n\nPlease change your password immediately after first login.\n\n— ${this.appName} Team`;
    const htmlBody = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>You're Invited!</h2><p>Hi ${name},</p><p>You have been invited to join <strong>${orgName}</strong> on <strong>${this.appName}</strong>.</p><div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:16px 0"><p style="margin:4px 0"><strong>Email:</strong> ${email}</p><p style="margin:4px 0"><strong>Temporary Password:</strong> <code style="background:#e5e7eb;padding:2px 6px;border-radius:4px">${tempPassword}</code></p></div><p><a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Sign In</a></p><p style="color:#dc2626;font-size:14px;font-weight:600">⚠️ Change your password immediately after first login.</p><hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"><p style="color:#9ca3af;font-size:12px">— ${this.appName} Team</p></div>`;

    return this.mailer.send({
      from: this.from,
      to: email,
      subject: `[${this.appName}] You've been invited to ${orgName}`,
      textBody,
      htmlBody,
    });
  }

  async sendEmailVerification(email: string, name: string, token: string): Promise<SendMailResult> {
    const verifyUrl = `${this.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const textBody = `Hi ${name},\n\nPlease verify your email address for your ${this.appName} account.\n\nVerification link (valid for 24 hours):\n${verifyUrl}\n\nIf you did not create an account, please ignore this email.\n\n— ${this.appName} Team`;
    const htmlBody = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>Verify Your Email</h2><p>Hi ${name},</p><p>Please verify your email address for your <strong>${this.appName}</strong> account.</p><p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Verify Email</a></p><p style="color:#6b7280;font-size:14px">This link is valid for 24 hours.</p><hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"><p style="color:#9ca3af;font-size:12px">— ${this.appName} Team</p></div>`;

    return this.mailer.send({
      from: this.from,
      to: email,
      subject: `[${this.appName}] Verify Your Email Address`,
      textBody,
      htmlBody,
    });
  }
}
