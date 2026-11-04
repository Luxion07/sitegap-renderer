export class SlotsBusyError extends Error {
  constructor(message = 'All render slots are currently busy') {
    super(message);
    this.name = 'SlotsBusyError';
  }
}
