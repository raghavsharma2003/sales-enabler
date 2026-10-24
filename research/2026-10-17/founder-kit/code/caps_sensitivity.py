"""Value of one saved renewal to the intermediary under (a) the r2 l2 model's commission triangles and
(b) the IRDAI consultation's proposed maximum commission for Distribution Entities (23-09-2026, proposal only).
Premium triangles are copied from lanes/l2-economics/round2/renewal_model.py. TP share of motor premium is an
assumption anchored on the 2022 TP tariff (2W 75-150cc INR 714; car 1000-1500cc INR 3,416). Computed here."""
import numpy as np
rng=np.random.default_rng(20261017); N=200000
tri=lambda a,b,c: rng.triangular(a,b,c,N)
P={'2W':tri(714,1500,3000),'4W':tri(5000,11000,25000),'health':tri(9000,17000,30000),'life':tri(15000,30000,75000)}
c_model={'2W':tri(.08,.15,.25),'4W':tri(.10,.18,.28),'health':tri(.10,.15,.20),'life':tri(.03,.05,.075)}
tp_share={'2W':np.clip(714/P['2W'],0,1),'4W':np.clip(3416/P['4W'],0,1)}
cap={'2W':0.025*tp_share['2W']+0.10*(1-tp_share['2W']),'4W':0.025*tp_share['4W']+0.10*(1-tp_share['4W']),
     'health':np.full(N,0.05),'life':tri(0.02,0.025,0.03)}
life_obs=tri(0.01,0.025,0.05)  # l2 verifier's observed private renewal-commission re-run
for k in P:
    vm=P[k]*c_model[k]; vc=P[k]*cap[k]
    print(k,'model p50 %.0f [%.0f-%.0f]'%tuple(np.percentile(vm,[50,10,90])),'| caps p50 %.0f [%.0f-%.0f]'%tuple(np.percentile(vc,[50,10,90])),'| ratio p50 %.2f'%np.median(vc/vm), '| P(cap value>=150) %.2f'%np.mean(vc>=150))
vo=P['life']*life_obs; print('life observed-commission p50 %.0f [%.0f-%.0f]'%tuple(np.percentile(vo,[50,10,90])))
