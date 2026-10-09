# Dependency hardening — 9 October 2026

This pass addressed the production dependency findings reported by `npm audit --omit=dev`. It changed only `package.json` and `package-lock.json`; the application source was unchanged.

## Resolved findings

- **Next.js:** upgraded from `16.3.5` to `16.4.0`. This is newer than the first patched 16.x releases (`16.3.6` for the ImageResponse issue and `16.3.8` for the remaining findings) and retains the existing React 19 peer compatibility. Primary advisories: [ImageResponse remote code execution](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [Draft Mode cache leak](https://github.com/advisories/GHSA-3w37-wq28-93x7), [self-hosted SSG/ISR cache poisoning](https://github.com/advisories/GHSA-4jqv-mc3x-m676), [development MCP information disclosure](https://github.com/advisories/GHSA-39w2-rjm5-chcv), [metadata image route disclosure](https://github.com/advisories/GHSA-f87g-xv8r-7p7x), [catch-all SSG/ISR cache poisoning](https://github.com/advisories/GHSA-mcj8-r9mp-w47p), and [Image Optimization SSRF](https://github.com/advisories/GHSA-cjq9-62q9-8jv4). The installed Next 16 migration guide and [Next.js 16.4.0 release notes](https://github.com/vercel/next.js/releases/tag/v16.4.0) were reviewed.
- **sharp:** pinned through an npm override from `0.35.4` to patched `0.35.5`, which includes the fixed librsvg build. Primary advisory: [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- **source-map-js:** pinned through an npm override from `1.2.1` to patched `1.2.2`. Primary advisory: [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- **Azure Speech SDK:** remained pinned at `microsoft-cognitiveservices-speech-sdk@1.52.0`.

The audit moved from six vulnerable package entries (`3` moderate, `2` high, `1` critical) to three moderate entries. No high or critical findings remain in this audit result.

## Bounded unresolved chain

The remaining three audit entries are one dependency chain: `mammoth@1.12.3 → argparse@1.0.10 → sprintf-js@1.0.3`. The [sprintf-js advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) lists every published version through `1.1.3` as affected and identifies no patched release. Mammoth `1.13.0`, the current release checked during this pass, still declares `argparse ~1.0.3`.

An override to `argparse@3.0.2` was tested and rejected because Mammoth's declared CLI immediately fails on the removed legacy `addHelp` API. The audit-suggested downgrade to `mammoth@0.3.29` was also rejected because it is a large, incompatible downgrade rather than a maintained fix.

The current application conversion path imports Mammoth's `extractRawText` API. Loading that API did not load argparse or sprintf-js; those dependencies are used by Mammoth's CLI. This bounds the observed exposure for the current application path, but it does not erase the package-manager finding or establish a general security claim. Revisit the chain when Mammoth or sprintf-js publishes a compatible fix.

## Verification

Dependency-pass checks completed successfully:

- `npm audit --omit=dev`: three moderate entries in the single unresolved Mammoth chain; zero high and zero critical entries.
- Installed versions confirmed: Next.js `16.4.0`, sharp `0.35.5`, source-map-js `1.2.2`, and Azure Speech SDK `1.52.0`.
- Mammoth CLI `--help` remained functional.
- A synthetic DOCX was converted through `mammoth.extractRawText` with the expected text.
- Focused ingestion tests passed: `12/12`.

Separate full-application verification by the root task subsequently passed `900/900` tests and a Next.js `16.4.0` production build whose package check reported `1113` packaged files. Those results cover the combined application state and are separate from the focused dependency checks above. They do not establish hosted deployment readiness or a broad production-security conclusion.
