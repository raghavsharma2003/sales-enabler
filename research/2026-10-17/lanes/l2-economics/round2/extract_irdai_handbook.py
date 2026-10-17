"""Extract the IRDAI Handbook 2024-25 tables this package relies on (round 2, r2-economics-renewal, 2026-10-17).

Source: IRDAI "Handbook on Indian Insurance Statistics 2024-25" (zip of xlsx, published on irdai.gov.in, file dates
2026-02-03). Round-1 l3v downloaded it to the session scratchpad; this script reads that copy (read-only) and writes
small CSVs into ./data/. Pass the folder holding "Part I.xlsx" ... "Part V.xlsx" as argv[1].

Tables used:
  T103 channel-wise general insurance GDP (motor OD / TP by channel), FY2024-25, INR crore
  T104 channel-wise health insurance (individual business: policies, persons, premium), FY2024-25
  T99  channel-wise life individual new business (policies, premium), FY2024-25
  T50  policyholders' account: net commission vs net premium earned, FY2024-25, by insurer
  T44  motor and health incurred claims ratios, FY2024-25

Run: python3 -I extract_irdai_handbook.py "<folder>"
"""
import csv
import os
import sys

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data")


def rows_of(path, sheet):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    return [list(r) for r in wb[sheet].iter_rows(values_only=True)]


def t103(folder):
    rows = rows_of(os.path.join(folder, "Part V.xlsx"), "103")
    hdr, yrs = rows[2], rows[3]
    chans = [(j, c) for j, c in enumerate(hdr) if c and j > 0]
    out = []
    for r in rows[4:20]:
        if r[0] not in ("Motor Own Damage", "Motor Third Party", "Grand Total"):
            continue
        for j, name in chans:
            for k in range(j, j + 11):
                if yrs[k] == "2024-25":
                    out.append(dict(table="T103", year="2024-25", segment=r[0], channel=name.strip(),
                                    metric="gross_direct_premium_inr_cr", value=round(float(r[k] or 0), 2)))
    return out


def t104(folder):
    rows = rows_of(os.path.join(folder, "Part V.xlsx"), "104")
    out = []
    j = 184  # 2024-25 block, "Individual Business" sub-block (columns verified by header rows 2-3)
    assert rows[2][j] == "Individual Business", rows[2][j]
    assert rows[3][j] == "No.of policies Issued"
    for r in rows[4:17]:
        if not r[0]:
            continue
        pol, prem_lakh = r[j], r[j + 2]
        out.append(dict(table="T104", year="2024-25", segment="health_individual", channel=r[0].strip(),
                        metric="policies", value=pol))
        out.append(dict(table="T104", year="2024-25", segment="health_individual", channel=r[0].strip(),
                        metric="gross_premium_inr_cr", value=round(float(prem_lakh or 0) / 100, 2)))
        if pol:
            out.append(dict(table="T104", year="2024-25", segment="health_individual", channel=r[0].strip(),
                            metric="avg_premium_per_policy_inr", value=round(float(prem_lakh) * 1e5 / pol)))
    return out


def t99(folder):
    rows = rows_of(os.path.join(folder, "Part V.xlsx"), "99")
    assert rows[2][12] == "2024-25" and rows[2][23] == "2024-25"
    out = []
    for r in rows[3:40]:
        if not r[1] or r[1] == "Particulars":
            continue
        if not isinstance(r[12], (int, float)):
            continue
        out.append(dict(table="T99", year="2024-25", segment="life_individual_new_business", channel=str(r[1]).strip(),
                        metric="policies", value=r[12]))
        out.append(dict(table="T99", year="2024-25", segment="life_individual_new_business", channel=str(r[1]).strip(),
                        metric="premium_inr_cr", value=round(float(r[23] or 0), 2)))
        if r[12]:
            out.append(dict(table="T99", year="2024-25", segment="life_individual_new_business", channel=str(r[1]).strip(),
                            metric="avg_nb_premium_per_policy_inr_incl_single", value=round(float(r[23]) * 1e7 / r[12])))
    return out


def t50(folder):
    rows = rows_of(os.path.join(folder, "Part II.xlsx"), "50")
    ins, yrs, seg = rows[2], rows[3], rows[4]
    com = [r for r in rows if r[0] == "Commission"][0]
    npe = [r for r in rows if r[0] and str(r[0]).startswith("Premiums earned")][0]
    out = []
    name, year = None, None
    for k in range(1, len(ins)):
        if ins[k]:
            name = str(ins[k]).strip()
        if yrs[k]:
            year = yrs[k]
        is_total = seg[k] is not None and str(seg[k]).strip() == "Total"
        # stand-alone health insurers have a single Miscellaneous column per year (no "Total")
        sahi_col = k >= 977 and year == "2024-25" and (seg[k] is None or str(seg[k]).strip() == "Miscellaneous")
        if year == "2024-25" and (is_total or sahi_col) and npe[k]:
            out.append(dict(table="T50", year="2024-25", segment="all_lines" if is_total else "health(misc)",
                            channel=name, metric="net_commission_over_net_premium_earned",
                            value=round(float(com[k] or 0) / float(npe[k]), 4)))
    # de-duplicate (SAHI blocks can repeat a column)
    seen, dedup = set(), []
    for r in out:
        key = (r["channel"], r["segment"])
        if key not in seen:
            seen.add(key)
            dedup.append(r)
    return dedup


def t44(folder):
    rows = rows_of(os.path.join(folder, "Part II.xlsx"), "44")
    out = []
    for r in rows:
        s = " ".join(str(c) for c in r[:2] if c)
        if any(x in s for x in ("Public Sector Insurers Total", "Private Sector Insurers Total",
                                "Stand-alone Health Insurers Total", "Grand Total")):
            label = s.strip()
            for seg, col in (("motor", 100), ("health", 133)):
                if isinstance(r[col], (int, float)) and r[col]:
                    out.append(dict(table="T44", year="2024-25", segment=seg, channel=label,
                                    metric="incurred_claims_ratio_pct", value=round(float(r[col]), 2)))
    return out


def main():
    folder = sys.argv[1]
    allrows = t103(folder) + t104(folder) + t99(folder) + t50(folder) + t44(folder)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "irdai-handbook-2024-25-extracts.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["table", "year", "segment", "channel", "metric", "value"])
        w.writeheader()
        w.writerows(allrows)
    print(len(allrows), "rows written")


if __name__ == "__main__":
    main()
