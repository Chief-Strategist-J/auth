/**
 * @file mailer.test.ts
 * @description Comprehensive unit tests for transactional mailer adapters, fail-fast guards,
 * URL configuration, and factory resolver.
 *
 * OVERALL ALGORITHM:
 * 1. Test fail-fast envelope validation logic against null, missing, and malformed inputs.
 * 2. Test email address normalization and error formatting utilities.
 * 3. Test MockMailerAdapter state management and validation.
 * 4. Test SendgridMailerAdapter execution, credential checks, custom endpoints, and response parsing using mock HTTP client.
 * 5. Test SesMailerAdapter SigV4 payload construction, credential validation, dynamic URL resolution, and verify using mock HTTP client.
 * 6. Test SmtpMailerAdapter fail-fast validation and connection error trapping.
 * 7. Test createMailer factory resolution across all providers and fallback mechanisms.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractEmail,
  validateEmailAddress,
  validateEmailMessage,
  formatMailerError,
} from '../../src/shared/utils/mailer.util';
import { MockMailerAdapter } from '../../src/infra/adapters/mailer/mock-mailer.adapter';
import { SendgridMailerAdapter } from '../../src/infra/adapters/mailer/sendgrid-mailer.adapter';
import { SesMailerAdapter } from '../../src/infra/adapters/mailer/ses-mailer.adapter';
import { SmtpMailerAdapter } from '../../src/infra/adapters/mailer/smtp-mailer.adapter';
import { createMailer } from '../../src/infra/adapters/mailer/mailer.factory';
import type { IMailerHttpClient } from '../../src/infra/adapters/mailer/base-rest-mailer.adapter';
import type { EmailMessage } from '../../src/shared/ports/mailer.port';

describe('Mailer Utility Unit Tests', () => {
  it('should extract email address correctly from formatted strings', () => {
    expect(extractEmail('John Doe <john@example.com>')).toBe('john@example.com');
    expect(extractEmail('user@domain.org')).toBe('user@domain.org');
    expect(extractEmail('  <admin@observability.io>  ')).toBe('admin@observability.io');
    expect(extractEmail('')).toBe('');
  });

  it('should validate email syntax according to RFC pattern', () => {
    expect(validateEmailAddress('valid@example.com')).toBe(true);
    expect(validateEmailAddress('valid.user+tag@domain.co.uk')).toBe(true);
    expect(validateEmailAddress('plainaddress')).toBe(false);
    expect(validateEmailAddress('@missingusername.com')).toBe(false);
    expect(validateEmailAddress('missingdomain@.com')).toBe(false);
  });

  it('should fail fast on invalid email messages', () => {
    expect(validateEmailMessage(null).isValid).toBe(false);
    expect(validateEmailMessage(undefined).isValid).toBe(false);

    expect(validateEmailMessage({
      from: 'sender@example.com',
      to: '',
      subject: 'Test',
      textBody: 'Hello',
      htmlBody: '<p>Hello</p>',
    }).isValid).toBe(false);

    expect(validateEmailMessage({
      from: 'invalid-from',
      to: 'recipient@example.com',
      subject: 'Test',
      textBody: 'Hello',
      htmlBody: '<p>Hello</p>',
    }).isValid).toBe(false);

    expect(validateEmailMessage({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: '',
      textBody: 'Hello',
      htmlBody: '<p>Hello</p>',
    }).isValid).toBe(false);

    expect(validateEmailMessage({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Test',
      textBody: '',
      htmlBody: '',
    }).isValid).toBe(false);

    expect(validateEmailMessage({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Valid Message',
      textBody: 'Hello World',
      htmlBody: '<p>Hello World</p>',
    }).isValid).toBe(true);
  });

  it('should format errors consistently across providers', () => {
    expect(formatMailerError('TEST', new Error('Connection refused'))).toBe('[TEST] Connection refused');
    expect(formatMailerError('TEST', null)).toBe('[TEST] Unknown error occurred');

    const httpError = new Error('Bad Request');
    (httpError as any).status = 400;
    (httpError as any).data = { message: 'Invalid payload' };
    expect(formatMailerError('SES', httpError)).toContain('[SES] HTTP Error 400');
  });
});

describe('MockMailerAdapter Unit Tests', () => {
  let adapter: MockMailerAdapter;

  beforeEach(() => {
    adapter = new MockMailerAdapter();
  });

  it('should successfully store sent messages and return deterministic result', async () => {
    const message: EmailMessage = {
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Welcome',
      textBody: 'Welcome aboard!',
      htmlBody: '<p>Welcome aboard!</p>',
    };

    const result = await adapter.send(message);
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(adapter.sentMessages.length).toBe(1);
    expect(adapter.getLastMessage()?.subject).toBe('Welcome');

    adapter.clear();
    expect(adapter.sentMessages.length).toBe(0);
  });

  it('should reject invalid message payloads via fail-fast validation', async () => {
    const invalidMessage: EmailMessage = {
      from: '',
      to: 'recipient@example.com',
      subject: 'Welcome',
      textBody: 'Welcome aboard!',
      htmlBody: '<p>Welcome aboard!</p>',
    };

    const result = await adapter.send(invalidMessage);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(adapter.sentMessages.length).toBe(0);
  });

  it('should always verify successfully', async () => {
    expect(await adapter.verify()).toBe(true);
  });
});

describe('SendgridMailerAdapter Unit Tests', () => {
  const validMessage: EmailMessage = {
    from: 'support@example.com',
    to: 'user@example.com',
    subject: 'Verification Code',
    textBody: 'Your code is 123456',
    htmlBody: '<p>Your code is 123456</p>',
  };

  it('should fail fast if credentials are missing', async () => {
    const adapter = new SendgridMailerAdapter({
      apiKey: '',
      apiUrl: 'https://api.sendgrid.com',
      sendPath: '/v3/mail/send',
      verifyPath: '/v3/user/profile',
    });

    const result = await adapter.send(validMessage);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing SENDGRID_API_KEY');
    expect(await adapter.verify()).toBe(false);
  });

  it('should dispatch request to configured endpoint using httpClient', async () => {
    let capturedUrl = '';
    let capturedHeaders: any = {};
    let capturedBody: any = null;

    const mockHttpClient: IMailerHttpClient = {
      post: vi.fn().mockImplementation(async (url, body, headers) => {
        capturedUrl = url;
        capturedHeaders = headers;
        capturedBody = body;
        return {
          status: 202,
          data: {},
          headers: { 'x-message-id': 'sg-msg-12345' },
        };
      }),
      get: vi.fn().mockResolvedValue({ status: 200, data: { username: 'testuser' } }),
    };

    const adapter = new SendgridMailerAdapter({
      apiKey: 'SG.test_key_123',
      apiUrl: 'https://custom-gateway.local',
      sendPath: '/custom/v3/send',
      verifyPath: '/custom/v3/profile',
    }, mockHttpClient);

    const result = await adapter.send(validMessage);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('sg-msg-12345');
    expect(capturedUrl).toBe('https://custom-gateway.local/custom/v3/send');
    expect(capturedHeaders['Authorization']).toBe('Bearer SG.test_key_123');
    expect(capturedBody.personalizations[0].to[0].email).toBe('user@example.com');

    const isVerified = await adapter.verify();
    expect(isVerified).toBe(true);
  });

  it('should handle provider errors gracefully', async () => {
    const mockHttpClient: IMailerHttpClient = {
      post: vi.fn().mockResolvedValue({
        status: 401,
        data: { errors: [{ message: 'The provided authorization grant is invalid' }] },
      }),
      get: vi.fn().mockResolvedValue({ status: 401, data: {} }),
    };

    const adapter = new SendgridMailerAdapter({
      apiKey: 'SG.invalid_key',
      apiUrl: 'https://api.sendgrid.com',
      sendPath: '/v3/mail/send',
      verifyPath: '/v3/user/profile',
    }, mockHttpClient);

    const result = await adapter.send(validMessage);
    expect(result.success).toBe(false);
    expect(result.error).toContain('SendGrid Error 401');

    expect(await adapter.verify()).toBe(false);
  });

  it('should catch network exceptions and return formatted error', async () => {
    const mockHttpClient: IMailerHttpClient = {
      post: vi.fn().mockRejectedValue(new Error('ETIMEDOUT: Connection timed out')),
      get: vi.fn().mockRejectedValue(new Error('ETIMEDOUT')),
    };

    const adapter = new SendgridMailerAdapter({
      apiKey: 'SG.test_key',
      apiUrl: 'https://api.sendgrid.com',
      sendPath: '/v3/mail/send',
      verifyPath: '/v3/user/profile',
    }, mockHttpClient);

    const result = await adapter.send(validMessage);
    expect(result.success).toBe(false);
    expect(result.error).toContain('ETIMEDOUT');
  });
});

describe('SesMailerAdapter Unit Tests', () => {
  const validMessage: EmailMessage = {
    from: 'support@example.com',
    to: 'user@example.com',
    subject: 'Verification Code',
    textBody: 'Your code is 123456',
    htmlBody: '<p>Your code is 123456</p>',
  };

  it('should fail fast if AWS credentials or region are missing', async () => {
    const adapter = new SesMailerAdapter({
      region: '',
      accessKeyId: '',
      secretAccessKey: '',
      endpointTemplate: 'https://email.{region}.amazonaws.com',
      sendPath: '/v2/email/outbound-emails',
      accountPath: '/v2/email/account',
    });

    const result = await adapter.send(validMessage);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing AWS_ACCESS_KEY_ID');
    expect(await adapter.verify()).toBe(false);
  });

  it('should construct SigV4 signed request and resolve region in URL', async () => {
    let capturedUrl = '';
    let capturedHeaders: any = {};
    let capturedBody: any = null;

    const mockHttpClient: IMailerHttpClient = {
      post: vi.fn().mockImplementation(async (url, body, headers) => {
        capturedUrl = url;
        capturedHeaders = headers;
        capturedBody = body;
        return {
          status: 200,
          data: { MessageId: 'ses-msg-abcdef123' },
        };
      }),
      get: vi.fn().mockResolvedValue({ status: 200, data: { SendingEnabled: true } }),
    };

    const adapter = new SesMailerAdapter({
      region: 'eu-west-1',
      accessKeyId: 'AKIA_MOCK_TEST_1234',
      secretAccessKey: 'mock_secret_key_5678',
      endpointTemplate: 'https://email.{region}.amazonaws.com',
      sendPath: '/v2/email/outbound-emails',
      accountPath: '/v2/email/account',
    }, mockHttpClient);

    const result = await adapter.send(validMessage);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('ses-msg-abcdef123');
    expect(capturedUrl).toBe('https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails');
    expect(capturedHeaders['Authorization']).toContain('AWS4-HMAC-SHA256');
    expect(capturedHeaders['Authorization']).toContain('AKIA_MOCK_TEST_1234');
    expect(capturedHeaders['X-Amz-Date']).toBeDefined();
    expect(capturedBody.Content.Raw.Data).toBeDefined();

    const isVerified = await adapter.verify();
    expect(isVerified).toBe(true);
  });

  it('should handle SES error responses properly', async () => {
    const mockHttpClient: IMailerHttpClient = {
      post: vi.fn().mockResolvedValue({
        status: 400,
        data: { message: 'Email address is not verified' },
      }),
      get: vi.fn().mockResolvedValue({ status: 403, data: {} }),
    };

    const adapter = new SesMailerAdapter({
      region: 'us-east-1',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'test_secret',
      endpointTemplate: 'https://email.{region}.amazonaws.com',
      sendPath: '/v2/email/outbound-emails',
      accountPath: '/v2/email/account',
    }, mockHttpClient);

    const result = await adapter.send(validMessage);
    expect(result.success).toBe(false);
    expect(result.error).toContain('SES Error 400');
    expect(await adapter.verify()).toBe(false);
  });
});

describe('SmtpMailerAdapter Unit Tests', () => {
  it('should fail fast on missing envelope or credentials', async () => {
    const adapter = new SmtpMailerAdapter({
      host: '',
      port: 587,
      user: 'test',
      pass: 'test',
    });

    const result = await adapter.send({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Test',
      textBody: 'Hello',
      htmlBody: '<p>Hello</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing SMTP host');
  });

  it('should fail fast on invalid recipient without opening socket', async () => {
    const adapter = new SmtpMailerAdapter({
      host: 'localhost',
      port: 587,
      user: 'test',
      pass: 'test',
    });

    const result = await adapter.send({
      from: 'sender@example.com',
      to: 'invalid-recipient',
      subject: 'Test',
      textBody: 'Hello',
      htmlBody: '<p>Hello</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid recipient email address format');
  });

  it('should trap connection errors safely during verify', async () => {
    const adapter = new SmtpMailerAdapter({
      host: '127.0.0.1',
      port: 65534,
      user: 'test',
      pass: 'test',
    });

    const isVerified = await adapter.verify();
    expect(isVerified).toBe(false);
  });
});

describe('MailerFactory Unit Tests', () => {
  it('should resolve MockMailerAdapter by default', () => {
    const mailer = createMailer();
    expect(mailer).toBeInstanceOf(MockMailerAdapter);
  });

  it('should resolve SmtpMailerAdapter when provider is smtp and config exists', () => {
    const mailer = createMailer({
      provider: 'smtp',
      from: 'admin@example.com',
      smtp: { host: 'smtp.example.com', port: 587, user: 'u', pass: 'p' },
    });
    expect(mailer).toBeInstanceOf(SmtpMailerAdapter);
  });

  it('should resolve SesMailerAdapter when provider is ses and config exists', () => {
    const mailer = createMailer({
      provider: 'ses',
      from: 'admin@example.com',
      ses: {
        region: 'us-east-1',
        accessKeyId: 'AKIA_KEY',
        secretAccessKey: 'SEC_KEY',
        endpointTemplate: 'https://email.{region}.amazonaws.com',
        sendPath: '/v2/email/outbound-emails',
        accountPath: '/v2/email/account',
      },
    });
    expect(mailer).toBeInstanceOf(SesMailerAdapter);
  });

  it('should resolve SendgridMailerAdapter when provider is sendgrid and config exists', () => {
    const mailer = createMailer({
      provider: 'sendgrid',
      from: 'admin@example.com',
      sendgrid: {
        apiKey: 'SG.123',
        apiUrl: 'https://api.sendgrid.com',
        sendPath: '/v3/mail/send',
        verifyPath: '/v3/user/profile',
      },
    });
    expect(mailer).toBeInstanceOf(SendgridMailerAdapter);
  });

  it('should fallback to MockMailerAdapter if provider config is missing', () => {
    const mailer = createMailer({
      provider: 'ses',
      from: 'admin@example.com',
      ses: undefined,
    });
    expect(mailer).toBeInstanceOf(MockMailerAdapter);
  });
});
