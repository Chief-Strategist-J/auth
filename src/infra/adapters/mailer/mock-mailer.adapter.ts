/**
 * @file mock-mailer.adapter.ts
 * @description In-memory MailerPort adapter for unit testing and local development.
 *
 * OVERALL ALGORITHM:
 * 1. Execute fail-fast envelope validation against incoming EmailMessage.
 * 2. Store valid messages in an internal array for test assertion.
 * 3. Return deterministic success result with a generated mock messageId.
 * 4. Provide helper methods for retrieving sent messages and clearing state.
 */

import { randomUUID } from 'node:crypto';
import type { MailerPort, EmailMessage, SendMailResult } from '../../../shared/ports/mailer.port';
import { validateEmailMessage } from '../../../shared/utils/mailer.util';

export class MockMailerAdapter implements MailerPort {
  readonly providerName = 'Mock';
  public readonly sentMessages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<SendMailResult> {
    const validation = validateEmailMessage(message);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    this.sentMessages.push({ ...message });
    return { success: true, messageId: `mock-${randomUUID()}` };
  }

  async verify(): Promise<boolean> {
    return true;
  }

  clear(): void {
    this.sentMessages.length = 0;
  }

  getLastMessage(): EmailMessage | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }
}
