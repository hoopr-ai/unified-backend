// Status values are lowercase to stay wire-compatible with the historical
// hoopr-backend campaign rows imported by scripts/migrate-email-campaigns.ts.
export enum EmailCampaignStatus {
  DRAFT = "draft",
  READY = "ready",
  RUNNING = "running",
  PAUSED = "paused",
  COMPLETED = "completed",
  FAILED = "failed",
}

export enum EmailRecipientStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  SENT = "sent",
  FAILED = "failed",
  SKIPPED = "skipped",
}

export enum EmailSuppressionReason {
  BOUNCE = "bounce",
  COMPLAINT = "complaint",
  MANUAL = "manual",
}

export enum EmailEventType {
  BOUNCE = "bounce",
  COMPLAINT = "complaint",
  DELIVERY = "delivery",
}
