"""The 50-row messy synthetic CSV for the account phase, plus a fail-closed safety check.

No real people: every name, policy and amount is fictional, and every phone cell is either one of
OUR numbers (N1..N4, read from a mode-600 env file at render time, never written to the repo), a
reserved fictional number (+1 202 555 0123, NANP 555-01XX; +44 20 7946 0000, Ofcom drama range),
or a string that cannot reach any subscriber.

The safety check is the point of this file. Vendor normalisers differ: Vapi's dashboard prepends '+'
to anything (VAP-49), Retell's contact import defaults to +1 (RET-17, RAP-54), others default to +91
or reject. A 10-digit Indian number run through a US or naive normaliser can become a real foreign
subscriber. So every phone cell is expanded under every normaliser we know of, and the render fails
(or withholds the row) unless each candidate is ours, reserved, or impossible.

Tip that makes the full file safe: use Delhi (11-series) virtual numbers for N1..N3. '11XXXXXXXX'
under '+1' or naive '+' lands in NANP area code 1XX, which can never be assigned.

Usage (python3 -I, from the repo root):
  python3 -I research/2026-10-20/teardown/synthesis/code/messy_csv.py build
      -> writes messy-50.template.csv and messy-50.spec.json next to this folder (no numbers in them)
  python3 -I research/2026-10-20/teardown/synthesis/code/messy_csv.py render --env <env file> --out <csv> [--withhold-unsafe]
      env file holds N1_E164=+91..., N2_E164=..., N3_E164=..., optional N4_E164=... (mode 600, scratchpad only)
"""
import csv, io, json, os, re, stat, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.dirname(HERE)
RESERVED = {'+12025550123', '+442079460000'}

COLS = ['Row ID', 'Customer Name', 'Phone Number', 'alt phone', 'Language', 'Policy No', 'Due Date',
        'Premium (INR)', 'City', 'State', 'Opt Out', 'Consent Source', 'Consent Date', 'Call Category',
        'Timezone', 'Notes', 'Email', '']  # trailing empty header = an unnamed empty column

# (row id, group, trap, cells dict, expected VP behaviour)
R = []
def row(rid, group, trap, expected, **cells):
    R.append((rid, group, trap, cells, expected))

# A: N1 = dialable customer 'Sunita Verma' (8 rows; 7 are one person in different formats)
row('R01', 'A', 'control row, clean E.164, Devanagari name', 'dial once',
    name='सुनीता वर्मा', phone='{N1:e164}', lang='hi', policy='SH-100001', due='15/11/2026', prem='24,500', city='Lucknow', state='UP', consent='policy_purchase', cdate='2025-11-15', cat='service', tz='Asia/Kolkata')
row('R02', 'A', 'exact duplicate of R01', 'merge with R01; flag duplicate; no extra dial',
    name='सुनीता वर्मा', phone='{N1:e164}', lang='hi', policy='SH-100001', due='15/11/2026', prem='24,500', city='Lucknow', state='UP', consent='policy_purchase', cdate='2025-11-15', cat='service', tz='Asia/Kolkata')
row('R03', 'A', '10-digit without +91; Latin-script name of the same person', 'normalise to +91; flag cross-format, cross-script duplicate of R01',
    name='Sunita Verma', phone='{N1:10}', lang='hi', policy='SH-100001', due='15/11/2026', prem='24500', city='Lucknow', state='Uttar Pradesh', cat='service')
row('R04', 'A', '0-prefixed 11-digit; ALL CAPS name with trailing space', 'normalise; flag duplicate',
    name='SUNITA VERMA ', phone='{N1:0}', lang='Hindi', policy='SH-100001', due='2026-11-15', prem='24500', city='lucknow', state='UP', cat='service')
row('R05', 'A', "91-prefixed 12-digit without '+'; honorific; rupee sign in amount", 'normalise; flag duplicate; parse amount',
    name='Smt. Sunita Verma', phone='{N1:91}', lang='hi', policy='SH100001', due='15 Nov 2026', prem='₹ 24500', city='Lucknow', state='UP', cat='service')
