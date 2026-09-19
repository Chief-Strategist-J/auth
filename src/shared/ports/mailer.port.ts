/**
 * @file mailer.port.ts
 * @description Hexagonal Port contract for transactional email delivery.
 *
 * OVERALL ALGORITHM:
 * 1. Define EmailMessage as the canonical envelope for all transactional emails sent by the auth subsystem.
 * 2. Define SendMailResult as the standardized outcome of a send operation.
 * 3. Define MailerPort as the provider-agnostic contract that all mailer adapters must implement.
 * 4. Adapters (SMTP, SES, SendGrid, Mock) implement MailerPort; swapping providers requires zero domain-layer changes.
 */

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  replyTo?: string;
}

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface MailerPort {
  send(message: EmailMessage): Promise<SendMailResult>;
  verify(): Promise<boolean>;
}
