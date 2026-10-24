# Bolna blind-inference calibration (2026-10-20)

## Verification (calibration against open-source code, workflow wf_560edf6c-5d6)

- Checked: 35; confirmed: 16; downgraded: 10; refuted: 2
- Hit rate: 16/20 correct, 4 partly, 0 wrong on the pre-registered set (hit 0.90, Brier 0.089). Strict, with minor detail errors counted as partly: 10/20 correct, 10 partly (0.75, Brier 0.066).

### Refuted

- BI-35 (sub-clause): The code check found 0 wrong rows. The one clause refuted so far is the hosted claim 'unknown fields rejected', and the evidence is account-phase, not code: the acct-bolna lane POSTed an unknown key to /v2/agent and got 201 with the key silently dropped (data/account-phase/bolna/api-live/probe_unknown_field.json). Under the pre-registered code-only rule the row stays correct, on FastAPI + Pydantic + Redis + S3 recordings.
- BI-16 (filler clause): 'Fillers are pre-generated audio played while the LLM is thinking' is false in the open engine: the path is unreachable dead code. The row scores partly because the backchannel half is right.

### Downgraded

- BI-06 (stated 0.75 -> partly): LiteLLM only serves 12 long-tail providers. The default Azure gpt-4.1-mini path calls AsyncAzureOpenAI directly and strips the 'azure/' prefix (bolna/providers.py:113-133, bolna/llms/azure_llm.py:10-11,80-81). The inference stretched a docs sentence about extra providers to cover all LLM calls.
- BI-15 (stated 0.75 -> partly): The ambient_noise flag (bolna/models.py:969) and the office-ambience/call-center/coffee-shop WAVs (local_setup/presets/ambient_noise/) exist, but nothing in the open engine mixes them into outbound audio. Where the mixing happens is hosted-only.
- BI-16 (stated 0.55 -> partly): The backchannel clause is exactly right (task_manager.py:948-963, 8426-8453). The filler clause is wrong: use_fillers only adds a 'do not start with fillers' prompt note (task_manager.py:2221-2222, prompts.py:198). The filler-audio branch reads filler_preset_directory, which is never assigned, so it is dead code (task_manager.py:7776-7782).
- BI-17 (stated 0.65 -> partly): The conclusion is right, the mechanism is wrong. synthesizer.caching is an in-memory cache that lasts one call (inmemory_scalar_cache.py:9). Reuse across calls comes from three other places: the backend pre-synthesizes the welcome (task_manager.py:530-555), static clips come from S3 (7787-7820), and handoff clips sit in a process-wide cache (299-301).
- BI-08 (correct -> correct, detail error (strict: partly)): 'trunk' is an execution label that rides the freeswitch fork, not its own handler (enums.py:22-24). The vobiz and freeswitch handlers are open source, so the 'may be closed' hedge was too pessimistic.
- BI-09 (correct -> correct, detail error (strict: partly)): The incremental delay holds the agent's audio, not the LLM call (interruption_manager.py:76-100). The pass also missed the speculative LLM request on Flux EagerEndOfTurn (task_manager.py:5864-5931).
- BI-10 (correct -> correct, detail error (strict: partly)): The trigger is MORE than N words, so the dashboard's 2 means 3 words; the open-source default is 1 (interruption_manager.py:108-126, models.py:957-959). Speech-to-speech mode does barge in on the provider's acoustic VAD (task_manager.py:8874-8889).
- BI-11 (correct -> correct, detail error (strict: partly)): The OpenAI transcriber path uses a local RMS energy gate, threshold 400 (openai_transcriber.py:323-325).
- BI-12 (correct -> correct, detail error (strict: partly)): The pass missed the second hangup mode: the end_call tool, either global ('primary' / 'primary_with_shadow_hangup') or scoped to a node (task_manager.py:875-907).
- BI-29 (correct -> correct, detail error (strict: partly)): Retrieval runs in a separate closed rag-proxy-server, queried every turn with the latest user message only (rag_service_client.py:27-35, knowledgebase_agent.py:193-210). Unsiloed, mpnet and ONNX are hosted-only. The acct-bolna rater scored this row PARTLY.

