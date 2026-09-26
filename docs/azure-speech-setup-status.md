# Azure Speech / Personal Voice setup status

Checked 2026-09-22. This note intentionally contains no endpoint values, resource names, subscription IDs, keys, project IDs, consent IDs, or audio data.

## What was verified locally

- `sales-enabler/.env.local` contains an Azure OpenAI endpoint/key for the existing Realtime integration and now also contains private Speech region/key/project settings for the Personal Voice project. It does not contain `AZURE_PROJECT_ENDPOINT`.
- A read-only `GET /openai/models` request using the configured Azure OpenAI key returned `200` and the `x-ms-region` response header `East US 2`. The model catalog includes the Realtime model used by the app.
- A read-only `GET /customvoice/personalvoices?api-version=2026-01-01&maxpagesize=1` request against the East US 2 Cognitive Services regional endpoint, using the same key as `Ocp-Apim-Subscription-Key`, returned `200` with an empty list and `x-ms-region: East US 2`.
- Setup created a Personal Voice project on the existing resource. A subsequent `GET /customvoice/projects/{projectId}?api-version=2026-01-01` returned `200` and `kind: PersonalVoice`.
- Microsoft’s documented `BaseModels_List` operation is `GET /customvoice/basemodels?api-version=2026-01-01`; it has no `kind` query parameter. The exact documented request returned `403 Forbidden` with the reason “You don’t have permission to access this resource.” The previous request with `&kind=PersonalVoice` returned the same `403`, so the query parameter was not the cause.
- The subsequent access diagnostics were read-only. No consent record, speaker profile, model deployment or audio upload was created; only the empty Personal Voice project was set up.

The endpoint responses establish the model-serving region and that the key can reach the Personal Voices list route in East US 2. They do not establish Personal Voice Limited Access approval. The project exists and the list route is readable, but the BaseModels list is permission-denied; this points to an operation-level eligibility/approval problem or a resource/key-scope mismatch, rather than a malformed `kind` query. The data-plane checks cannot distinguish those two cases by themselves.

## Region and resource interpretation

Microsoft’s [Speech supported-regions table](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions) marks `eastus2` as supporting Personal voice. The configured application endpoint has the Azure OpenAI hostname shape (`*.openai.azure.com`), and its East US 2 response is the Azure OpenAI-serving route. This is a hostname/data-plane observation, not a management-plane verification of the Azure resource `kind`; leave the account resource kind unconfirmed until the Azure portal or Resource Manager metadata is checked. Personal Voice is a Speech/Foundry capability, and Microsoft’s REST examples use a Speech/Cognitive Services endpoint (`*.cognitiveservices.azure.com`) and a Speech resource key.

## Exact portal checks

1. Open the [Azure portal](https://portal.azure.com/) and open the resource that owns the configured Azure OpenAI endpoint.
2. On **Overview**, record only **Resource type/kind** and **Location**. The location should read **East US 2** for the endpoint checked above. Do not copy or disclose a key.
3. Open **Keys and Endpoint**. An endpoint ending in `openai.azure.com` has the Azure OpenAI data-plane shape. A Speech resource normally exposes a Cognitive Services endpoint ending in `cognitiveservices.azure.com`; do not infer the account resource kind or entitlement from the fact that the same key currently reaches some Personal Voice routes.
4. Open [Microsoft Foundry](https://ai.azure.com/) and select the project associated with the resource intended for Speech. Choose **Discover → Overview → Experiment with prebuilt services → Azure Speech → Services → Customize → Personal voice**. If Personal voice is missing or the portal asks for registration, the account/project is not ready to create one.
5. Check that the resource is in `East US 2` and is not the Free **F0** tier. Microsoft states Personal Voice is unavailable on F0.
6. Before voice enrollment, confirm use-case approval and obtain the speaker's required explicit recorded consent. No audio has been submitted by this app yet.

For an approval check, the decisive evidence is the Microsoft Limited Access registration/account-team response and the Personal voice option being available in the Foundry project. A local `AZURE_PERSONAL_VOICE_LIMITED_ACCESS_APPROVED` flag is an operator assertion, not proof supplied by Azure. If the Foundry option is missing or the documented BaseModels list continues to return `403 Forbidden`, ask the Azure account team to confirm that Personal Voice Limited Access is approved for this subscription, resource, region, and use case; do not try to work around the denial with another query parameter or by submitting audio.

## Access requirement

Microsoft documents Personal Voice as a [Limited Access feature](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/text-to-speech/limited-access). The use case must be approved before setup; customers must register through the [Limited Access registration form](https://aka.ms/customneural). The [Personal Voice setup guide](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/personal-voice-create-project) also requires an eligible region, a non-F0 resource, and explicit permission from the voice talent. Microsoft’s [consent guide](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/personal-voice-create-consent) requires a recorded statement acknowledging creation and use of the synthetic voice.

The current status is therefore: **East US 2, the Personal Voice project, and the read-only Personal Voices list route are verified; BaseModels_List is permission-denied; Personal Voice approval and the management-plane resource kind remain unconfirmed; no consent or voice-enrollment step has been performed.**

Keep the existing Azure OpenAI variables unchanged until the portal confirms whether a Speech/Foundry resource is already associated with this account. If it is not, configure a separate Speech endpoint/key only after the user authorizes that setup.
