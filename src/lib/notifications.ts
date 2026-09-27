/**
 * Notification architecture for expiration warnings (Part 7, registered users).
 *
 * The cleanup job decides *who* to notify and guarantees at-most-once delivery per
 * folder lifetime (via Folder.expiryWarningSentAt). Providers only deliver.
 * To add real email, implement NotificationProvider (SMTP, Resend, SES, ...) and
 * select it in getNotificationProvider() via NOTIFICATION_PROVIDER.
 */

export interface ExpiryWarningMessage {
  to: string;
  recipientName: string | null;
  folderCode: string;
  folderName: string;
  expiresAt: Date;
  remainingMs: number;
  folderUrl: string;
}

export interface NotificationProvider {
  readonly name: string;
  sendExpiryWarning(message: ExpiryWarningMessage): Promise<void>;
}

/**
 * Default provider: writes the message to the server log. Safe for dev and for
 * deployments that have not configured an email service yet.
 */
export class LogNotificationProvider implements NotificationProvider {
  readonly name = "log";

  async sendExpiryWarning(message: ExpiryWarningMessage): Promise<void> {
    console.info(
      "[notifications] expiry warning",
      JSON.stringify({
        to: message.to,
        folderCode: message.folderCode,
        expiresAt: message.expiresAt.toISOString(),
        remainingHours: Math.round(message.remainingMs / 3600000),
      })
    );
  }
}

let providerInstance: NotificationProvider | null = null;

export function getNotificationProvider(): NotificationProvider {
  if (providerInstance) return providerInstance;

  switch ((process.env.NOTIFICATION_PROVIDER || "log").toLowerCase()) {
    // case "smtp": providerInstance = new SmtpNotificationProvider(...); break;
    default:
      providerInstance = new LogNotificationProvider();
  }
  return providerInstance;
}
