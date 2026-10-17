#!/usr/bin/env python3
"""Key-term recall of speech-to-text on the battery caller clips.

Compares (a) Azure fast transcription (our reference ASR, ../data/caller-roundtrip-stt.json) with
(b) Gnani's public Inya/Vachana playground (../data/stt-gnani-playground.json, from stt_playground.mjs).
Word error rate is not used: the systems write numbers and English loanwords in different scripts
(digits vs words, Latin vs Devanagari/Tamil), which makes WER mostly measure orthography. Instead each clip has the
terms a voice agent must catch to act correctly (amounts, times, dialect words, 'robot/AI').

python3 stt_compare.py  -> ../data/stt-keyterms.csv and a printed summary
"""
import csv, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')

N25K = r'25,?000|25\s*(k|हज़ार|हजार|thousand)|पच्चीस|पचीस|twenty[- ]?five thousand|இருபத்தி?\s*ஐந்து|இருபத்தைந்து'
N15L = r'1\.5|1,50,000|150000|डेढ़|डेढ|one point five|ஒன்றரை|ஒன் பாயிண்ட் ஃபைவ்|1\s*lakh\s*50'
N330 = r'3[:.]30|साढ़े\s*तीन|साढे\s*तीन|three[ -]?thirty|மூணரை|மூன்றரை|15[:.]30|s[aā]+[dḍ]he\s*t[iī]+n|sade\s*teen'
KEY = {
    'P1_t03': {'premium': r'premium|प्रीमियम|प्रिमियम', '25k': N25K},
    'P1_t04': {'claim': r'claim|क्लेम', '1.5L': N15L},
    'P1_t06': {'robot': r'robot|रोबोट|रोबॉट', 'AI': r'\bA\.?I\b|ए\.?\s?आई|एआई'},
    'P1_t08': {'tomorrow': r'कल|kal|tomorrow', '3:30': N330},
    'P1_t09': {'AQI': r'AQI|एक्यूआई|ए क्यू आई|ए\.क्यू\.आई', 'Delhi': r'delhi|दिल्ली|डेल्ही'},
    'P1_t10': {'whatsapp': r'whats\s?app|व्हाट्सएप|व्हाट्सऐप|वॉट्सऐप|व्हाट्सअप', 'link': r'link|लिंक'},
    'P2_t03': {'babuji': r'बाबूजी|बाबू\s?जी|बाबु\s?जी', '70': r'70|सत्तर'},
    'P2_t04': {'1.5L': N15L, 'ilaj': r'इलाज'},
    'P2_t06': {'premium': r'premium|प्रीमियम|प्रिमियम', '25k': N25K},
    'P2_t08': {'machine': r'मसीन|मशीन|machine', 'aadmi': r'आदमी'},
    'P2_t09': {'parson': r'परसों|परसो', '3:30': N330},
    'P2_t10': {'siwan': r'सिवान|siwan', 'barkha': r'बरखा|बारिश|बरसा'},
    'P3_t03': {'premium': r'premium|பிரீமியம்|பிரிமியம்|ப்ரீமியம்', '25k': N25K + r'|ட்வென்டி\s*ஃபைவ்\s*தௌசண்ட்'},
    'P3_t04': {'floater': r'floater|ஃப்ளோட்டர்|ப்ளோட்டர்', 'amma': r'அம்மா|amma'},
    'P3_t06': {'claim': r'claim|கிளைம்|க்ளைம்', '1.5L': N15L + r'|லட்சம்|lakh'},
    'P3_t07': {'robot': r'robot|ரோபோ', 'AI': r'\bA\.?I\b|ஏஐ|ஏ\.?\s?ஐ'},
    'P3_t09': {'tomorrow': r'நாளை|tomorrow', '3:30': N330},
    'P3_t10': {'CSK': r'CSK|சி\s?எஸ்\s?கே|சிஎஸ்கே', 'playoffs': r'play\s?off|பிளே\s?ஆஃப்|ப்ளே\s?ஆப்|பிளே\s?ஆப்'},
    'P4_t03': {'policy': r'पॉलिसी|पालिसी|policy', 'khatam': r'ख़तम|खतम|खत्म|ख़त्म'},
    'P4_t04': {'24.5k': r'24,?500|चौबीस\s*हज़ार|चौबीस\s*हजार', 'selfcorrect': r'नहीं|nahi'},
    'P4_t05': {'ruko': r'रुको', 'dheere': r'धीरे'},
    'P4_t06': {'machine': r'मशीन|machine'},
    'P4_t09': {'monday': r'सोमवार|monday|somb[aā]r|somvar', '3:30': N330},
    'P4_t10': {'khana': r'खाना'},
}
SHORT = {'P1_t02': 'hmm', 'P1_t05': 'ok', 'P2_t02': 'haan', 'P2_t05': 'theek ba', 'P3_t02': 'ok', 'P3_t05': 'mm', 'P4_t02': 'haan', 'P4_t08': 'hmm'}