### Notes

I scored all 35 blind inferences against Bolna's open-source code (github.com/bolna-ai/bolna at bc59921, 2026-10-20). It was a shallow clone into /home/user/sales-enabler/data/teardown/bolna/code/bolna/, read only, with nothing installed or run. The blind file was frozen first: its mtime is 16:25:46Z and the clone was made at 18:52Z; I recorded its sha256 (ac22eecf…).

**Results (pre-registered rule; 20 rows: checkable in the code, contamination none or possible)**
- Lenient: 16 correct, 4 partly, 0 wrong. Hit 0.90, Brier 0.089, mean stated confidence 0.69.
- Strict (correct rows with detail errors count as partly): 10 correct, 10 partly, hit 0.75, Brier 0.066.
- Correct-only rate: 0.80 lenient (Wilson 95% about 0.58-0.92), 0.50 strict (about 0.30-0.70).
- Rows with no contamination only (18): 15 correct, 3 partly (0.917).
- All 24 checkable rows including the 4 contaminated ones: 20 correct, 4 partly.
- The 11 rows the code cannot check: none contradicted. BI-22 (Asterisk ulaw) and BI-23 (trunk legs on the FreeSWITCH fork, stated at 0.45) are core-confirmed; 6 are consistent with the code; 3 the code says nothing about.

**By primary evidence type**
| Evidence | Rows | Result | Hit |
|---|---|---|---|
| docs | 14 | 13 correct, 1 partly | 0.96 |
| JS bundle | 5 | 2 correct, 3 partly | 0.70 |
| network/DNS | 1 | 1 correct | 1.0 |
| job posts | 0 | none rested on them | cannot compute |
| marketing | 0 | none rested on it | cannot compute |

Counting every type a row cites: docs 0.967 (n=15), bundle 0.867 (n=15).

**By claim kind**
- Structure: 5/5 correct. Absence: 4/4 correct.
- Mechanisms read from bundle config flags: only 1 of 4 fully right. ambient_noise_track, use_fillers and synthesizer.caching all name a real feature, but the code implements it differently or not at all.

**Calibration by stated confidence (lenient / strict observed)**
| Stated | n | Lenient | Strict |
|---|---|---|---|
| 0.45 | 1 | 1.0 | 0.5 |
| 0.60 | 5 | 0.80 | 0.80 |
| 0.72 | 11 | 0.91 | 0.73 |
| 0.83 | 3 | 1.0 | 0.83 |

The blind pass was under-confident on lenient scoring. On strict scoring it was well calibrated at 0.7-0.85.

