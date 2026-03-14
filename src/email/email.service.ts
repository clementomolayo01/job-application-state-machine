import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private readonly defaultFrom: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY') || 'dumb';
    this.resend = new Resend(apiKey);
    this.defaultFrom = this.configService.get<string>('EMAIL_FROM') || 'no-reply@example.com';
  }

  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    const subject = 'Welcome to Job Application System';
    const body = `Hello ${name},<br><br>Welcome to our system! Your account has been successfully created.`;

    return this.sendWithRetry(email, subject, body);
  }

  async sendStatusChangeNotification(email: string, newStatus: string): Promise<void> {
    const subject = 'Application Status Updated';
    const body = `Your job application status has been updated to: <strong>${newStatus}</strong>.`;

    return this.sendWithRetry(email, subject, body);
  }

  private async sendWithRetry(to: string, subject: string, text: string, maxRetries = 3): Promise<void> {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        const { error } = await this.resend.emails.send({
          from: this.defaultFrom,
          to,
          subject,
          html: `<p>${text}</p>`,
        });

        if (error) {
          throw new Error(error.message);
        }

        this.logger.log(`Email sent successfully to ${to}`);
        return;
      } catch (error: any) {
        retries++;
        this.logger.warn(`Failed to send email to ${to} (Attempt ${retries}/${maxRetries}): ${error.message}`);
        
        if (retries >= maxRetries) {
          this.logger.error(`Exhausted all retries. Could not send email to ${to}.`);
          // We do not throw the error here to ensure we don't crash the request
          return;
        }

        // Exponential backoff: 2^retries * 1000 ms (2s, 4s...)
        const backoffTime = Math.pow(2, retries) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffTime));
      }
    }
  }
}
