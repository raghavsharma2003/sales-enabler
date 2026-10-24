// The payment-gateway seam for wallet top-ups. v1 ships a fake (tests, demos) and a real adapter that is DISABLED:
// it refuses until the owner turns on a gateway (Razorpay per the blueprint) with keys held outside the repo.
// A top-up credits the wallet only on a captured payment, once per gateway reference. The idempotency key is fixed per
// approval (topup.ts), so a retried request is the same payment to the gateway, never a second one.

export interface Charge { inrMilli: number; workspaceId: string; idempotencyKey: string }
export type ChargeResult =
  | { status: 'captured'; gatewayRef: string }
  | { status: 'failed'; gatewayRef: string; reason: string };

export interface PaymentGateway {
  name: string;
  enabled: boolean;
  charge(c: Charge): Promise<ChargeResult>;
  /** What the gateway recorded for an idempotency key (null = it never saw it). Resolves 'unknown' payments.
   *  A gateway without it leaves them unknown for a person to settle. */
  lookup?(idempotencyKey: string): Promise<ChargeResult | null>;
}

/** Captures every charge with a synthetic reference; `failNext` makes the next one fail (tests). */
export class FakeGateway implements PaymentGateway {
  name = 'fake';
  enabled = true;
  failNext = false;
  /** Capture, then lose the response (the adapter throws): the case a blind retry would double-charge. */
  loseNextResponse = false;
  charges: Charge[] = [];
  private seen = new Map<string, ChargeResult>();
  async charge(c: Charge): Promise<ChargeResult> {
    const prior = this.seen.get(c.idempotencyKey);
    if (prior) return prior;                                  // same key, same payment: like a real gateway
    this.charges.push(c);
    const gatewayRef = 'fake_' + c.idempotencyKey;
    const res: ChargeResult = this.failNext ? { status: 'failed', gatewayRef, reason: 'declined by the fake gateway' } : { status: 'captured', gatewayRef };
    this.failNext = false;
    this.seen.set(c.idempotencyKey, res);
    if (this.loseNextResponse) { this.loseNextResponse = false; throw new Error('socket hang up (fake: captured, response lost)'); }
    return res;
  }
  async lookup(key: string): Promise<ChargeResult | null> { return this.seen.get(key) ?? null; }
}

/** The real adapter. Disabled: no live gateway is wired until the owner approves one. */
export class RazorpayGateway implements PaymentGateway {
  name = 'razorpay';
  enabled = false;
  async charge(): Promise<ChargeResult> {
    throw new Error('online top-up is not switched on yet; ask Vyakti support for a manual credit');
  }
}

// The fake credits money for nothing, so it is never the default: only VP_PAYMENTS=fake (dev) or setGateway (tests).
let current: PaymentGateway = process.env.VP_PAYMENTS === 'fake' ? new FakeGateway() : new RazorpayGateway();
export const gateway = (): PaymentGateway => current;
export function setGateway(g: PaymentGateway): void { current = g; }
