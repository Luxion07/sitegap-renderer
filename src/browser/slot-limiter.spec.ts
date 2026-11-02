import { SlotLimiter } from './slot-limiter';

describe('SlotLimiter', () => {
  it('should acquire an available slot', () => {
    const limiter = new SlotLimiter(2);
    expect(limiter.acquire()).toBe(true);
    expect(limiter.active).toBe(1);
  });

  it('should reject acquire when maximum capacity is reached', () => {
    const limiter = new SlotLimiter(2);
    limiter.acquire();
    limiter.acquire();

    expect(limiter.acquire()).toBe(false);
    expect(limiter.active).toBe(2);
  });

  it('should release a slot and allow a new acquire', () => {
    const limiter = new SlotLimiter(2);
    limiter.acquire();
    limiter.acquire();
    expect(limiter.acquire()).toBe(false);

    limiter.release();
    expect(limiter.active).toBe(1);

    expect(limiter.acquire()).toBe(true);
    expect(limiter.active).toBe(2);
  });

  it('should not decrease active count below zero on excess release', () => {
    const limiter = new SlotLimiter(2);
    limiter.release();
    expect(limiter.active).toBe(0);
  });
});