row('R06', 'A', 'spaced +91 format; premium missing (prompt variable empty)', 'normalise; flag duplicate; never speak a blank or a template token',
    name='Sunita', phone='{N1:spaced}', lang='hi', policy='SH-100001', due='15-11-2026', prem='', city='Lucknow', state='UP', cat='service')
row('R07', 'A', 'different customer on the same (family) phone', 'judgement row: keep as a separate customer on a shared number, call at most once per attempt window; record behaviour, not pass/fail',
    name='Rakesh Verma', phone='{N1:paren}', lang='hi', policy='SH-100777', due='01/12/2026', prem='18,200', city='Lucknow', state='UP', consent='policy_purchase', cdate='2025-12-01', cat='service')
row('R08', 'A', "Excel leading apostrophe; emoji in name; '24.5k' amount", 'normalise; strip emoji for speech; parse amount or flag',
    name='सुनीता 🙏', phone='{N1:apos}', lang='hi', policy='SH-100001', due='15.11.2026', prem='24.5k', city='Lucknow', state='UP', cat='service')
# B: N2 = the opt-out number. Any ring on N2 is a failure.
row('R09', 'B', 'explicit opt-out', 'suppress N2 everywhere; never dial',
    name='Imran Qureshi', phone='{N2:e164}', lang='hi-en', policy='SH-300001', due='20/11/2026', prem='31,000', city='Hyderabad', state='Telangana', optout='YES', cat='service', notes='Asked not to be called again on 2026-10-12')
row('R10', 'B', 'same opted-out person, other row lacks the flag', 'suppressed by number, not by row; never dial',
    name='Imran Qureshi', phone='{N2:10}', lang='hi-en', policy='SH-300001', due='20/11/2026', prem='31000', city='Hyderabad', state='TS', cat='service')
row('R11', 'B', "conflicting flag ('no') on an opted-out number, Devanagari name", 'opt-out wins; never dial; flag the conflict',
    name='इमरान कुरैशी', phone='{N2:dash}', lang='hi', policy='SH-300001', due='2026-11-20', prem='31,000', city='Hyderabad', state='Telangana', optout='no', cat='service')
row('R12', 'B', 'two numbers in one cell (N1 / N2)', 'do not guess; flag the row; never dial N2',
    name='Verma family', phone='{N1:10} / {N2:10}', lang='hi', policy='SH-100778', due='15/11/2026', prem='24,500', city='Lucknow', state='UP', cat='service')
# C: N3 = second dialable customer, Tamil-English
row('R13', 'C', 'clean E.164; Tamil-script name; ta-en', 'dial once; Tamil-English replies',
    name='கார்த்திக் ராஜா', phone='{N3:e164}', lang='ta-en', policy='SH-200001', due='15-11-2026', prem='18000', city='Chennai', state='Tamil Nadu', consent='policy_purchase', cdate='2025-11-15', cat='service', tz='Asia/Kolkata')
row('R14', 'C', "10-digit; 'Tamil' as free text; impossible date 31/02/2026", 'normalise; flag duplicate; flag the impossible date (never speak it)',
    name='Karthik Raja', phone='{N3:10}', lang='Tamil', policy='SH-200001', due='31/02/2026', prem='18,000', city='Chennai', state='TN', cat='service')
row('R15', 'C', "extension suffix ' x22'", 'strip or flag the extension; flag duplicate',
    name='Karthik', phone='{N3:ext}', lang='ta-en', policy='SH-200001', due='15/11/2026', prem='18000', city='Chennai', state='Tamil Nadu', cat='service')
row('R16', 'C', 'comma inside a quoted name; no consent evidence; category promotional', 'flag duplicate; hold the promotional row (no consent evidence, promo needs 140-series and 10:00-21:00)',
    name='Raja, Karthik', phone='{N3:e164}', lang='ta-en', policy='SH-200001', due='15/11/2026', prem='18000', city='Chennai', state='Tamil Nadu', cat='promotional', notes='Offer: top-up cover')
