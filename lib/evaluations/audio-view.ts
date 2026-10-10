export class ExclusiveRequestGate {
  private active = false;

  async run<T>(request: () => Promise<T>): Promise<T | undefined> {
    if (this.active) return undefined;
    this.active = true;
    try {
      return await request();
    } finally {
      this.active = false;
    }
  }
}
