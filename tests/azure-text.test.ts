import assert from 'node:assert/strict';
import test from 'node:test';
import { generateAzureText } from '../lib/ai/azure-text';

const env = { AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com/openai/v1', AZURE_OPENAI_API_KEY: 'private-test-key', AZURE_OPENAI_TEXT_DEPLOYMENT: 'existing-deployment' };
test('company group replies stay on Azure and retain a usage receipt', async () => {
  const result = await generateAzureText({ system: 'authorized context', user: 'hello' }, { env, fetch: (async (url, init) => {
    assert.equal(url, 'https://example.openai.azure.com/openai/v1/chat/completions');
    assert.equal((init?.headers as Record<string,string>)['api-key'], 'private-test-key');
    assert.equal(JSON.parse(init?.body as string).model, 'existing-deployment');
    assert.equal(init?.redirect, 'error');
    return Response.json({ choices: [{ message: { content: 'A grounded reply.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 17, completion_tokens: 6 } });
  }) as typeof fetch });
  assert.deepEqual(result, { text: 'A grounded reply.', model: 'existing-deployment', usage: { inputTokens: 17, outputTokens: 6 } });
});
test('uncertain Azure replies are redacted and are never automatically retried', async () => {
  let calls = 0;
  await assert.rejects(generateAzureText({ system: '', user: 'hello' }, { env, fetch: (async () => { calls++; throw new Error('secret upstream body'); }) as typeof fetch }), error => error instanceof Error && !error.message.includes('secret') && /No automatic retry/.test(error.message));
  assert.equal(calls, 1);
});
