/**
 * @file ses-mailer.adapter.ts
 * @description AWS SES MailerPort adapter sending RFC 2045 MIME messages via configurable SES REST API.
 *
 * OVERALL ALGORITHM:
 * 1. Validate AWS credentials and region via fail-fast guard.
 * 2. Assemble RFC 2045 multipart/alternative MIME message from canonical email payload.
 * 3. Base64-encode MIME payload and wrap within SES Raw Email JSON structure.
 * 4. Sign request with AWS SigV4 authorization headers over target endpoint and path.
 * 5. Transmit outbound request via shared ScalableHttpClient.
 * 6. Parse message ID on 2xx status or format error response.
 * 7. Verify connectivity by issuing GET request to SES account endpoint.
 */

import { createHmac, createHash } from 'node:crypto';
import { buildMimeMessage } from '../../../shared/utils/mime.util';
import type { EmailMessage, SendMailResult } from '../../../shared/ports/mailer.port';
import {
  type SesMailerConfig,
  resolveSesSendUrl,
  resolveSesAccountUrl,
  resolveSesEndpoint,
} from '../../../config/mailer.config';
import {
  BaseRestMailerAdapter,
  type IMailerHttpClient,
  type PreparedRequest,
} from './base-rest-mailer.adapter';

export type { SesMailerConfig as SesConfig };

export class SesMailerAdapter extends BaseRestMailerAdapter {
  readonly providerName = 'AWS-SES';

  constructor(
    private readonly config: SesMailerConfig,
    customClient?: IMailerHttpClient
  ) {
    super(customClient);
  }

  protected validateCredentials(): { isValid: boolean; error?: string } {
    if (!this.config.accessKeyId || this.config.accessKeyId.trim() === '') {
      return { isValid: false, error: 'SES authentication failed: Missing AWS_ACCESS_KEY_ID' };
    }
    if (!this.config.secretAccessKey || this.config.secretAccessKey.trim() === '') {
      return { isValid: false, error: 'SES authentication failed: Missing AWS_SECRET_ACCESS_KEY' };
    }
    if (!this.config.region || this.config.region.trim() === '') {
      return { isValid: false, error: 'SES configuration failed: Missing AWS_SES_REGION' };
    }
    return { isValid: true };
  }

  protected buildPayload(message: EmailMessage): PreparedRequest {
    const mimeBody = buildMimeMessage({
      from: message.from,
      to: message.to,
      subject: message.subject,
      textBody: message.textBody,
      htmlBody: message.htmlBody,
      replyTo: message.replyTo,
    });

    const rawMessage = Buffer.from(mimeBody).toString('base64');
    const bodyObj = {
      Content: {
        Raw: {
          Data: rawMessage,
        },
      },
    };

    const targetUrl = resolveSesSendUrl(this.config);
    const parsedUrl = new URL(targetUrl);
    const path = parsedUrl.pathname;
    const bodyString = JSON.stringify(bodyObj);
    const signedHeaders = this.signRequest('POST', path, bodyString, parsedUrl.host);

    return {
      url: targetUrl,
      body: bodyObj,
      headers: {
        ...signedHeaders,
        'Content-Type': 'application/json',
      },
    };
  }

  protected parseSendResponse(response: { data: any; status: number; headers?: any }): SendMailResult {
    if (response.status >= 200 && response.status < 300) {
      const messageId = response.data?.MessageId || response.data?.messageId;
      return { success: true, messageId };
    }

    const detail = typeof response.data === 'string'
      ? response.data
      : response.data?.message || JSON.stringify(response.data || {});

    return {
      success: false,
      error: `SES Error ${response.status}: ${detail}`,
    };
  }

  async verify(): Promise<boolean> {
    const credCheck = this.validateCredentials();
    if (!credCheck.isValid) {
      return false;
    }

    try {
      const targetUrl = resolveSesAccountUrl(this.config);
      const parsedUrl = new URL(targetUrl);
      const signedHeaders = this.signRequest('GET', parsedUrl.pathname, '', parsedUrl.host);

      const response = await this.httpClient.get(targetUrl, signedHeaders);
      return response.status >= 200 && response.status < 300;
    } catch {
      return false;
    }
  }

  private signRequest(method: string, path: string, body: string, hostOverride?: string): Record<string, string> {
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0]! + 'Z';
    const shortDate = dateStamp.substring(0, 8);

    const baseHost = hostOverride || new URL(resolveSesEndpoint(this.config)).host;
    const service = 'ses';
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${shortDate}/${this.config.region}/${service}/aws4_request`;

    const payloadHash = createHash('sha256').update(body).digest('hex');

    const canonicalHeaders = `host:${baseHost}\nx-amz-date:${dateStamp}\n`;
    const signedHeaders = 'host;x-amz-date';

    const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const canonicalRequestHash = createHash('sha256').update(canonicalRequest).digest('hex');

    const stringToSign = [algorithm, dateStamp, credentialScope, canonicalRequestHash].join('\n');

    const signingKey = this.getSignatureKey(shortDate);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      'Host': baseHost,
      'X-Amz-Date': dateStamp,
      'Authorization': authorization,
    };
  }

  private getSignatureKey(dateStamp: string): Buffer {
    const kDate = createHmac('sha256', `AWS4${this.config.secretAccessKey}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(this.config.region).digest();
    const kService = createHmac('sha256', kRegion).update('ses').digest();
    return createHmac('sha256', kService).update('aws4_request').digest();
  }
}
