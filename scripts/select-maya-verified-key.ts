// Keep the source pool intact while selecting a proven free-key label locally.
// Never prints or persists a key value outside the already ignored env file.
import { readFile, writeFile } from "node:fs/promises";
import { activeMayaGoogleKeyEntries, getVoiceConfiguration, mayaGoogleKeyEntries } from "../lib/voice/config";

async function main() {
  const entries = mayaGoogleKeyEntries(process.env);
  const independent = entries.filter((item, index) => entries.findIndex(candidate => candidate.label === item.label) === index);
  const index = Number(process.env.MAYA_VERIFIED_POOL_INDEX);
  const selected = Number.isInteger(index) && index >= 0 && index < independent.length ? independent[index] : undefined;
  if (!selected || selected.label.length > 100 || /[,\r\n"'\\]/.test(selected.label)) {
    process.stdout.write("Maya label selection: invalid index or label; no file changed.\n");
    process.exitCode = 1;
    return;
  }
  if (process.env.MAYA_VERIFY_ONLY === "true") {
    const active = activeMayaGoogleKeyEntries(process.env);
    const ready = getVoiceConfiguration(process.env, "maya-despina").configured;
    process.stdout.write(`Maya label selection: activeCount=${active.length}; matchesProven=${active.length === 1 && active[0].key === selected.key}; configured=${ready}\n`);
    process.exitCode = active.length === 1 && active[0].key === selected.key && ready ? 0 : 1;
    return;
  }
  const path = ".env.local";
  const original = await readFile(path, "utf8");
  const line = `MAYA_GOOGLE_ACTIVE_LABELS=${JSON.stringify(selected.label)}`;
  const next = /^MAYA_GOOGLE_ACTIVE_LABELS=.*$/m.test(original)
    ? original.replace(/^MAYA_GOOGLE_ACTIVE_LABELS=.*$/m, line)
    : `${original.replace(/\s*$/, "")}\n${line}\n`;
  await writeFile(path, next, "utf8");
  process.stdout.write("Maya label selection: one proven free-key label active; pool retained.\n");
}
void main().catch(() => { process.stdout.write("Maya label selection: failed; check local env file.\n"); process.exitCode = 1; });
