import type { VerificationEmail, VerificationEmailSender } from '../../src/mailer.js';

/** In-memory test transport, injected only by test code; never exposed by HTTP. */
export class RecordingEmailSender implements VerificationEmailSender {
  readonly messages: VerificationEmail[] = [];
  fail = false;
  async sendVerification(message: VerificationEmail): Promise<void> {
    if (this.fail) throw new Error('test-only provider failure');
    this.messages.push({ ...message });
  }
  codeFor(email: string): string {
    const message = [...this.messages].reverse().find(item => item.email === email.trim().toLowerCase());
    if (!message) throw new Error('No test message recorded');
    return message.code;
  }
}