def main():
    az = {r['id']: r['azure_stt'] for r in json.load(open(os.path.join(DATA, 'caller-roundtrip-stt.json')))}
    gp = os.path.join(DATA, 'stt-gnani-playground.json')
    gn = {r['id']: (r.get('heard') or '') for r in json.load(open(gp))} if os.path.exists(gp) else {}
    # ElevenLabs' own in-call ASR (user_transcript events), first call of each persona (r1); r2 kept separately
    el = {}
    mp = os.path.join(DATA, 'measurements.csv')
    if os.path.exists(mp):
        for r in csv.DictReader(open(mp)):
            if r['vendor'].startswith('ElevenLabs') and r['rep'] == 'r1' and r['vendor_heard']:
                el[r['turn_id']] = r['vendor_heard']
    rows = []
    for cid, terms in KEY.items():
        for name, pat in terms.items():
            rows.append({'clip': cid, 'term': name, 'azure_hit': int(bool(re.search(pat, az.get(cid, ''), re.I))),
                         'gnani_hit': int(bool(re.search(pat, gn.get(cid, ''), re.I))) if cid in gn else '',
                         'elevenlabs_incall_hit': int(bool(re.search(pat, el.get(cid, ''), re.I))) if cid in el else '',
                         'azure_text': az.get(cid, ''), 'gnani_text': gn.get(cid, ''), 'elevenlabs_incall_text': el.get(cid, '')})
    for cid, w in SHORT.items():
        rows.append({'clip': cid, 'term': 'short:' + w, 'azure_hit': int(bool(az.get(cid, '').strip())),
                     'gnani_hit': int(bool(gn.get(cid, '').strip())) if cid in gn else '',
                     'elevenlabs_incall_hit': int(bool(el.get(cid, '').strip())) if cid in el else '',
                     'azure_text': az.get(cid, ''), 'gnani_text': gn.get(cid, ''), 'elevenlabs_incall_text': el.get(cid, '')})
    NUMERIC = {'P1_t03', 'P1_t04', 'P1_t08', 'P2_t03', 'P2_t04', 'P2_t06', 'P2_t09', 'P3_t03', 'P3_t06', 'P3_t09', 'P4_t04', 'P4_t09'}
    allclips = sorted(set(az) | set(gn))
    for sysname, src in (('azure', az), ('gnani', gn), ('elevenlabs_incall', el)):
        spur = [(c, src[c]) for c in allclips if c in src and c not in NUMERIC and re.search(r'[0-9]', src[c])]
        print(f'{sysname}: digits written for clips with no number in the script: {len(spur)} of {sum(1 for c in allclips if c in src and c not in NUMERIC)}')
        for c, t in spur:
            print('   ', c, t[:90])
    with open(os.path.join(DATA, 'stt-keyterms.csv'), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); [w.writerow(r) for r in rows]
    for sysname in ('azure_hit', 'gnani_hit', 'elevenlabs_incall_hit'):
        for grp, pref in (('all', ''), ('P1', 'P1'), ('P2', 'P2'), ('P3', 'P3'), ('P4', 'P4')):
            R = [r for r in rows if r[sysname] != '' and r['clip'].startswith(pref) and not r['term'].startswith('short:')]
            if R:
                print(sysname, grp, f"{sum(r[sysname] for r in R)}/{len(R)}")
        S = [r for r in rows if r[sysname] != '' and r['term'].startswith('short:')]
        if S:
            print(sysname, 'short answers non-empty', f"{sum(r[sysname] for r in S)}/{len(S)}")


if __name__ == '__main__':
    main()
