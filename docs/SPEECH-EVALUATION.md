# Local transcription evaluation

This workflow compares cached speech models against independently reviewed,
held-out human references. It runs locally. It does not capture a microphone,
upload or copy recordings, download models, export recognized words, or use
reference text as a decoder prompt. It is evaluation, not model training.

Create a private folder under the ignored `.data/speech/evaluation/` directory.
Include only clips whose participants consented specifically to transcription
evaluation and whose retention period is still valid. Prior interview recording
consent or a one-off device-test permission does not automatically grant this use.
Keep the references private and delete the folder when the agreed period expires.

Use opaque clip and speaker identifiers. A reviewer must listen to each clip and
write what was actually spoken, including errors and language switches. A suggested
test script is not sufficient ground truth unless a reviewer confirmed it against
the saved audio. Keep these clips out of any model tuning or training set.

A manifest in that folder has this structure (replace every example value):

```json
{
  "schemaVersion": 1,
  "clips": [
    {
      "id": "clip_01",
      "speakerGroup": "speaker_01",
      "path": "clip_01.webm",
      "source": "human",
      "consented": true,
      "consentPurpose": "transcription-evaluation",
      "reviewed": true,
      "heldOut": true,
      "language": "en",
      "reference": "Replace with the independently reviewed words actually spoken."
    }
  ]
}
```

Use `language: "auto"` to evaluate automatic language detection, or a supported
code such as `en`, `hi` or `kn` to evaluate a known language. English-only models
reject other configured languages. Files must be within the manifest's directory,
at most 6 MB each, and no longer than 120 decoded seconds. At most 100 clips are
accepted per run. The tool validates all consent/review/hold-out fields before
loading a model or reading clip bytes. These declarations must reflect actual
consent and review; software cannot establish that by itself.

Install the pinned multilingual model with `scripts/setup-speech-model.py --download`
and keep the baseline model cached. Run:

```powershell
.data/speech/venv/Scripts/python.exe -I scripts/evaluate-speech.py --manifest .data/speech/evaluation/manifest.json --models base.en small
```

The report defaults to `.data/runtime/speech-held-out-evaluation.json`. It contains
opaque IDs, counts, error codes, timings, aggregate WER/CER and per-requested-language
metrics. It omits paths, references, hypotheses and speaker identifiers. It does
not update interview records or mark any saved transcript as reviewed.

WER is word edit distance divided by reference word count; CER uses characters.
Normalization preserves Unicode letters and combining marks, folds case, replaces
punctuation/symbols with spaces, and collapses whitespace. CER then removes
whitespace. Technical symbols such as `C++` are affected by this normalization;
review important technical terms separately. WER/CER can exceed 100% with many
insertions. Rejected clips count as full deletions in error rates and count toward
the rejected fraction; failures are never excluded to improve the mean.

The default project gate requires at least 10 clips and 3 speakers, overall WER at
most 20%, CER at most 10%, and at most 10% rejected clips. These are configurable
project thresholds, not validated population accuracy criteria. A small sample
cannot pass by having an empty or perfect-looking average. The process exits 1
if any compared model fails the configured gate. Passing a local gate still sets
`deploymentAccuracyValidated=false`; review coverage of accents, languages,
microphones, quiet/noisy speech, pauses, code-switching and technical vocabulary
before relying on transcription. Avoid selecting only speakers or clips that
worked well during development.

Pure decoder/evaluation contract tests require no recordings or model inference:

```powershell
.data/speech/venv/Scripts/python.exe -I -m unittest discover -s tests -p 'test_speech*.py'
```

No consented, reviewed multi-speaker benchmark has been supplied yet. Therefore
no human-speech WER/CER or general accuracy pass is claimed by this implementation.
