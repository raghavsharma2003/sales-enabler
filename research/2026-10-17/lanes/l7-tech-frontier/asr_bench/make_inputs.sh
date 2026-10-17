#!/bin/sh
# Rebuild the inputs of the l7 CPU ASR mini-benchmark (2026-10-17). Needs curl, tar, ffmpeg, python3.
# Usage: sh make_inputs.sh OUTDIR   (then: python asr_bench.py MODEL OUTDIR OUTDIR/res_MODEL.jsonl;
#                                         python score_asr.py OUTDIR OUT.csv)
set -e
R=${1:?outdir}; mkdir -p "$R/sel" "$R/wb" "$R/nb" "$R/probe"; cd "$R"
curl -sSL -o test.tsv https://huggingface.co/datasets/google/fleurs/resolve/main/data/hi_in/test.tsv
curl -sSL -o test.tar.gz https://huggingface.co/datasets/google/fleurs/resolve/main/data/hi_in/audio/test.tar.gz
# 60-utterance seeded sample (one per sentence id); the run used the first 20 lines.
python3 - <<'EOF'
import csv, random
rows = [r for r in csv.reader(open('test.tsv'), delimiter='\t')]
seen = {}
for r in rows:
    seen.setdefault(r[0], r)
random.seed(20261017)
sel = random.sample(list(seen.values()), 60)
open('sel/manifest60.tsv', 'w').write(''.join(f"{r[1]}\t{r[3]}\n" for r in sel))
EOF
head -20 sel/manifest60.tsv > sel/manifest.tsv
cut -f1 sel/manifest60.tsv | sed 's#^#test/#' > sel/files.txt
tar xzf test.tar.gz -C sel -T sel/files.txt
for f in sel/test/*.wav; do b=$(basename "$f")
  ffmpeg -loglevel error -y -i "$f" -ar 16000 -ac 1 "wb/$b"
  ffmpeg -loglevel error -y -i "$f" -af "highpass=f=300,lowpass=f=3400" -ar 8000 -ac 1 -acodec pcm_mulaw tmp_mu.wav
  ffmpeg -loglevel error -y -i tmp_mu.wav -ar 16000 -ac 1 -acodec pcm_s16le "nb/$b"
done
cd probe
for i in 1 2 3 4 5; do
  ffmpeg -loglevel error -y -f lavfi -i "anullsrc=r=16000:cl=mono" -t 4 silence_$i.wav
  ffmpeg -loglevel error -y -f lavfi -i "anoisesrc=r=16000:color=white:amplitude=0.0$((i+1)):seed=$i" -t 4 white_$i.wav
  ffmpeg -loglevel error -y -f lavfi -i "anoisesrc=r=16000:color=brown:amplitude=0.$((i+1)):seed=$((i+10))" -t 4 brown_$i.wav
  ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=$((50*i)):sample_rate=16000" -af "volume=0.05" -t 4 hum_$i.wav
  ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=425:sample_rate=16000" -af "volume=0.2,apulsator=hz=0.5" -t 4 ringback_$i.wav
done
# babble: six reversed FLEURS utterances mixed (babble_1-4 from wb files 1-9 in ls order; babble_5 from files 20-25)
L=$(ls ../wb)
for i in 1 2 3 4; do set -- $(echo "$L" | sed -n "$((i*2-1)),$((i*2+4))p")
  ffmpeg -loglevel error -y -i ../wb/$1 -i ../wb/$2 -i ../wb/$3 -i ../wb/$4 -i ../wb/$5 -i ../wb/$6 -filter_complex "[0]areverse[a];[1]areverse[b];[2]areverse[c];[3]areverse[d];[4]areverse[e];[5]areverse[f];[a][b][c][d][e][f]amix=inputs=6,volume=0.6" -t 4 -ar 16000 -ac 1 babble_$i.wav; done
set -- $(echo "$L" | sed -n 20,25p)
ffmpeg -loglevel error -y -i ../wb/$1 -i ../wb/$2 -i ../wb/$3 -i ../wb/$4 -i ../wb/$5 -i ../wb/$6 -filter_complex "[0]areverse[a];[1]areverse[b];[2]areverse[c];[3]areverse[d];[4]areverse[e];[5]areverse[f];[a][b][c][d][e][f]amix=inputs=6,volume=0.6" -t 4 -ar 16000 -ac 1 babble_5.wav
