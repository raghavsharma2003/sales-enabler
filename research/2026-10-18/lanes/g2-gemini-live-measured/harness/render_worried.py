# Render the worried-caller scene (W_t01..W_t08) with Azure neural TTS, then phone-band 16 kHz PCM like the battery.
# Reuses the l4b battery tts.synth (reads the key at runtime, never prints it).
import os, sys, html, subprocess
sys.path.insert(0, '/home/user/sales-enabler/research/2026-10-17/lanes/l4b-measured/battery')
import tts
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw-1018/g2-gemini-live-measured/worried_tts'
os.makedirs(RAW, exist_ok=True)
LINES = {
 'W_t01': 'हाँ हैलो? हाँ जी, बोलिए… सब ठीक तो है ना?',
 'W_t02': 'देखिए, मेरे पति कल रात से hospital में admit हैं, और मुझे अभी याद आया कि policy का renewal भी आने वाला है।',
 'W_t03': 'अगर पंद्रह तारीख निकल गई तो क्या claim reject हो जाएगा? मैं बहुत परेशान हूँ।',
 'W_t04': 'Hospital वाले कह रहे हैं डेढ़ लाख तक का bill बनेगा… इतना cover है ना?',
 'W_t05': 'हम्म… ठीक है।',
 'W_t06': 'अभी पैसे भरने की हालत नहीं है, क्या थोड़ा रुक सकते हैं?',
 'W_t07': 'आप सच में इंसान हो या recording? सच बताइए।',
 'W_t08': 'ठीक है… thank you, आपने बहुत help की।',
}
tot = 0
for k, t in LINES.items():
    ssml = (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="hi-IN"><voice name="hi-IN-SwaraNeural">'
            f'<prosody rate="+8%" pitch="+3%">{html.escape(t, quote=False)}</prosody></voice></speak>')
    w = os.path.join(RAW, k + '.wav')
    if not os.path.exists(w): tot += tts.synth(ssml, w)
    mu = os.path.join(RAW, k + '_mu.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', w, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,highpass=f=300,lowpass=f=3400', '-ar', '8000', '-acodec', 'pcm_mulaw', mu], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mu, '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', '-f', 's16le', os.path.join(HERE, 'audio_phone16k', k + '.pcm')], check=True)
print('chars billed', tot)
