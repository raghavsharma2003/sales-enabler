# The cost meter: per component, in the cost_line vocabulary (ears / brain / voice / telephony / platform; units
# second / token / char / call / request), integer milli-rupees at ₹95/$ (catalog.FX). Usage accumulates exactly;
# emitted lines carry the delta since the last emission, so their sum always equals the rounded total and never drifts.
from . import catalog


class CostMeter:
    def __init__(self, max_inr_milli=None):
        self.lines = {}            # (component, provider, unit) -> {'qty', 'inr', 'qty_sent', 'milli_sent', 'detail'}
        self.max_inr_milli = max_inr_milli
        self.extra_inr = 0.0       # running estimates that are billed later (telephony accrual) count toward the limit

    def add(self, component, provider, unit, quantity, usd=None, inr=None, detail=None):
        if not quantity and not usd and not inr: return
        k = (component, provider, unit)
        ln = self.lines.setdefault(k, {'qty': 0.0, 'inr': 0.0, 'qty_sent': 0.0, 'milli_sent': 0, 'detail': {}})
        ln['qty'] += quantity or 0
        ln['inr'] += (inr if inr is not None else (usd or 0.0) * catalog.FX)
        for dk, dv in (detail or {}).items():
            if isinstance(dv, (int, float)) and not isinstance(dv, bool): ln['detail'][dk] = ln['detail'].get(dk, 0) + dv
            else: ln['detail'][dk] = dv

    def set_total(self, component, provider, unit, quantity, inr, detail=None):
        """For lines billed as a running absolute (telephony pulses): replace, not add."""
        k = (component, provider, unit)
        ln = self.lines.setdefault(k, {'qty': 0.0, 'inr': 0.0, 'qty_sent': 0.0, 'milli_sent': 0, 'detail': {}})
        ln['qty'] = quantity; ln['inr'] = inr
        if detail: ln['detail'].update(detail)

    def total_milli(self):
        return int(round(sum(ln['inr'] for ln in self.lines.values()) * 1000 + self.extra_inr * 1000))

    def over_limit(self):
        return self.max_inr_milli is not None and self.total_milli() >= self.max_inr_milli

    def drain(self):
        """Cost events (without seq/at) for everything not yet emitted."""
        out = []
        for (component, provider, unit), ln in self.lines.items():
            milli = int(round(ln['inr'] * 1000))
            dq = ln['qty'] - ln['qty_sent']; dm = milli - ln['milli_sent']
            if dm == 0 and abs(dq) < 1e-9: continue
            ev = {'type': 'cost', 'component': component, 'provider': provider, 'quantity': round(dq, 3), 'unit': unit, 'inrMilli': dm}
            if ln['detail']: ev['detail'] = dict(ln['detail'])
            out.append(ev)
            ln['qty_sent'] = ln['qty']; ln['milli_sent'] = milli
        return out
