// The parts a user can build a voice stack from (directive.2026-10-22.full-stack-selection): ears (speech-to-text),
// a brain (the language model), a voice (text-to-speech), or one speech-to-speech engine instead of all three.
// Ids are the voice runtime's catalog keys (product/voice/vpvoice/catalog.py); a parity test holds the two in step.
// Routing (directive.2026-10-22.provider-routing): Gemini through Google Vertex; anything on our Azure AI Foundry through
// Azure; OpenRouter only for what is in neither. The strings below are shown to people as they are: plain words only.
import type { Language } from './agent-config.ts';
import type { Figure } from './stacks.ts';

export type Part = 'ears' | 'brain' | 'voice' | 's2s';
export type Route = 'vertex' | 'azure-foundry' | 'azure-speech' | 'openrouter' | 'sarvam';

export interface Component {
  id: string;
  part: Part;
  label: string;
  maker: string;           // who makes the model, for the picker's grouping
  route: Route;
  processedIn: string;     // where the audio or text is processed, in plain words
  latency: Figure;         // ears: end of speech to final words; brain: first token; voice: first audio; s2s: reply gap
  price: string;           // the provider's list price, as published, with its unit
  requires: string[];      // provider credentials the runtime needs (names in voice/vpvoice/stacks.py REQUIRES_ENV)
  status: 'available' | 'beta';   // beta parts run test calls only
  note?: string;
  voices?: readonly string[];      // voice and s2s parts: the voices a person may pick
  defaultVoice?: string;
  /** Which languages this part hears (ears), understands and writes (brain) or speaks (voice), and how we know.
   *  'measured' only where our lab or benches ran the part in that language; everything else is as the maker states. */
  languages: LanguageSupport;
}

export interface LanguageSupport {
  measured: readonly Language[];   // ran in that language in our own tests (source names which)
  stated: readonly Language[];     // the maker says so; not checked on our calls
  source: string;                  // plain words: where the measured list comes from, and that the rest is the maker's
}

