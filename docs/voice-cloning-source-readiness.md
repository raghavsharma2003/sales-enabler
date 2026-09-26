# Voice-cloning source readiness

Audit date: 22 September 2026. This is a read-only source and provider
feasibility audit for `sales-enabler`. No provider request, deployment,
enrollment, profile creation, paid call, or key value was made or read. The
only permitted paid inference route remains the existing Azure Founders Hub
resource and grant.

## Decision

The app's currently verified Azure route cannot use a cloned voice directly.
The configured Azure OpenAI Realtime session is `gpt-realtime-2.1-mini` with
`marin` on the endpoint host `raghavsharma1729-compan-resource.openai.azure.com`.
That endpoint is the existing browser voice path, and its current configuration
surface accepts the documented fixed Realtime voices. It has no
`speakerProfileId` or Personal Voice field.

Azure cloning is technically feasible under the same Azure-only spending rule,
but it is not runnable from the current metadata alone. It requires Azure
Speech Personal Voice access and a Speech/Foundry endpoint that is approved for
that feature. The smallest viable production shape is:

1. collect the speaker's provider-specific consent recording;
2. create a Personal Voice project, consent, and profile through Azure Custom
   Voice API `2026-01-01`;
3. wait for the profile to reach `Succeeded`, retaining its
   `speakerProfileId` only on the server;
4. synthesize through Azure Speech SSML with a pinned base voice and
   `mstts:ttsembedding`; and
5. stream the resulting PCM through the existing cascade/player contract.

For conversational realtime output, Microsoft now documents Azure Voice Live
as the Azure realtime surface that can use custom voices, including Personal
Voice. Its session voice is shaped as
`{ type: "azure-personal", model: "DragonLatestNeural", name: "..." }`.
The model must be available on the same Foundry or Azure Speech resource as
Voice Live. This is a separate integration from the current Azure OpenAI
Realtime adapter and still requires limited-access approval and separate custom
voice training/hosting billing. See Microsoft’s [Voice Live customisation
guide](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to-customize)
and [Voice Live guide](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to).

## What the source actually contains

The `html-portfolio` `origin/main` tip
`3a9217981b27636745fc70ac490aacf9ef3f392d` does not contain a cloned Maya
voice. Its voice identity is a stock Gemini preset:

| source path | blob | evidence |
| --- | --- | --- |
| `src/voice/liveCall.ts` | `7c3758434864bce9a4dee5c1c1aed049dc2dd0b8` | Uses Gemini `Despina` and `hi-IN` configuration. |
| `api/speech.js` | `7695b82945f43d4e774a32c16b0ad7f651e5534f` | `DEFAULT_VOICE = "Despina"`; Gemini TTS model path. |
| `src/voice/speech.ts` | `a46e6b6ac3aa1296697faf103698599d6effe8d2` | `MEERA_VOICE = "Despina"`. |

This is useful as a delivery and disclosure reference. It is not voice-clone
training data, a speaker profile, or evidence that Maya's likeness was cloned.
The source lane also contains Google key-pool and other provider code; those
are outside the current Azure-only paid authorization.

The strongest Azure cloning implementation is the `origin/voice-cloning` tip
`a7bdcaa4879698fab941d1ac19b0ca9a9099dc4c`, carried into the Gurukul lineage
at `origin/claude/gurukul-platform`
`771feef9c124184a56abaea662bc16a079069ee1`:

| source path | relevant blob on `origin/voice-cloning` | what it proves |
| --- | --- | --- |
| `api/_voice/providers/azure-personal-voice.js` | `1968fe2854a2653f1c67a6539c82864d47f56c40` | Server-side Personal Voice provider: validates private WAVs, creates/reuses consent and Personal Voice resources, polls status, synthesizes SSML/PCM, meters spend, and deletes both provider resources. |
| `api/_replica-voice-profile.js` | `d5511a8e5cbae1439f7477c7febf5e807c703ec4` | Loads only owner-scoped approved VoiceGenome enrollment artifacts and materializes a server-only provider input. |
| `docs/AZURE-PERSONAL-VOICE.md` | `e17659edfeeecd8219e0eae41d8882e9f8760e5c` | Explicit status: production-shaped and offline-qualified; no Azure request/profile and no verified Limited Access approval. |
| `docs/REPLICA-PROCESSING.md` | `1a446787196bf65d68fde2ea52d2b81e81d86fee` | Explicit status: Azure processing adapter has only mocked HTTP coverage; no live quality or spend claim. |
| `evals/azure-personal-voice/run.mjs` | `6c082fc71eec3004d3898206fee80f96cb469e8a` | Structural test harness with fake private audio, fake Azure responses, and fake budget callbacks; not a live clone result. |
| `db/migrations/034_replica_voice_enrollment.sql` | `e94e117c6aa846e657b332bb330c910daaaf7a7b` | Tenant/provider-consent/genome/commitment bindings for voice profiles. |

The later Gurukul provider blob is
`8b0d11486c91ebf70e9cc0539eab9d7723f95a94` and the profile loader blob is
`8b708fc00aa0fe276f048c1addc2c99c5de4fad4`. These are the same audited
lineage with later branch packaging; neither changes the live-evidence limit.

## Enrollment and artifact gates

The source provider intentionally keeps consent separate from target speech.
The required provider consent artifact is a WAV/MP3-compatible recording of
Microsoft’s current verbal statement. The name and company must be spoken as
recorded, the consent locale must match the training locale, and the same
speaker must provide both consent and prompt audio. Microsoft states these
requirements in [Add user consent](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/personal-voice-create-consent).

