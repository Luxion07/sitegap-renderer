export class SlotLimiter {
  private activeCount = 0;

  constructor(private readonly maxSlots: number) {}

  acquire(): boolean {
    if (this.activeCount >= this.maxSlots) {
      return false;
    }

    this.activeCount++;
    return true;
  }

  release(): void {
    if (this.activeCount > 0) {
      this.activeCount--;
    }
  }

  get active(): number {
    return this.activeCount;
  }

  get capacity(): number {
    return this.maxSlots;
  }
}