**Second rater.** The acct-bolna lane scored the same rows independently at the same SHA (/home/user/sales-enabler/research/2026-10-20/account-phase/bolna/blind-scoring.json): 14 TRUE, 6 PARTLY, 0 FALSE (0.85). It agrees with my lenient verdicts on 18/20 rows (Cohen's kappa 0.74) and with my strict verdicts on 14/20 (kappa 0.40). We disagree only on BI-29 and BI-35.

**What the blind pass missed: 16 features in the code it never inferred**
- 5 extraction misses, all present in the docs file it had already downloaded:
  - speech-to-speech mode;
  - a speculative LLM request on EagerEndOfTurn;
  - the web-search tool;
  - hangup via the end_call tool;
  - multi-agent routing.
- 10 visible only in the code:
  - **Language switching:** a separate judge model (default Claude Haiku 4.5 via LiteLLM, Bedrock ap-south-1 as an option) is fed by a parallel Sarvam/Soniox language-ID recognizer. It sends a duplicate request after 1.8 s and gives up at 6 s.
  - **Self-hosted Hindi speech recognition:** provider 'bolna' defaults to the model nemotron-asr-hi.
  - **Dead filler code** (the path described above).
  - **Retrieval** runs in a separate proxy service.
  - **Call-quality telemetry:** interruption and talk-listen counters, plus a monitor that finds dead air inside agent replies.
  - **Stop-word and filler lists are English-only.**
  - **Tests:** 2,072 test functions.
  - **Short replies are dropped:** a final transcript of N words or fewer spoken over the agent is discarded (interruption_manager.py:128-143, task_manager.py:5950-5961).
  - **Azure failover** to an overflow deployment on 429 or 5xx errors.
  - **History trim:** after a barge-in, history is cut back to what the caller actually heard.

  The acct-bolna lane listed the last three first; I verified each in the code.
- 1 method note: the open-source defaults differ from the hosted dashboard defaults (call_terminate 90 vs 300 s, incremental_delay 900 vs 300 ms, interruption words 1 vs 2). So the code alone would mispredict hosted behaviour.

**Method findings**
1. A config flag shows that a feature is exposed, not how it works. On closed vendors, grade mechanisms read from flags at 0.5 or lower and probe them in the account phase.
2. Sweep each vendor's full docs dump against a fixed checklist before inferring, because a third of the misses were already in the docs.
3. Docs-led accuracy carries over to vendors with deep docs (Vapi, Retell, ElevenLabs) better than to those with thin docs (SquadStack, Exotel).
4. Caveats: n=20 is small, and I was not blind when scoring, which the second rater partly mitigates.

**What this means for the three decisions**
- **Pre-sale or post-sale first:** the engine has 0 lines of India compliance code (DND, DLT, NCPR, consent, calling windows), so it lives in the closed scheduler or with the buyer. This fits a post-sale-first start, or a compliance layer as the pre-sale wedge. The code cannot decide which.
- **Parity floor:** the open engine of the Indian self-serve leader already ships:
  - speech-to-speech mode and the speculative LLM request;
  - graph agents with expression and event edges, plus multi-agent routing;
  - web search and retrieval;
  - language switching with language ID and a judge model;
  - DTMF, transfers, LLM voicemail detection, backchannels;
  - Azure failover and history trimmed to what was heard;
  - telemetry.
  That is the comparison set for a v1.
- **Where we can be measurably better:**
  - Short Hindi replies spoken over the agent ('haan ji', 'nahi', 'ruko') are dropped, and the stop-word list is English-only. Test with the l4b barge-in items.
  - Voicemail detection waits for 7 or more words and checks every 7 s for up to 30 s. Test detection time on Indian operator messages (prediction P06a).
  - A language switch costs an extra judge call; the code comment puts p50 at about 1.4 s. Test against P11b.
  - There is no memory across calls and no learning loop, but the per-call signals such a loop would need already exist (v2 note).

**What only the account phase can settle**
- Whether ambient noise is mixed, and where.
- Whether hosted fillers play audio.
- Which model the hosted language judge uses: read the execution log's other_latencies.
- Hosted defaults for discard_pre_welcome_utterance and Deepgram's model-improvement opt-out (the code default is not opted out).
- Whether hosted Hindi calls run on nemotron-asr-hi.
- How the scheduler handles duplicates, opt-outs and calling windows (P04-P05).

**Not written**
- calibration.md and the 'Calibration' section of research/2026-10-20/teardown/bolna/report.md. The subagent rule forbids report .md files, and no sibling lane has a report.md either; bolna/report.md does not exist yet. The text above is the content for both. The full data, including every row's deciding file:line, is in calibration.json. An open-question node in the inbox tracks this.

**Written**
- /home/user/sales-enabler/research/2026-10-20/teardown/bolna/calibration.json
- /home/user/sales-enabler/research/2026-10-20/teardown/bolna-check/claims.json (20 claims)
- /home/user/sales-enabler/research/2026-10-20/teardown/bolna-check/manifest.csv (333 files with sha256)
- /home/user/sales-enabler/context/inbox/teardown-bolna.json: 12 nodes, including measure.2026-10-20.bolna-blind-calibration, plus 20 edges and 1 event, validated with scripts/lib/context-schema.mjs. Edges to the blind lane's node ids are held under pending_edges_after_blind_merge, because those ids are not in graph.json yet.

The scoring scripts are in /tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bolna-check/. I did not use REA: this lane only reads source code. Nothing was committed and graph.json is unchanged.

This lane did not draft the user's other request, a prompt for Instinct to set up the accounts using team@vyakti.ai; that is for the main loop.
