import assert from "node:assert/strict";
import test from "node:test";
import {
  MAYA_VOICE_PROFILE, mayaDeliveryInstructions, mayaPresetFor,
  prepareMayaSpeech, spokenText,
} from "../lib/voice/maya";

test("Maya acoustic preset is the source Gemini voice, with no cross-provider alias", () => {
  assert.equal(MAYA_VOICE_PROFILE.preset, "Despina");
  assert.equal(MAYA_VOICE_PROFILE.liveModel, "gemini-3.1-flash-live-preview");
  assert.equal(MAYA_VOICE_PROFILE.languageCode, "hi-IN");
  assert.equal(mayaPresetFor("gemini"), "Despina");
  assert.equal(mayaPresetFor("azure"), null);
  assert.equal(mayaPresetFor("openai"), null);
});

test("source spoken-text core retains words and meaningful details while removing writing artifacts", () => {
  assert.equal(spokenText("**sach** — kal 3.30 baje, 1800-599-0019"), "sach, kal 3.30 baje, 1800-599-0019");
  assert.equal(spokenText("- First\n- Second → third"), "First, Second, third");
  assert.equal(spokenText("Visit https://aasra.info if needed"), "Visit aasra.info if needed");
  assert.equal(spokenText("[softly] 😅 ---"), "");
});

test("delivery keeps the displayed text and pins voice-dependent cache identity", () => {
  const displayedText = "Okayyy… **Thursday** — after six.";
  const prepared = prepareMayaSpeech({ displayedText, protocolHandled: true, style: "low, gentle" });
  assert.equal(prepared.displayedText, displayedText);
  assert.equal(prepared.spokenText, "Okayyy… Thursday, after six.");
  assert.equal(prepared.voice, "Despina");
  assert.equal(prepared.cacheNamespace, "gm-Despina");
  assert.match(prepared.geminiTtsPrompt!, /^Say in a warm, natural Indian-accented Hinglish, low, gentle:/);
  assert.equal(prepareMayaSpeech({ displayedText: "[tone: gentle]", protocolHandled: true }).geminiTtsPrompt, null);
  assert.throws(() => prepareMayaSpeech({ displayedText, protocolHandled: false as true }), /Protocol and action tags/);
});

test("delivery instructions keep AI identity and reject stage directions", () => {
  const instructions = mayaDeliveryInstructions();
  assert.match(instructions, /disclosed AI representative/);
  assert.match(instructions, /Do not write stage directions/);
  assert.match(instructions, /at most one real question/);
});
