/**
 * Bounds how many async tasks run at once, queueing the rest. Used to cap
 * concurrent outbound calls to external services (Yahoo Finance) and
 * concurrent processing of incoming work (Telegram messages), so a burst of
 * simultaneous users can't overwhelm a shared resource all at once.
 */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
