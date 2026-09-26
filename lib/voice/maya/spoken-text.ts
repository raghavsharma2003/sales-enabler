// Extracted from html-portfolio origin/main 3a9217981b27636745fc70ac490aacf9ef3f392d,
// src/voice/spokenText.ts. Call only after protocol/action tags have been acted on.
// Keep the original written transcript; this function prepares a separate audio copy.
const SPOKEN_RULES_VERSION = "st1";

function spokenTextCore(input = "") {
  if (typeof input !== "string" || !input) return "";
  let t = input;

  // A. INVISIBLES AND ENTITIES — normalised.
  // Zero-width joiners and soft hyphens are invisible on screen and are read by
  // some engines as a break mid-word; non-breaking spaces are just spaces.
  t = t.replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "");
  t = t.replace(/[\u00A0\u2007\u202F]/g, " ");
  // Decoded to the CHARACTER, never to a word: "&" is spoken "and" by every
  // engine on its own, and putting the word there ourselves would be text she
  // never wrote.
  t = t
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;|&gt;/gi, " ");

  // B. PROTOCOL SEGMENTS — the whole segment DROPPED, brackets and contents.
  // Justified only by the ordering above: every bracket that carried meaning
  // has already been parsed and acted on, so what is left is a leaked marker or
  // a stage direction, and `ack-bracket-direction` measured what happens to
  // those — they are performed as words. <…> is this app's own machine framing
  // (liveCall.ts `direct()` sends "<context: …>"); {…} is template residue.
  // Bounded lengths so a stray opener cannot swallow a whole reply.
  t = t.replace(/<[^<>\n]{0,200}>/g, " ");
  t = t.replace(/\{[^{}\n]{0,200}\}/g, " ");
  t = t.replace(/\[[^\][\n]{0,200}\]/g, " ");
  // An UNCLOSED tag at the very end is the truncation case brain.ts already
  // guards for its own path; a synthesiser hands back "bracket laughs".
  t = t.replace(/\[[^\][\n]{0,40}$/, " ");

  // C. URLs — the PROTOCOL removed, the address KEPT.
  // Not dropped, and this is a safety decision rather than a stylistic one. The
  // crisis-helpline block this repo protects with an invariant suite can carry
  // an address, and on a call the spoken copy is the ONLY copy — deleting it
  // would delete the helpline. "aasra.info" is said fine by every engine;
  // "h-t-t-p-s colon slash slash" is what actually had to go.
  t = t.replace(/\bhttps?:\/\/(?:www\.)?/gi, " ").replace(/\bwww\./gi, " ");

  // D. LINE STRUCTURE — the MARKER removed, the ITEM kept, joined as a list.
  // Runs BEFORE the dash rule on purpose: a line-leading "- " is a bullet, not
  // a dash, and treating it as one would put a comma in front of every item.
  t = t.replace(/^[ \t]*([-*_=\u2014\u2013]{3,})[ \t]*$/gm, " ");
  t = t.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  t = t.replace(/^[ \t]*>[ \t]?/gm, "");
  t = t.replace(/^[ \t]*(?:[-*+\u2022\u00B7\u25AA\u2023\u25E6][ \t]+|\d{1,2}[.)][ \t]+)/gm, "");
  t = t.replace(/[\u2022\u00B7\u25AA\u2023\u25E6]/g, ", ");

  // E. MARKDOWN EMPHASIS — the MARKERS removed, the WORDS kept.
  // Not the same class as a stage direction: "*shrugs*" is an action the
  // caller's stripProtocol already dropped, but "**sach**" is emphasis on a
  // real word and deleting the word loses what she said. The opener has to sit
  // on a boundary so `snake_case` is not mistaken for emphasis.
  t = t.replace(/`{1,3}/g, " ");
  t = t.replace(/(^|[\s(,.!?;:"'])(\*\*|__)(?=\S)([\s\S]*?\S)\2/g, "$1$3");
  t = t.replace(/(^|[\s(,.!?;:"'])([*_])(?=\S)([^*_\n]*?\S)\2(?![\w])/g, "$1$3");
  // Anything still standing is not a word: an asterisk is a spoken asterisk.
  // An underscore is only removed at a word EDGE, where it is leftover markup —
  // one BETWEEN two word characters is part of an address or a name
  // ("priya_sharma@gmail.com") and "underscore" is exactly what a person says
  // for it, so removing it there would break the thing it is holding together.
  t = t.replace(/\*+/g, " ").replace(/(?<!\w)_+|_+(?!\w)/g, " ");

  // F. DASHES — REPLACED with the spoken equivalent, which is a PAUSE.
  // This is the reported bug, and the reason it is a replace and not a delete:
  // an em-dash between clauses is how she was told to cut herself off, so it
  // carries real timing. Delete it and two clauses run together breathlessly;
  // keep it and the engine says "dash". A comma is the pause token every
  // synthesiser here already honours.
  //
  // THE TRAP, and where the line is drawn. A hyphen INSIDE a word is a
  // spelling, not a dash: "well-known", "e-mail", "T-shirt", "1800-599-0019".
  // Those are never touched. Only a dash that is punctuation gets replaced —
  // the true dash characters, a doubled ASCII hyphen, or a single hyphen with
  // whitespace on both sides.
  t = t.replace(/\s*[\u2012-\u2015]+\s*$/g, "");
  t = t.replace(/[\u2012-\u2015]+/g, ", ");
  t = t.replace(/\s*-{2,}\s*/g, ", ");
  t = t.replace(/ +- +/g, ", ");
  t = t.replace(/[ ,]*-+\s*$/g, "");

  // G. ARROWS — REPLACED with a pause, never with a word.
  // "→" most often means "then" or "to", but which one is a guess, and putting
  // a word she did not write into her mouth is the thing this repo calls
  // fabrication. A pause keeps the sentence intact and invents nothing.
  t = t.replace(/[\u2190-\u21FF\u27F0-\u27FF\u2B00-\u2B11]+/g, ", ");
  t = t.replace(/(^|\s)(?:->|<-|=>|<=>|<->)(\s|$)/g, ", ");
  // A pipe is the same class — a separator that some engines announce as
  // "vertical bar". It never carries meaning she said out loud.
  t = t.replace(/\s*\|+\s*/g, ", ");

  // H. PARENTHESES — the WORDS kept, the brackets become pauses.
  // Different from rule B and deliberately so: a parenthetical is an aside a
  // person actually says out loud, so dropping the segment would drop real
  // speech. Only the punctuation is a writing convention.
  t = t.replace(/\s*[([]\s*/g, ", ").replace(/\s*[)\]]\s*/g, ", ");

  // I. EMOJI AND PICTOGRAPHS — DROPPED.
  // Engines disagree: some skip them, some announce the Unicode name aloud
  // ("face with tears of joy"). There is no spoken equivalent to substitute,
  // and her laughter is already written out as "hahaha" by her brief, so
  // nothing is lost by removing them.
  t = t.replace(
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}\u{20E3}\u{2764}\u{2049}\u{203C}]/gu,
    " ",
  );

  // J. ELLIPSES — KEPT, only absurd runs capped.
  // NOT a writing convention here: "..." is load-bearing prosody in this
  // product. persona.ts uses it as her softness and speech.ts turns it into an
  // explicit thinking pause, and `stripTagsForPlainVoice` deliberately POSTs
  // "…" to this very endpoint in place of a tag. Removing it would flatten her.
  t = t.replace(/\.{4,}/g, "…").replace(/…{2,}/g, "…");

  // K. TIDY. Collapsing the debris the rules above leave behind — doubled
  // separators, a comma before a full stop, a phrase that now starts on
  // punctuation.
  t = t.replace(/[ \t]*\n[ \t]*/g, ", ");
  t = t.replace(/\s+/g, " ");
  t = t.replace(/\s+([,.;:!?…])/g, "$1");
  t = t.replace(/([,;:])(?:\s*[,;:])+/g, "$1");
  t = t.replace(/([,;:])\s*(?=[.!?…])/g, "");
  t = t.replace(/^[\s,;:.!?…]+/, "");
  t = t.replace(/[ ,;:]+$/, "");
  t = t.trim();

  // L. NOTHING SPEAKABLE LEFT. A reply that was only a tag, only emoji or only
  // a separator must produce SILENCE, not a synthesiser reading punctuation.
  // The caller is expected to refuse rather than send this upstream.
  if (!/[\p{L}\p{N}]/u.test(t)) return "";
  return t;
}

export { SPOKEN_RULES_VERSION };
export const spokenText: (text: string) => string = spokenTextCore;
