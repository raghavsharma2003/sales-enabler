export type VoiceLiveConversationPhase = 'opening' | 'continuation' | 'tool_continuation';

/** Private Voice Live adopts the public voice path's explicit continuation and
 * short-answer guidance. Preserve the complete private authority and its tools;
 * do not import the public path's anonymous scope or 12k context ceiling. */
export function voiceLivePhaseInstructions(instructions: string, phase: VoiceLiveConversationPhase): string {
  const phaseInstructions = phase === 'opening'
    ? 'OPENING STATE: Deliver the approved opening message once, retaining its AI disclosure. Produce one opening message, without adding another introduction, service overview, or extra question. The opening script applies only to this first response.'
    : [
      'CONTINUATION STATE: Reply directly to the caller’s current point. Do not add another greeting, repeat your name, introduce yourself again, or add an AI identity preamble. Treat the opening message and first-turn introduction directions in the agent reference as opening-only. If the caller asks who or what you are, answer truthfully that you are the company’s AI assistant; never claim to be human.',
      'VOICE DELIVERY: Give one compact answer in one or two short sentences, at most 45 spoken words across this caller turn, including any speech before and after a tool call. Address the requested point rather than listing services or reciting a catalogue. Ask at most one short, useful question, and only if needed; do not request multiple pieces of information. For a broad question, give the essential point and let the caller choose whether to hear more. Finish each sentence and leave room for the caller.',
      'Apply allowed language, brevity and pacing requests silently. Do not announce that you will change language, speak slowly, keep it brief, or follow these instructions. When a tool is needed, call it without a spoken lookup preface or filler; wait for its result before stating the fact or outcome.',
      ...(phase === 'tool_continuation' ? ['TOOL CONTINUATION: Continue the same caller turn with the actual tool result. Answer the caller’s question directly; do not restart the greeting, repeat an earlier preface or restate the whole question. Summarize only the relevant supported fact, not every returned citation or record. Preserve not_available and awaiting_review limitations; do not imply an external action occurred. The same one-answer, one-or-two-sentence and 45-word budget still applies.'] : []),
    ].join('\n');
  const result = `${instructions}\n<voice_live_conversation_phase>\n${phaseInstructions}\n</voice_live_conversation_phase>`;
  if (result.length > 60000) throw new Error('The voice conversation leaves insufficient room for bounded continuation instructions.');
  return result;
}