The source control plane then requires:

- an owner-scoped `subject_mode='self'` replica;
- current `capture`, `storage`, `biometric`, and `training` consents;
- age, identity, and liveness verification that has not expired;
- an approved VoiceGenome version whose `references.enrollment_artifact_ids`
  explicitly name the target artifacts;
- private, immutable enhanced WAV artifacts, at most one per source, with no
  third-party or fixture/test provenance;
- 5–90 seconds per file, no more than ten prompt files, and 30–90 seconds of
  total target speech (the adapter chooses a 30–90 second product floor); and
- byte-verified WAV structure, hash, duration, sample rate, channel count,
  signal presence, and clipping checks before spend reservation or provider I/O.

Microsoft’s current Personal Voice page confirms the provider-side 5–90 second
clean sample requirement, supported WAV rates/bit depths, a 30 MB maximum file
size for the file API, and the asynchronous `NotStarted` → `Running` →
`Succeeded`/`Failed` lifecycle. The source adapter is stricter: canonical
24 kHz, 16-bit, mono WAV and a 30 MiB aggregate request cap. See [Create a
personal voice](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/personal-voice-create-voice).

The provider returns an opaque `azpv1` handle. It deliberately keeps the
Personal Voice ID, consent ID, `speakerProfileId`, endpoint, model, and key
server-side. A ready profile is persisted as `vy_replica_voice_profile` with
status `creating` or `ready`; a failed status is retained. Deletion first
revokes runtime capability, then deletes the Personal Voice and consent copy,
and only then removes the local mapping.

One source implementation caveat matters before calling this production-ready:
`waitUntilReady` in `api/_voice/providers/azure-personal-voice.js` polls 20
times at 250 ms (about five seconds) for both consent and profile creation.
Microsoft documents these operations as asynchronous and returns an
`Operation-Location`; a real service may take longer than that short loop. A
live canary must confirm observed processing time or replace the short polling
fuse with durable status reconciliation before the route is described as
reliable. The source also requires a version-pinned base model, but its test
model names are fixtures; the actual approved resource must be queried for
current base-model availability.

## Readiness status for this workspace

| layer | status | evidence |
| --- | --- | --- |
| Existing Azure OpenAI Realtime browser audio | **bounded verified** | `docs/calling-workbench.md`; typed Listen & type calls and a synthetic smoke test. Microphone/STT/interruption and cloned identity are unverified. |
| Maya/Meera cloned identity from `html-portfolio` | **not present** | Main tip uses stock Gemini `Despina`; no Azure profile or clone artifact. |
| Azure Personal Voice adapter | **offline qualified only** | `docs/AZURE-PERSONAL-VOICE.md` and `evals/azure-personal-voice/run.mjs`; mocked HTTP and fake budget. |
| Real consent recording | **missing** | No provider-specific consent audio is in this workspace. |
| Real target samples/artifacts | **missing** | No approved VoiceGenome or private enhanced WAV set is in `sales-enabler`. |
| Personal Voice Limited Access | **unknown/unverified** | The source registry refuses creation unless an explicit approval flag is set. |
| Speech endpoint/TTS endpoint/project/base model | **missing from current app config** | Current `.env.local` contains only Azure OpenAI Realtime metadata; no Personal Voice configuration names. |
| Azure grant coverage and rates | **unverified** | The grant is a ceiling, not proof that Personal Voice training/hosting meters are covered. |

The source's video-link enrollment lane is also not a ready shortcut. The
Gurukul tip `origin/claude/gurukul-platform`
`771feef9c124184a56abaea662bc16a079069ee1` adds
`api/_video-enroll.js` and `db/migrations/061_video_enrollment.sql`, but its
own documentation says server-side YouTube extraction was refused by YouTube,
no 15-minute extraction succeeded, and migration 060 was unapplied. A direct,
consented upload that passes the artifact DAG is the realistic source route.

## Minimum request needed before implementation

No secret value is needed in chat. To turn this into a runnable Azure-only
implementation, the owner must provide or confirm through the deployment
secret store:

1. whether the current Foundry resource is eligible for Azure Voice Live and
   Azure Speech Personal Voice, and its Speech/Foundry region;
2. Microsoft Personal Voice/Custom Voice Limited Access approval for this
   business use case;
3. the approved Personal Voice project ID and a fixed base model name (never a
   moving `Latest` alias);
4. a server-side Speech/Foundry credential and the corresponding Speech REST
   and TTS endpoints; and
5. one real speaker’s consent recording plus 30–90 seconds of clean target
   speech, with explicit authorization to create, use, disclose, and erase the
   replica.

The existing Azure OpenAI key and endpoint can continue to serve realtime
reasoning/input if desired, but they do not establish any of these Personal
Voice prerequisites. Microsoft’s [Personal Voice overview](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/personal-voice-overview)
and [Custom Voice API reference](https://learn.microsoft.com/en-us/rest/api/speech/)
state that Personal Voice access is limited and must be requested. Microsoft’s
[Azure OpenAI Realtime WebRTC reference](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio-webrtc)
lists only fixed Realtime voice names, while [Use personal voice in an
application](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/personal-voice-how-to-use)
requires SSML with `speakerProfileId`.

Until those facts are confirmed, the honest product state is **Azure browser
voice works with a stock voice; Azure voice cloning is designed but blocked at
approval, resource metadata, and real enrollment artifacts**.
