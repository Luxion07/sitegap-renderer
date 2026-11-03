export class BlockedUrlError extends Error {
  constructor(message = 'This URL cannot be analyzed for security reasons.') {
    super(message);
    this.name = 'BlockedUrlError';
  }
}
