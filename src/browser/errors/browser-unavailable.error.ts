export class BrowserUnavailableError extends Error {
  constructor(message = 'Browser is not available') {
    super(message);
    this.name = 'BrowserUnavailableError';
  }
}
