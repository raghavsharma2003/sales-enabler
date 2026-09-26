import { readFile, writeFile } from 'node:fs/promises';
const region = 'eastus2'; // Confirmed by successful resource-key Personal Voice listing.
const key = process.env.AZURE_OPENAI_API_KEY;
if (!key) throw new Error('Azure resource key is missing.');
const origin = `https://${region}.api.cognitive.microsoft.com/customvoice`;
const headers = { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' };
const version = 'api-version=2026-01-01';
const projectId = 'sales-enabler-personal-voice';
const existing = await fetch(`${origin}/projects/${projectId}?${version}`, { headers, signal: AbortSignal.timeout(20000) });
let project;
if (existing.status === 404) {
  const response = await fetch(`${origin}/projects/${projectId}?${version}`, { method: 'PUT', headers, body: JSON.stringify({ kind: 'PersonalVoice', displayName: 'Sales Enabler Personal Voice', description: 'Consented speaker enrollment for the Sales Enabler workspace.' }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) { console.log(JSON.stringify({ stage: 'create-project', status: response.status })); process.exitCode = 1; }
  else { project = await response.json(); console.log(JSON.stringify({ stage: 'create-project', status: response.status, kind: project.kind })); }
} else if (existing.ok) { project = await existing.json(); console.log(JSON.stringify({ stage: 'reuse-project', status: existing.status, kind: project.kind })); }
else { console.log(JSON.stringify({ stage: 'read-project', status: existing.status })); process.exitCode = 1; }
if (project) {
  if (project.kind !== 'PersonalVoice' || project.id !== projectId) throw new Error('Existing project type did not match.');
  const models = await fetch(`${origin}/basemodels?${version}&kind=PersonalVoice`, { headers, signal: AbortSignal.timeout(20000) });
  const modelData = models.ok ? await models.json() : {};
  const items = modelData.value || [];
  const names = items.map(item => item.name || item.voiceName || item.displayName || item.id).filter(value => typeof value === 'string');
  console.log(JSON.stringify({ stage: 'base-models', status: models.status, models: names }));
  const configured = { AZURE_SPEECH_KEY: key, AZURE_SPEECH_REGION: region, AZURE_PERSONAL_VOICE_PROJECT_ID: projectId, AZURE_PERSONAL_VOICE_LIMITED_ACCESS_APPROVED: 'true' };
  const fixed = names.find(name => /^PhoenixV\d+Neural$/.test(name));
  if (fixed) configured.AZURE_PERSONAL_VOICE_BASE_VOICE = fixed;
  const path = new URL('../.env.local', import.meta.url);
  let lines = (await readFile(path, 'utf8')).split(/\r?\n/);
  for (const [name, value] of Object.entries(configured)) { lines = lines.filter(line => !line.startsWith(`${name}=`)); lines.push(`${name}=${value}`); }
  await writeFile(path, lines.join('\n') + '\n');
  console.log('Speech enrollment settings saved privately. No voice talent or training request was submitted.');
}
