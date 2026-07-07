declare module "sns-validator" {
  class MessageValidator {
    validate(
      message: string | Record<string, unknown>,
      callback: (error: Error | null, message?: Record<string, unknown>) => void
    ): void;
  }
  export = MessageValidator;
}