const LAB_BRAIN = 'Median time to the first word of a reply, from our voice lab in India, 6 replies, 19 Oct 2026.';
const IN_AZURE_SPEECH = 'India (Azure, Pune)';
const IN_AZURE_FOUNDRY = 'India (Azure, Chennai)';
const SEA_AZURE = 'Singapore (Azure)';
const GOOGLE_GLOBAL = 'Google Cloud, routed globally';
const GOOGLE_US = 'United States (Google Cloud, Iowa)';
const OPENROUTER = 'Varies: OpenRouter passes it to the model maker';
const SARVAM = 'India (Sarvam)';
const GEMINI_VOICES = ['Despina', 'Sulafat', 'Achernar', 'Aoede', 'Kore', 'Leda', 'Autonoe', 'Callirrhoe', 'Vindemiatrix', 'Zephyr', 'Puck', 'Charon'] as const;
// Language lists (2026-10-24). Measured = our voice lab calls and text benches, which ran Hindi, Hinglish and English
// only (voicelab round 1-2, 17-23 Oct 2026). Stated lists are the makers' published language support as we understood
// it on 2026-10-24, restricted to the codes VP offers; they are not checked on our calls, and the picker says so.
const ALL: readonly Language[] = ['hi-IN', 'en-IN', 'hinglish', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'gu-IN', 'bn-IN', 'pa-IN', 'or-IN'];
const HI_EN: readonly Language[] = ['hi-IN', 'en-IN', 'hinglish'];
const GEMINI_SPEECH: readonly Language[] = ['hi-IN', 'en-IN', 'hinglish', 'bn-IN', 'mr-IN', 'ta-IN', 'te-IN'];
const GEMINI_LIVE: readonly Language[] = ['hi-IN', 'en-IN', 'hinglish', 'bn-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'ta-IN', 'te-IN'];
const STATED_ONLY = 'As the maker states; not yet checked on our calls in any language.';
const lang = (stated: readonly Language[], measured: readonly Language[] = [], source = STATED_ONLY): LanguageSupport =>
  ({ measured, stated: stated.filter(l => !measured.includes(l)), source });
const LAB_HINGLISH = (what: string) => `Hinglish and Hindi ran in our voice lab in India (${what}); the other languages are as the maker states, not checked on our calls.`;
const BENCH_HINGLISH = 'Hinglish ran in our written conversation tests (20 Oct 2026); the other languages are as the maker states, not checked on our calls.';
const ms = (n: number, source = LAB_BRAIN): Figure => ({ value: `${(n / 1000).toFixed(2)} s`, grade: 'measured', source });
const notMeasured = (why = 'Not measured in our lab yet.'): Figure => ({ value: 'not measured', grade: 'not_measured', source: why });

export const COMPONENTS: readonly Component[] = [
  // ---------------------------------------------------------------- ears
  { id: 'azure', part: 'ears', label: 'Azure Speech, Hindi and English', maker: 'Microsoft', route: 'azure-speech', processedIn: IN_AZURE_SPEECH,
    latency: ms(450, 'Measured in our voice lab in India, 17 Oct 2026: end of speech to the final words.'),
    price: '$1.00 per audio hour', requires: ['AZURE_SPEECH'], status: 'available',
    note: 'In one test it missed a very quiet "hmm".',
    languages: lang(ALL, ['hi-IN', 'hinglish'], LAB_HINGLISH('test calls, 17-23 Oct 2026')) },
  { id: 'sarvam', part: 'ears', label: 'Sarvam Saaras, mixed Hindi and English', maker: 'Sarvam', route: 'sarvam', processedIn: SARVAM,
    latency: notMeasured(), price: '₹30 per audio hour', requires: ['SARVAM'], status: 'beta',
    note: 'Sarvam may train on call audio unless you opt out with them.',
    languages: lang(ALL) },
  // ---------------------------------------------------------------- brains
  { id: 'gemini-3.5-flash-lite', part: 'brain', label: 'Gemini 3.5 Flash-Lite', maker: 'Google', route: 'vertex', processedIn: GOOGLE_GLOBAL,
    latency: ms(826), price: '$0.30 in, $2.50 out per million tokens', requires: ['GEMINI'], status: 'available',
    languages: lang(ALL, ['hinglish'], BENCH_HINGLISH) },
  { id: 'gemini-3.6-flash', part: 'brain', label: 'Gemini 3.6 Flash', maker: 'Google', route: 'vertex', processedIn: GOOGLE_GLOBAL,
    latency: ms(1102), price: '$0.75 in, $3.75 out per million tokens', requires: ['GEMINI'], status: 'available',
    languages: lang(ALL) },
  { id: 'gemini-3.8-flash', part: 'brain', label: 'Gemini 3.8 Flash', maker: 'Google', route: 'vertex', processedIn: GOOGLE_GLOBAL,
    latency: ms(1991), price: '$0.75 in, $3.75 out per million tokens', requires: ['GEMINI'], status: 'available',
    note: 'The best-judged model in our written tests, and slower to answer.',
    languages: lang(ALL, ['hinglish'], BENCH_HINGLISH) },
  { id: 'gpt-5.4-mini', part: 'brain', label: 'GPT-5.4 mini', maker: 'OpenAI', route: 'azure-foundry', processedIn: IN_AZURE_FOUNDRY,
    latency: ms(960), price: '$0.75 in, $4.50 out per million tokens (OpenAI list price)', requires: ['AZURE_OPENAI'], status: 'available',
    languages: lang(ALL, ['hinglish'], BENCH_HINGLISH) },
  { id: 'gpt-4.1-mini-in', part: 'brain', label: 'GPT-4.1 mini', maker: 'OpenAI', route: 'azure-foundry', processedIn: IN_AZURE_FOUNDRY,
    latency: ms(641), price: '$0.44 in, $1.76 out per million tokens', requires: ['AZURE_OPENAI'], status: 'available',
    languages: lang(ALL) },
  { id: 'gpt-4.1', part: 'brain', label: 'GPT-4.1', maker: 'OpenAI', route: 'azure-foundry', processedIn: IN_AZURE_FOUNDRY,
    latency: ms(1765), price: '$2.00 in, $8.00 out per million tokens', requires: ['AZURE_OPENAI'], status: 'available',
    languages: lang(ALL) },
  { id: 'gpt-oss-120b', part: 'brain', label: 'gpt-oss-120b (open weights)', maker: 'OpenAI', route: 'azure-foundry', processedIn: IN_AZURE_FOUNDRY,
    latency: ms(1466), price: '$0.15 in, $0.60 out per million tokens', requires: ['AZURE_OPENAI'], status: 'available',
    languages: lang(HI_EN) },
  { id: 'llama-4-maverick', part: 'brain', label: 'Llama 4 Maverick (open weights)', maker: 'Meta', route: 'azure-foundry', processedIn: IN_AZURE_FOUNDRY,
    latency: ms(1060), price: '$0.25 in, $1.00 out per million tokens', requires: ['AZURE_OPENAI'], status: 'available',
    languages: lang(HI_EN) },
  { id: 'kimi-k2.6', part: 'brain', label: 'Kimi K2.6 (open weights)', maker: 'Moonshot AI', route: 'azure-foundry', processedIn: SEA_AZURE,
    latency: ms(1629), price: '$0.95 in, $4.00 out per million tokens', requires: ['AZURE_OPENAI_SEA'], status: 'available',
    languages: lang(['en-IN']) },
  { id: 'gpt-6-luna@or', part: 'brain', label: 'GPT-6 Luna', maker: 'OpenAI', route: 'openrouter', processedIn: OPENROUTER,
    latency: ms(1438), price: '$0.10 in, $0.50 out per million tokens', requires: ['OPENROUTER'], status: 'available',
    note: 'Not on our Azure capacity yet, so it runs through OpenRouter.',
    languages: lang(ALL, ['hinglish'], BENCH_HINGLISH) },
  { id: 'gpt-6-sol@or', part: 'brain', label: 'GPT-6 Sol', maker: 'OpenAI', route: 'openrouter', processedIn: OPENROUTER,
    latency: ms(1739), price: '$2.00 in, $10.00 out per million tokens', requires: ['OPENROUTER'], status: 'available',
    note: 'Not on our Azure capacity yet, so it runs through OpenRouter.',
    languages: lang(ALL) },
  { id: 'sarvam-105b', part: 'brain', label: 'Sarvam-105B', maker: 'Sarvam', route: 'sarvam', processedIn: SARVAM,
    latency: notMeasured(), price: '₹15 in, ₹60 out per million tokens', requires: ['SARVAM'], status: 'beta',
    languages: lang(ALL) },
  // ---------------------------------------------------------------- voices
  { id: 'gemini-lite', part: 'voice', label: 'Gemini 3.8 Flash-Lite voice', maker: 'Google', route: 'vertex', processedIn: GOOGLE_GLOBAL,
    latency: { value: '0.84 to 1.16 s', grade: 'measured', source: 'Measured on test calls in our voice lab in India, 20 Oct 2026: time to the first audio of a reply.' },
    price: '$6 per million audio tokens (about $0.009 a minute of speech)', requires: ['GEMINI'], status: 'available',
    voices: GEMINI_VOICES, defaultVoice: 'Despina',
    languages: lang(GEMINI_SPEECH, ['hinglish', 'hi-IN'], LAB_HINGLISH('test calls, 20-23 Oct 2026')) },
  { id: 'gemini', part: 'voice', label: 'Gemini 3.8 Flash voice', maker: 'Google', route: 'vertex', processedIn: GOOGLE_GLOBAL,
    latency: notMeasured(), price: '$9 per million audio tokens (about $0.014 a minute of speech); doubles on 1 Jan 2027',
    requires: ['GEMINI'], status: 'available', voices: GEMINI_VOICES, defaultVoice: 'Despina',
    languages: lang(GEMINI_SPEECH) },
  { id: 'azure', part: 'voice', label: 'Azure neural voice', maker: 'Microsoft', route: 'azure-speech', processedIn: IN_AZURE_SPEECH,
    latency: { value: '0.05 s', grade: 'measured', source: 'Measured in our voice lab in India, 19 Oct 2026: time to the first audio once the reply text is ready.' },
    price: '$15 per million characters', requires: ['AZURE_SPEECH'], status: 'available',
    voices: ['hi-IN-SwaraNeural', 'hi-IN-AnanyaNeural', 'hi-IN-KavyaNeural', 'hi-IN-AartiNeural', 'en-IN-NeerjaNeural', 'hi-IN-MadhurNeural'], defaultVoice: 'hi-IN-SwaraNeural',
    languages: lang(HI_EN) },
  { id: 'azure-hd', part: 'voice', label: 'Azure HD voice', maker: 'Microsoft', route: 'azure-speech', processedIn: IN_AZURE_SPEECH,
    latency: notMeasured(), price: '$22 per million characters', requires: ['AZURE_SPEECH'], status: 'available',
    voices: ['en-IN-Aarti:DragonHDLatestNeural', 'en-IN-Meera:DragonHDLatestNeural', 'en-IN-Diya:DragonHDLatestNeural', 'en-IN-Neerja:DragonHDLatestNeural',
      'hi-in-diya:DragonHDOmniIndicNeural', 'hi-in-hazelmori:DragonHDOmniIndicNeural'], defaultVoice: 'en-IN-Aarti:DragonHDLatestNeural',
    languages: lang(HI_EN) },
  { id: 'azure-mai', part: 'voice', label: 'Azure MAI voice, with emotion styles', maker: 'Microsoft', route: 'azure-speech', processedIn: IN_AZURE_SPEECH,
    latency: { value: '0.43 s', grade: 'measured', source: 'Measured in our voice lab in India, 20 Oct 2026: time to the first audio once the reply text is ready.' },
    price: 'Preview: not yet checked against a real bill', requires: ['AZURE_SPEECH'], status: 'available',
    voices: ['hi-IN-Kavya:MAI-Voice-2.1-Flash', 'hi-IN-Priya:MAI-Voice-2.1-Flash', 'hi-IN-Kavya:MAI-Voice-2.1', 'hi-IN-Priya:MAI-Voice-2.1',
      'hi-IN-Harper:MAI-Voice-2.1-Flash', 'hi-IN-Dhruv:MAI-Voice-2.1-Flash'], defaultVoice: 'hi-IN-Kavya:MAI-Voice-2.1-Flash',
    languages: lang(HI_EN, ['hinglish', 'hi-IN'], LAB_HINGLISH('test calls, 20 Oct 2026')) },
  { id: 'sarvam', part: 'voice', label: 'Sarvam Bulbul voice', maker: 'Sarvam', route: 'sarvam', processedIn: SARVAM,
    latency: notMeasured(), price: '₹20 per 10,000 characters', requires: ['SARVAM'], status: 'beta',
    voices: ['ishita_enhi_customer_expressive', 'simran_enhi_customer', 'shalini_enhi_customer', 'kavya_hi_conversational', 'aarti_hi_customer', 'sunny_enhi_customer'],
    defaultVoice: 'ishita_enhi_customer_expressive',
    languages: lang(ALL) },
  // ---------------------------------------------------------------- speech-to-speech
  { id: 'gemini-3.8-live', part: 's2s', label: 'Gemini 3.8 Live (hears and speaks in one model)', maker: 'Google', route: 'vertex', processedIn: GOOGLE_US,
    latency: { value: '1.09 to 1.46 s', grade: 'measured', source: 'Measured on one test call from our voice lab in India, 22 Oct 2026: caller finishes to her first audio.' },
    price: 'About ₹1.90 a minute in our test call', requires: ['GEMINI'], status: 'beta',
    note: 'In earlier tests she talked over callers on about 40% of turns.', voices: GEMINI_VOICES, defaultVoice: 'Despina',
    languages: lang(GEMINI_LIVE, ['hinglish'], LAB_HINGLISH('one test call, 22 Oct 2026')) },
];

export function getComponent(part: Part, id: string): Component | undefined {
  return COMPONENTS.find(c => c.part === part && c.id === id);
}

export function componentsFor(part: Part): Component[] {
  return COMPONENTS.filter(c => c.part === part);
}
