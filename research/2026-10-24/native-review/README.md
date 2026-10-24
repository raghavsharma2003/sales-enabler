# Native-speaker review packets (open.2026-10-24.indic-native-review)

One file per language the agent can now speak beyond Hindi, English, Hinglish, Tamil and Bengali: kn-IN, te-IN, ml-IN,
mr-IN, gu-IN, pa-IN, or-IN. Each takes a native speaker about 15 minutes. It lists:
- the AI disclosure line;
- the crisis words and the opt-out words the safety floor listens for;
- what each must mean, with boxes to mark.

**How the owner uses them**
- Hand one file to a native speaker of that language.
- Collect the marked file and put it back here as `<code>.reviewed.md`.
- The safety builder merges the corrections into `product/shared/safety/disclosure.json` and `rules.json`.
- Then the language comes off the `review` map in disclosure.json. Until then:
  - `version.language_variant` refuses that language;
  - each entry stays marked "not native-reviewed".

The words come from `rules.json` (`cs.crisis.indic_more`, `cs.opt_out.indic_more`) and the lines from `disclosure.json`,
as of commit 7bcdc7c.
