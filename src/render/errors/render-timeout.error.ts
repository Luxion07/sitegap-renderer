export class RenderTimeoutError extends Error {
  constructor(message = 'Render timed out') {
    super(message);
    this.name = 'RenderTimeoutError';
  }
}
