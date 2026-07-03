export class AppError extends Error {
  public readonly statusCode: number;
  // Optional machine-readable identifier (e.g. "PROFILE_INCOMPLETE") so the FE
  // can branch on specific failures without string-matching the message.
  public readonly errorCode?: string;

  constructor(message: string, statusCode = 400, errorCode?: string) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}
