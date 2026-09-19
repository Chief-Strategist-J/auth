/**
 * @file mailer.factory.ts
 * @description Factory resolver for MailerPort adapters based on centralized environment configuration.
 *
 * OVERALL ALGORITHM:
 * 1. Resolve configuration from parameter or load centralized defaults from environment.
 * 2. Match requested provider identifier against registered implementations.
 * 3. Construct and return corresponding adapter instance with optional custom HTTP client injection.
 * 4. Fall back to MockMailerAdapter if credentials or provider configuration are missing.
 */

import type { MailerPort } from '../../../shared/ports/mailer.port';
import { MockMailerAdapter } from './mock-mailer.adapter';
import { SmtpMailerAdapter } from './smtp-mailer.adapter';
import { SesMailerAdapter } from './ses-mailer.adapter';
import { SendgridMailerAdapter } from './sendgrid-mailer.adapter';
import type { IMailerHttpClient } from './base-rest-mailer.adapter';
import {
  type MailerConfig,
  type MailerProvider,
  type SesMailerConfig,
  type SendgridMailerConfig,
  type SmtpMailerConfig,
  loadMailerConfig,
} from '../../../config/mailer.config';

export type {
  MailerConfig,
  MailerProvider,
  SesMailerConfig,
  SendgridMailerConfig,
  SmtpMailerConfig,
};

export function createMailer(
  config?: MailerConfig,
  customHttpClient?: IMailerHttpClient
): MailerPort {
  const effectiveConfig = config ?? loadMailerConfig();

  if (!effectiveConfig || effectiveConfig.provider === 'mock') {
    return new MockMailerAdapter();
  }

  switch (effectiveConfig.provider) {
    case 'smtp': {
      if (!effectiveConfig.smtp) return new MockMailerAdapter();
      return new SmtpMailerAdapter(effectiveConfig.smtp);
    }
    case 'ses': {
      if (!effectiveConfig.ses) return new MockMailerAdapter();
      return new SesMailerAdapter(effectiveConfig.ses, customHttpClient);
    }
    case 'sendgrid': {
      if (!effectiveConfig.sendgrid) return new MockMailerAdapter();
      return new SendgridMailerAdapter(effectiveConfig.sendgrid, customHttpClient);
    }
    default:
      return new MockMailerAdapter();
  }
}
