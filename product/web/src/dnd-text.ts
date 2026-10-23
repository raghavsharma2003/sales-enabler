// What a Do Not Disturb check says to a person: the tally, and who answered (the real national register or a stand-in).
export interface DndTally { checked: number; registered: number; not_registered: number; unknown: number; source?: { label: string; standIn: boolean; registerConnected: boolean } }
/** Who answered the lookup: a buyer must know whether the real national register is connected. */
export const sourceText = (s?: DndTally['source']) => !s ? '' : s.registerConnected ? ` Answered by ${s.label}.`
  : ` Answered by ${s.label}. These answers do not come from the national register, so promotional calls stay held back.`;
export const tallyText = (t: DndTally) => `Checked ${t.checked} number${t.checked === 1 ? '' : 's'}: ${t.registered} on the Do Not Disturb list, ${t.not_registered} not on it, ${t.unknown} without an answer.${sourceText(t.source)}${t.unknown === t.checked && t.checked > 0 && t.source?.registerConnected !== false ? ' The register gave no answer, so they stay marked as not checked. Try again later.' : ''}`;

