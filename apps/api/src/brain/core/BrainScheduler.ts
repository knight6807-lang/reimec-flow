export class BrainScheduler {
  private readonly running = new Set<string>();
  private readonly timers: NodeJS.Timeout[] = [];

  schedule(name: string, intervalMs: number, fn: () => Promise<void> | void) {
    const run = async () => {
      if (this.running.has(name)) return;
      this.running.add(name);
      try {
        await fn();
      } catch (error) {
        console.error(`[brain-scheduler] ${name} failed:`, error instanceof Error ? error.message : error);
      } finally {
        this.running.delete(name);
      }
    };
    const timer = setInterval(run, intervalMs);
    timer.unref();
    this.timers.push(timer);
    return timer;
  }

  stop() {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.length = 0;
    this.running.clear();
  }
}
