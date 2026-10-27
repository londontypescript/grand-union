/**
 * Caps the number of concurrently-mounted ink instances (one per `shell`
 * channel) — a lightweight resource-exhaustion guard for a public,
 * unauthenticated SSH listener. `tryAcquire` and `release` are the only
 * operations `server.ts`/`session.ts` need; the count itself stays private.
 */
export class SessionLimiter {
  #count = 0;

  constructor(private readonly max: number) {}

  tryAcquire(): boolean {
    if (this.#count >= this.max) {
      return false;
    }
    this.#count += 1;
    return true;
  }

  release(): void {
    this.#count = Math.max(0, this.#count - 1);
  }
}
