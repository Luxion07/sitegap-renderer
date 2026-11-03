export class InvalidUrlError extends Error {
  constructor(message = 'Please enter a valid website URL.') {
    super(message);
    this.name = 'InvalidUrlError';
  }
}