# D: N4 = optional SIM we own, registered BLOCK PROMO via 1909. Without N4 these two rows render as invalid.
row('R17', 'D', 'BLOCK-PROMO number, service call', 'dial (service calls are not DND-blocked, RS-10)',
    name='Meena Iyer', phone='{N4:e164}', lang='en-IN', policy='SH-400001', due='18/11/2026', prem='27,300', city='Pune', state='Maharashtra', consent='policy_purchase', cdate='2025-11-18', cat='service')
row('R18', 'D', 'BLOCK-PROMO number, promotional call', 'hold or refuse (promo to a DND number needs registered consent, RS-13)',
    name='Meena Iyer', phone='{N4:e164}', lang='en-IN', policy='SH-400001', due='18/11/2026', prem='27,300', city='Pune', state='Maharashtra', cat='promotional', notes='Offer: family floater upgrade')
# E: structurally invalid. Must not be dialled; each needs a per-row reason.
INVALID = [
    ('R19', '5 digits', '12345'), ('R20', 'empty phone', ''), ('R21', "'N/A'", 'N/A'),
    ('R22', 'letters', 'abcdefghij'), ('R23', 'NSN starting with 0', '+91 00000 00000'),
    ('R24', 'twelve zeros', '000000000000'), ('R25', '9 digits', '123456789'),
    ('R26', 'NSN of 11 digits', '+91 12345 678901'), ('R27', 'Mumbai code with a truncated subscriber number', '+91 22 0000'),
    ('R28', 'reserved fictional US number (NANP 555-01XX)', '+1 202 555 0123'),
    ('R29', 'reserved fictional UK number (Ofcom drama range)', '+44 20 7946 0000'),
    ('R30', 'Excel scientific notation of an invalid number', '9.1E+11'), ('R31', "'+91' only", '+91'),
    ('R32', 'text in the phone field', 'phone: call after 6pm'),
]
NAMES_E = ['Anil Kumar', 'प्रिया शर्मा', 'Ravi', 'Fatima Sheikh', 'জয়া দাস', 'Gurpreet Singh', 'Lakshmi N', 'Joseph Mathew',
           'ANJALI', 'Deepak  Yadav', 'Neha', 'Suresh Patil', 'Pooja', 'Arjun Reddy']
for (rid, trap, ph), nm in zip(INVALID, NAMES_E):
    exp = 'reject with a per-row reason; never dial' if 'reserved' not in trap else 'flag as non-Indian number; do not dial in an Indian campaign'
    row(rid, 'E', trap, exp, name=nm, phone=ph, lang='hi', policy='SH-5' + rid[1:].zfill(5), due='15/11/2026', prem='20,000', city='Delhi', state='Delhi', cat='service')
# F: broken row structure (rendered specially in build_rows)
for rid, trap in [('R33', 'completely empty row'), ('R34', 'one extra unquoted field'), ('R35', 'truncated row (fewer fields)'),
                  ('R36', 'whitespace-only row'), ('R37', 'header line repeated mid-file'), ('R38', 'only Notes filled')]:
    row(rid, 'F', trap, 'skip with a reason; never dial; never crash the import')
# H: CRM junk that cannot reach anyone (12 rows)
JUNK = [('R39', '+91 80 1234'), ('R40', '0091 12345'), ('R41', '+910'), ('R42', '91-'), ('R43', '++91 12345'), ('R44', '+91 98'),
        ('R45', '1800'), ('R46', '#N/A'), ('R47', 'NULL'), ('R48', '-'), ('R49', 'TBD'), ('R50', '0')]
NAMES_H = ['Vikram', 'Sneha Kulkarni', 'Mohammed Arif', 'कविता', 'Rohit', 'Divya Menon', 'Sanjay', 'ਹਰਪ੍ਰੀਤ ਕੌਰ', 'Asha', 'Manoj', 'Ritu', 'Kiran']
for (rid, ph), nm in zip(JUNK, NAMES_H):
    row(rid, 'H', f'unroutable CRM junk {ph!r}', 'reject with a per-row reason; never dial', name=nm, phone=ph, lang='hi', policy='SH-6' + rid[1:].zfill(5), due='', prem='', city='', state='', cat='')

