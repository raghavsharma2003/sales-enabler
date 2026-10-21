// The payment-gateway seam for wallet top-ups. v1 ships a fake (tests, demos) and a real adapter that is DISABLED:
// it refuses until the owner turns on a gateway (Razorpay per the blueprint) with keys held outside the repo.
// A top-up credits the wallet only on a captured payment, once per gateway reference.

export interface Charge { inrMilli: number; workspaceId: string; idempotencyKey: string }
export type ChargeResult =
  | { status: 'captured'; gatewayRef: string }
  | { status: 'failed'; gatewayRef: string; reason: string };

export interface PaymentGateway {
  name: string;
  enabled: boolean;
  charge(c: Charge): Promise<ChargeResult>;
}

/** Captures every charge with a synthetic reference; `failNext` makes the next one fail (tests). */
export class FakeGateway implements PaymentGateway {
  name = 'fake';
  enabled = true;
  failNext = false;
  charges: Charge[] = [];
  async charge(c: Charge): Promise<ChargeResult> {
    this.charges.push(c);
    const gatewayRef = 'fake_' + c.idempotencyKey;
    if (this.failNext) { this.failNext = false; return { status: 'failed', gatewayRef, reason: 'declined by the fake gateway' }; }
    return { status: 'captured', gatewayRef };
  }
}

/** The real adapter. Disabled: no live gateway is wired until the owner approves one. */
export class RazorpayGateway implements PaymentGateway {
  name = 'razorpay';
  enabled = false;
  async charge(): Promise<ChargeResult> {
    throw new Error('online top-up is not switched on yet; ask VP success for a manual credit');
  }
}

// The fake credits money for nothing, so it is never the default: only VP_PAYMENTS=fake (dev) or setGateway (tests).
let current: PaymentGateway = process.env.VP_PAYMENTS === 'fake' ? new FakeGateway() : new RazorpayGateway();
export const gateway = (): PaymentGateway => current;
export function setGateway(g: PaymentGateway): void { current = g; }
