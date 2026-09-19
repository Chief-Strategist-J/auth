/**
 * @file mailer.config.ts
 * @description Centralized, environment-driven configuration for transactional mailer adapters.
 *
 * OVERALL ALGORITHM:
 * 1. Declare provider-specific configuration contracts (SES, SendGrid, SMTP).
 * 2. Define deeply frozen default constants for endpoint templates, API versions, and paths.
 * 3. Provide URL resolution helper functions that build full URLs dynamically from configuration.
 * 4. Load configuration from environment variables with fallback to non-breaking defaults.
 */

export type MailerProvider = 'smtp' | 'ses' | 'sendgrid' | 'mock';

export interface SesMailerConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpointTemplate: string;
  sendPath: string;
  accountPath: string;
}

export interface SendgridMailerConfig {
  apiKey: string;
  apiUrl: string;
  sendPath: string;
  verifyPath: string;
}

export interface SmtpMailerConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure?: boolean;
}

export interface MailerConfig {
  provider: MailerProvider;
  from: string;
  ses?: SesMailerConfig;
  sendgrid?: SendgridMailerConfig;
  smtp?: SmtpMailerConfig;
}

export const MAILER_DEFAULTS = Object.freeze({
  DEFAULT_PROVIDER: 'mock' as MailerProvider,
  DEFAULT_FROM: 'noreply@auth.local',
  SES: Object.freeze({
    DEFAULT_REGION: 'us-east-1',
    ENDPOINT_TEMPLATE: 'https://email.{region}.amazonaws.com',
    SEND_PATH: '/v2/email/outbound-emails',
    ACCOUNT_PATH: '/v2/email/account',
  }),
  SENDGRID: Object.freeze({
    API_URL: 'https://api.sendgrid.com',
    SEND_PATH: '/v3/mail/send',
    VERIFY_PATH: '/v3/user/profile',
  }),
  SMTP: Object.freeze({
    DEFAULT_HOST: 'localhost',
    DEFAULT_PORT: 587,
    DEFAULT_SECURE: false,
  }),
});

export function resolveSesEndpoint(config: Pick<SesMailerConfig, 'region' | 'endpointTemplate'>): string {
  return config.endpointTemplate.replace('{region}', config.region);
}

export function resolveSesSendUrl(config: Pick<SesMailerConfig, 'region' | 'endpointTemplate' | 'sendPath'>): string {
  const base = resolveSesEndpoint(config).replace(/\/+$/, '');
  const path = config.sendPath.startsWith('/') ? config.sendPath : `/${config.sendPath}`;
  return `${base}${path}`;
}

export function resolveSesAccountUrl(config: Pick<SesMailerConfig, 'region' | 'endpointTemplate' | 'accountPath'>): string {
  const base = resolveSesEndpoint(config).replace(/\/+$/, '');
  const path = config.accountPath.startsWith('/') ? config.accountPath : `/${config.accountPath}`;
  return `${base}${path}`;
}

export function resolveSendgridSendUrl(config: Pick<SendgridMailerConfig, 'apiUrl' | 'sendPath'>): string {
  const base = config.apiUrl.replace(/\/+$/, '');
  const path = config.sendPath.startsWith('/') ? config.sendPath : `/${config.sendPath}`;
  return `${base}${path}`;
}

export function resolveSendgridVerifyUrl(config: Pick<SendgridMailerConfig, 'apiUrl' | 'verifyPath'>): string {
  const base = config.apiUrl.replace(/\/+$/, '');
  const path = config.verifyPath.startsWith('/') ? config.verifyPath : `/${config.verifyPath}`;
  return `${base}${path}`;
}

export function loadMailerConfig(): MailerConfig {
  const provider = (process.env.MAILER_PROVIDER || MAILER_DEFAULTS.DEFAULT_PROVIDER) as MailerProvider;
  const from = process.env.MAILER_FROM || MAILER_DEFAULTS.DEFAULT_FROM;

  return {
    provider,
    from,
    ses: {
      region: process.env.AWS_SES_REGION || MAILER_DEFAULTS.SES.DEFAULT_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      endpointTemplate: process.env.AWS_SES_ENDPOINT_TEMPLATE || MAILER_DEFAULTS.SES.ENDPOINT_TEMPLATE,
      sendPath: process.env.AWS_SES_SEND_PATH || MAILER_DEFAULTS.SES.SEND_PATH,
      accountPath: process.env.AWS_SES_ACCOUNT_PATH || MAILER_DEFAULTS.SES.ACCOUNT_PATH,
    },
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY || '',
      apiUrl: process.env.SENDGRID_API_URL || MAILER_DEFAULTS.SENDGRID.API_URL,
      sendPath: process.env.SENDGRID_SEND_PATH || MAILER_DEFAULTS.SENDGRID.SEND_PATH,
      verifyPath: process.env.SENDGRID_VERIFY_PATH || MAILER_DEFAULTS.SENDGRID.VERIFY_PATH,
    },
    smtp: {
      host: process.env.SMTP_HOST || MAILER_DEFAULTS.SMTP.DEFAULT_HOST,
      port: parseInt(process.env.SMTP_PORT || String(MAILER_DEFAULTS.SMTP.DEFAULT_PORT), 10),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      secure: process.env.SMTP_SECURE === 'true',
    },
  };
}
