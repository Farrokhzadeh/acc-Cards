export class GoogleIntegrationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
    public readonly authRequired = false,
  ) {
    super(message);
    this.name = "GoogleIntegrationError";
  }
}
