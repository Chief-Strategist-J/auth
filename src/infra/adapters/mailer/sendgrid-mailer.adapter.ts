/**
 * @file sendgrid-mailer.adapter.ts
 * @description SendGrid MailerPort adapter sending transactional emails via configurable SendGrid REST API.
 *
 * OVERALL ALGORITHM:
 * 1. Validate SendGrid API key via fail-fast guard.
 * 2. Translate canonical EmailMessage into SendGrid v3 JSON payload with personalizations and content blocks.
 * 3. Resolve target endpoint from centralized configuration.
 * 4. Dispatch request via shared ScalableHttpClient with Bearer authentication.
 * 5. Parse 2xx response status (202 Accepted) and extract message ID from headers or payload.
 * 6. Verify credentials by querying SendGrid user profile endpoint.
 */

import type { EmailMessage, SendMailResult } from '../../../shared/ports/mailer.port';
import { extractEmail } from '../../../shared/utils/mailer.util';
import {
  type SendgridMailerConfig,
  resolveSendgridSendUrl,
  resolveSendgridVerifyUrl,
} from '../../../config/mailer.config';
import {
  BaseRestMailerAdapter,
  type IMailerHttpClient,
  type PreparedRequest,
} from './base-rest-mailer.adapter';

export type { SendgridMailerConfig as SendgridConfig };

export class SendgridMailerAdapter extends BaseRestMailerAdapter {
  readonly providerName = 'SendGrid';

  constructor(
    private readonly config: SendgridMailerConfig,
    customClient?: IMailerHttpClient
  ) {
    super(customClient);
  }

  protected validateCredentials(): { isValid: boolean; error?: string } {
    if (!this.config.apiKey || this.config.apiKey.trim() === '') {
      return { isValid: false, error: 'SendGrid authentication failed: Missing SENDGRID_API_KEY' };
    }
    return { isValid: true };
  }

  protected buildPayload(message: EmailMessage): PreparedRequest {
    const payload = {
      personalizations: [{ to: [{ email: extractEmail(message.to) }] }],
      from: { email: extractEmail(message.from) },
      subject: message.subject,
      content: [
        ...(message.textBody ? [{ type: 'text/plain', value: message.textBody }] : []),
        ...(message.htmlBody ? [{ type: 'text/html', value: message.htmlBody }] : []),
      ],
      reply_to: message.replyTo ? { email: extractEmail(message.replyTo) } : undefined,
    };

    return {
      url: resolveSendgridSendUrl(this.config),
      body: payload,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  }

  protected parseSendResponse(response: { data: any; status: number; headers?: any }): SendMailResult {
    if (response.status >= 200 && response.status < 300) {
      const getHeader = typeof response.headers?.get === 'function'
        ? (k: string) => response.headers.get(k)
        : (k: string) => response.headers?.[k] || response.headers?.[k.toLowerCase()];
      const messageId = getHeader('x-message-id') || response.data?.message_id || undefined;
      return { success: true, messageId };
    }

    const detail = typeof response.data === 'string'
      ? response.data
      : response.data?.errors
        ? JSON.stringify(response.data.errors)
        : JSON.stringify(response.data || {});

    return {
      success: false,
      error: `SendGrid Error ${response.status}: ${detail}`,
    };
  }

  async verify(): Promise<boolean> {
    const credCheck = this.validateCredentials();
    if (!credCheck.isValid) {
      return false;
    }

    try {
      const targetUrl = resolveSendgridVerifyUrl(this.config);
      const response = await this.httpClient.get(targetUrl, {
        'Authorization': `Bearer ${this.config.apiKey}`,
      });
      return response.status >= 200 && response.status < 300;
    } catch {
      return false;
    }
  }
}