KEY = {'name': 'Customer Name', 'phone': 'Phone Number', 'lang': 'Language', 'policy': 'Policy No', 'due': 'Due Date',
       'prem': 'Premium (INR)', 'city': 'City', 'state': 'State', 'optout': 'Opt Out', 'consent': 'Consent Source',
       'cdate': 'Consent Date', 'cat': 'Call Category', 'tz': 'Timezone', 'notes': 'Notes', 'alt': 'alt phone'}


def build_rows():
    out = []
    for rid, group, trap, cells, _ in R:
        if group == 'F':
            if rid == 'R33': out.append([''] * len(COLS))
            elif rid == 'R34': out.append([rid, 'Sameer, Khan', '12345', '', 'hi', 'SH-700034', '15/11/2026', '20,000', 'Delhi', 'Delhi', '', '', '', 'service', '', 'extra', 'field', '', 'OVERFLOW'])
            elif rid == 'R35': out.append([rid, 'Truncated Row', ''])
            elif rid == 'R36': out.append(['   '] + [' '] * (len(COLS) - 1))
            elif rid == 'R37': out.append(list(COLS))
            elif rid == 'R38': out.append([''] * 15 + ['call back after Diwali', '', ''])
            continue
        r = {c: '' for c in COLS}
        r['Row ID'] = rid
        for k, v in cells.items():
            r[KEY[k]] = v
        out.append([r[c] for c in COLS])
    return out


def write_csv(rows, path):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator='\r\n')
    w.writerow(COLS)
    for r in rows:
        if r and r[0] == 'R34':  # deliberately unquoted extra comma
            buf.write(','.join(r) + '\r\n')
        else:
            w.writerow(r)
    buf.write('\r\n')  # trailing blank line
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:  # BOM on purpose
        f.write(buf.getvalue())


def build():
    rows = build_rows()
    assert len(rows) == 50, len(rows)
    tpl = os.path.join(OUTDIR, 'messy-50.template.csv')
    write_csv(rows, tpl)
    spec = {'file': 'research/2026-10-20/teardown/synthesis/messy-50.template.csv', 'rows': 50,
            'file_level_traps': ['UTF-8 BOM', 'CRLF line endings', "header 'Phone Number' (spaces, capitals)", 'trailing unnamed empty column',
                                 "'Email' column empty in every row", 'trailing blank line', 'mixed date formats', 'mixed amount formats'],
            'numbers': {'N1': 'dialable customer A (our Plivo number; the battery harness answers)',
                        'N2': 'opt-out number we own; ANY ring on N2 is a failure; log inbound on it',
                        'N3': 'dialable customer B (our second number, or the owner handset via env only)',
                        'N4': 'optional SIM we own registered BLOCK PROMO via 1909; without it R17-R18 render as invalid'},
            'perfect_vp_outcome': {'unique_dials': 'N1 x1 (plus R07 judgement), N3 x1, N4 x1 (service only)', 'N2_rings': 0,
                                   'rejected_with_reason': 'R19-R27, R30-R50 except structural rows skipped with a reason',
                                   'held_for_category': ['R16', 'R18'], 'flagged_duplicates': ['R02', 'R03', 'R04', 'R05', 'R06', 'R08', 'R10', 'R11', 'R14', 'R15']},
            'record_per_platform': ['accepted / rejected / normalised value per row (screenshot or export)', 'reason text per rejected row',
                                    'duplicate handling', 'number of rings on N1, N2, N3, N4 from our own inbound logs',
                                    'how empty or odd variables were spoken (R06, R08, R14)', 'minutes and clicks to a clean upload, including any header renaming',
                                    'whether the whole file was refused for one bad row'],
            'rows': [{'row': rid, 'group': g, 'trap': trap, 'expected_vp': exp} for rid, g, trap, _, exp in R]}
    json.dump(spec, open(os.path.join(OUTDIR, 'messy-50.spec.json'), 'w'), ensure_ascii=False, indent=1)
    print('wrote', tpl, 'and messy-50.spec.json')


# ---- render + safety -------------------------------------------------------------------------

