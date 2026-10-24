"""Triangulate segment SAM from three methods: (1) firm-based Monte Carlo (sizing.csv), (2) event-based
cross-checks where available (sizing-crosschecks.csv), (3) firm-based rescaled to the measured Apna job-post
share of the segment family (sizing-vs-jobposts.csv; total seats held constant). Central = geometric mean of
the available methods; range = min(p10-equivalent) .. max(p90-equivalent). Rule written before looking at
which segment it favours; it is mechanical. Run: python3 -I triangulate.py -> sizing-triangulated.csv"""
import csv, math
sz = {r['segment']: r for r in csv.DictReader(open('sizing.csv')) if r.get('sam_cr_p50')}
cc = {r['check']: r for r in csv.DictReader(open('sizing-crosschecks.csv'))}
jp = {r['segment_family']: float(r['ratio_model_to_jobposts']) for r in csv.DictReader(open('sizing-vs-jobposts.csv'))}
fam = {'insurance_renewals': 'insurance', 'insurance_sales': 'insurance', 'lending_collections': 'lending_collections',
       'lending_origination': 'lending_origination', 'edtech_admissions': 'edtech_admissions', 'k12_school_admissions_fees': 'edtech_admissions',
       'study_abroad': 'study_abroad', 'real_estate': 'real_estate', 'd2c_ecom_post_purchase': 'd2c_ecom', 'healthcare_hospitals_clinics': 'healthcare',
       'diagnostics': 'diagnostics', 'auto_dealers': 'auto', 'travel_hospitality': 'travel_hospitality', 'telecom_isp_retention': 'telecom_isp',
       'fintech_saas_onboarding': 'fintech_saas_onboarding', 'solar_rooftop': 'solar', 'matrimony_fitness_misc': 'matrimony'}
ev = {'d2c_ecom_post_purchase': 'D2C event-based (orders x COD/NDR calls)',
      'insurance_renewals': 'Insurance renewals event-based (policies due x follow-up calls)',
      'auto_dealers': 'Auto service reminders event-based (vehicle parc x reminders)'}
out = []
for s, r in sz.items():
    f10, f50, f90 = float(r['sam_cr_p10']), float(r['sam_cr_p50']), float(r['sam_cr_p90'])
    meths = {'firm': (f10, f50, f90)}
    if s in ev:
        e = cc[ev[s]]; meths['event'] = (float(e['p10']), float(e['p50']), float(e['p90']))
    if s in fam and fam[s] in jp:
        k = jp[fam[s]]; meths['jobpost_rescaled'] = (f10 / k, f50 / k, f90 / k)
    cen = math.exp(sum(math.log(v[1]) for v in meths.values()) / len(meths))
    lo = min(v[0] for v in meths.values()); hi = max(v[2] for v in meths.values())
    spread = max(v[1] for v in meths.values()) / min(v[1] for v in meths.values())
    out.append(dict(segment=s, methods='+'.join(meths), firm_p50=round(f50), event_p50=round(meths['event'][1]) if 'event' in meths else '',
                    jobpost_rescaled_p50=round(meths['jobpost_rescaled'][1]) if 'jobpost_rescaled' in meths else '',
                    triangulated_central_cr=round(cen), range_low_cr=round(lo), range_high_cr=round(hi), max_method_disagreement_x=round(spread, 1)))
out.sort(key=lambda d: -d['triangulated_central_cr'])
with open('sizing-triangulated.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
tot = sum(d['triangulated_central_cr'] for d in out)
for d in out: print(d)
print('sum of triangulated centrals (Cr/yr):', tot)
