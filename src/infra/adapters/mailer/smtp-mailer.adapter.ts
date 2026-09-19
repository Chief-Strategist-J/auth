/**
 * @file smtp-mailer.adapter.ts
 * @description SMTP MailerPort adapter transmitting RFC 2045 MIME payloads over TLS/STARTTLS connections.
 *
 * OVERALL ALGORITHM:
 * 1. Execute fail-fast verification on email message envelope and SMTP configuration parameters.
 * 2. Generate RFC 2045 multipart/alternative MIME message payload.
 * 3. Establish TCP/TLS socket connection based on configured port (implicit TLS for 465, STARTTLS otherwise).
 * 4. Execute SMTP handshake (EHLO, AUTH PLAIN, MAIL FROM, RCPT TO, DATA).
 * 5. Transmit MIME message terminated with CRLF dot sequence and await server acknowledgment.
 * 6. Issue QUIT command, cleanly destroy socket resources, and return delivery status.
 */

import * as net from 'node:net';
import * as tls from 'node:tls';
import { buildMimeMessage } from '../../../shared/utils/mime.util';
import type { MailerPort, EmailMessage, SendMailResult } from '../../../shared/ports/mailer.port';
import { validateEmailMessage, extractEmail, formatMailerError } from '../../../shared/utils/mailer.util';
import type { SmtpMailerConfig } from '../../../config/mailer.config';

export type { SmtpMailerConfig as SmtpConfig };

export class SmtpMailerAdapter implements MailerPort {
  readonly providerName = 'SMTP';

  constructor(private readonly config: SmtpMailerConfig) {}

  private validateCredentials(): { isValid: boolean; error?: string } {
    if (!this.config.host || this.config.host.trim() === '') {
      return { isValid: false, error: 'SMTP configuration failed: Missing SMTP host' };
    }
    if (!this.config.port || isNaN(this.config.port)) {
      return { isValid: false, error: 'SMTP configuration failed: Invalid SMTP port' };
    }
    return { isValid: true };
  }

  async send(message: EmailMessage): Promise<SendMailResult> {
    const messageValidation = validateEmailMessage(message);
    if (!messageValidation.isValid) {
      return { success: false, error: messageValidation.error };
    }

    const credentialValidation = this.validateCredentials();
    if (!credentialValidation.isValid) {
      return { success: false, error: credentialValidation.error };
    }

    try {
      const mimeBody = buildMimeMessage({
        from: message.from,
        to: message.to,
        subject: message.subject,
        textBody: message.textBody,
        htmlBody: message.htmlBody,
        replyTo: message.replyTo,
      });

      const response = await this.sendViaSMTP(message.from, message.to, mimeBody);
      return { success: true, messageId: response };
    } catch (err: unknown) {
      return { success: false, error: formatMailerError(this.providerName, err) };
    }
  }

  async verify(): Promise<boolean> {
    const credCheck = this.validateCredentials();
    if (!credCheck.isValid) {
      return false;
    }

    let socket: net.Socket | tls.TLSSocket | null = null;
    try {
      socket = await this.connect();
      await this.readResponse(socket);
      await this.sendCommand(socket, 'EHLO localhost');
      await this.sendCommand(socket, 'QUIT');
      return true;
    } catch {
      return false;
    } finally {
      if (socket) {
        socket.destroy();
      }
    }
  }

  private async sendViaSMTP(from: string, to: string, mimeBody: string): Promise<string> {
    const socket = await this.connect();

    try {
      await this.readResponse(socket);
      await this.sendCommand(socket, 'EHLO localhost');

      if (this.config.user && this.config.pass) {
        const credentials = Buffer.from(`\0${this.config.user}\0${this.config.pass}`).toString('base64');
        await this.sendCommand(socket, `AUTH PLAIN ${credentials}`);
      }

      await this.sendCommand(socket, `MAIL FROM:<${extractEmail(from)}>`);
      await this.sendCommand(socket, `RCPT TO:<${extractEmail(to)}>`);
      await this.sendCommand(socket, 'DATA');

      socket.write(mimeBody + '\r\n.\r\n');
      const dataResponse = await this.readResponse(socket);

      await this.sendCommand(socket, 'QUIT');
      return dataResponse;
    } finally {
      socket.destroy();
    }
  }

  private connect(): Promise<net.Socket | tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      const isSecure = this.config.secure ?? this.config.port === 465;
      const options = { host: this.config.host, port: this.config.port, rejectUnauthorized: false };

      if (isSecure) {
        const socket = tls.connect(options, () => resolve(socket));
        socket.on('error', reject);
      } else {
        const socket = net.connect(options, () => resolve(socket));
        socket.on('error', reject);
      }
    });
  }

  private sendCommand(socket: net.Socket | tls.TLSSocket, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      socket.write(command + '\r\n');
      socket.once('data', (data) => {
        const response = data.toString();
        const code = parseInt(response.substring(0, 3), 10);
        if (code >= 200 && code < 400) {
          resolve(response);
        } else {
          reject(new Error(`SMTP Error: ${response.trim()}`));
        }
      });
      socket.once('error', reject);
    });
  }

  private readResponse(socket: net.Socket | tls.TLSSocket): Promise<string> {
    return new Promise((resolve, reject) => {
      socket.once('data', (data) => resolve(data.toString()));
      socket.once('error', reject);
    });
  }
}
