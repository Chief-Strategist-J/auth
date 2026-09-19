/**
 * @file mime.util.ts
 * @description Pure RFC 2045 MIME message formatter for multipart/alternative email payloads.
 *
 * OVERALL ALGORITHM:
 * 1. Generate unique MIME boundary using cryptographic randomness.
 * 2. Construct multipart/alternative body with text/plain and text/html parts.
 * 3. Apply CRLF line termination per RFC 5322.
 * 4. Generate standards-compliant Message-ID header.
 * 5. Assemble complete MIME envelope with headers and encoded body.
 */

import { randomUUID } from 'node:crypto';

export interface MimeEnvelope {
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  replyTo?: string;
}

export function generateMessageId(domain: string): string {
  return `<${randomUUID()}@${domain}>`;
}

export function buildMimeMessage(envelope: MimeEnvelope, domain = 'auth.local'): string {
  const boundary = `----=_Part_${randomUUID().replace(/-/g, '')}`;
  const messageId = generateMessageId(domain);
  const dateStr = new Date().toUTCString();

  const headers = [
    `From: ${envelope.from}`,
    `To: ${envelope.to}`,
    `Subject: ${envelope.subject}`,
    `Date: ${dateStr}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  if (envelope.replyTo) {
    headers.push(`Reply-To: ${envelope.replyTo}`);
  }

  const textPart = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    envelope.textBody,
  ].join('\r\n');

  const htmlPart = [
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    envelope.htmlBody,
  ].join('\r\n');

  const body = [textPart, htmlPart, `--${boundary}--`].join('\r\n');

  return headers.join('\r\n') + '\r\n\r\n' + body;
}