def forms(e164):
    assert re.fullmatch(r'\+91[1-9]\d{9}', e164), 'owned numbers must be +91 followed by 10 digits'
    d = e164[3:]
    return {'e164': e164, '10': d, '0': '0' + d, '91': '91' + d, 'spaced': f'+91 {d[:5]} {d[5:]}',
            'paren': f'(+91) {d[:5]}-{d[5:]}', 'dash': f'+91-{d[:5]}-{d[5:]}', 'apos': "'" + d, 'ext': e164 + ' x22'}


def candidates(cell):
    """Every E.164 a known vendor normaliser could produce from one phone cell."""
    out = set()
    for part in re.split(r'[/;,]| or ', cell):
        p = part.strip().split(' x')[0]
        if re.fullmatch(r'\d(\.\d+)?[eE]\+\d+', p):
            p = str(int(float(p)))
        plus = p.lstrip("'").startswith('+')
        d = re.sub(r'\D', '', p)
        if not d:
            continue
        if plus:
            out.add('+' + d)
        if d.startswith('00'):
            out.add('+' + d[2:])
        out.add('+' + d)            # naive '+' (Vapi dashboard, VAP-49)
        out.add('+1' + d)           # US default (Retell contacts, RET-17 / RAP-54)
        out.add('+91' + d)          # India default
        if d.startswith('0'):
            out.add('+91' + d.lstrip('0'))
        if d.startswith('91') and len(d) == 12:
            out.add('+' + d)
    return out


def plausible(c):
    d = c[1:]
    if c.startswith('+91'):
        nsn = c[3:]
        return len(nsn) == 10 and nsn[0] != '0'
    if c.startswith('+1'):
        r = c[2:]
        return len(r) == 10 and r[0] in '23456789' and r[3] in '23456789'
    if c.startswith('+0'):
        return False
    return 8 <= len(d) <= 15   # conservative: any other plausible-length number is unsafe


def read_env(path):
    st = os.stat(path)
    if st.st_mode & (stat.S_IRWXG | stat.S_IRWXO):
        sys.exit(f'refusing: {path} must be mode 600')
    env = {}
    for line in open(path):
        m = re.match(r'\s*(N[1-4])_E164\s*=\s*(\S+)', line)
        if m:
            env[m.group(1)] = m.group(2)
    if 'N1' not in env or 'N2' not in env or 'N3' not in env:
        sys.exit('need N1_E164, N2_E164 and N3_E164 (N4 optional)')
    return env


def render(env_path, out_path, withhold):
    env = read_env(env_path)
    owned = set(env.values())
    F = {k: forms(v) for k, v in env.items()}
    def sub(cell):
        def rep(m):
            k, f = m.group(1), m.group(2)
            return F[k][f] if k in F else 'NO-N4'   # missing N4 renders an invalid string
        return re.sub(r'\{(N[1-4]):(\w+)\}', rep, cell)
    rows, withheld = [], []
    for r in build_rows():
        r = [sub(c) for c in r]
        phone = r[2] if len(r) > 2 else ''
        bad = sorted(c for c in candidates(phone) if c not in owned and c not in RESERVED and plausible(c))
        if bad:
            if not withhold:
                sys.exit(f'UNSAFE row {r[0] or "(no id)"}: a vendor normaliser could dial a number we do not own. '
                         'Use Delhi (11-series) numbers, or pass --withhold-unsafe. Nothing written.')
            withheld.append(r[0])
            continue
        rows.append(r)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    write_csv(rows, out_path)
    os.chmod(out_path, 0o600)
    print(f'wrote {out_path}: {len(rows)} rows; withheld for safety: {withheld or "none"}')


if __name__ == '__main__':
    if len(sys.argv) >= 2 and sys.argv[1] == 'build':
        build()
    elif len(sys.argv) >= 2 and sys.argv[1] == 'render':
        a = sys.argv[2:]
        env = a[a.index('--env') + 1]; out = a[a.index('--out') + 1]
        render(env, out, '--withhold-unsafe' in a)
    else:
        print(__doc__)
