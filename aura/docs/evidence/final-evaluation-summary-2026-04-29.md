# Final Evaluation Evidence Summary - 2026-04-29

## 1. Purpose

This file summarizes the final available evaluation evidence for Aura as of 2026-04-29. It is intended as report-writing support only and does not modify product behavior, Safety Router behavior, backend behavior, AI behavior, dashboard behavior, mobile behavior, n8n workflows, seed logic, tests, benchmark scripts, or the abstract.

This summary uses existing evidence files and known verified results only. It should not be read as clinical validation, production readiness evidence, real patient validation, or proof of unsupervised clinical deployment safety.

## 2. Implementation Evidence Overview

| Area | Final evidence status | Evidence source |
| --- | --- | --- |
| Safety Router | Deterministic router evaluated on 144 author-labelled synthetic examples with no mismatches. | `safety-router-author-labelled-evaluation-2026-04-29.md` |
| Patient app | Patient-facing flows are covered by existing server/mobile verification; mobile tests are listed under verification status. | Known verified test results |
| Clinician dashboard | Dashboard behavior is covered by existing dashboard unit and E2E verification; dashboard counts are listed under verification status. | Known verified test results |
| Static RAG | `/rag/reply` retrieves curated static rehabilitation knowledge for low-risk support and falls back safely. | `rag-static-knowledge-retrieval-2026-04-29.md` |
| MongoDB living memory | Patient-scoped deterministic memory records are implemented with sanitized summaries and same-patient low-risk retrieval. | `rag-living-memory-phase-2-2026-04-29.md` |
| PGVector static knowledge retrieval | Optional PGVector persistence/retrieval for curated static rehab knowledge is implemented; JSON remains source of truth. | `rag-pgvector-static-retrieval-2026-04-29.md` |
| PGVector patient-memory index | Optional backend-owned PGVector index stores searchable copies of sanitized low-risk memory summaries; MongoDB remains canonical. | `rag-pgvector-patient-memory-index-2026-04-29.md` |
| Latency benchmark | Final local synthetic PGVector memory-enabled benchmark completed with 0 failures and target-compliant p95 values. | `latency-benchmark-final-pgvector-memory-enabled-2026-04-29.md` |
| Test verification | Latest known server, AI, dashboard, and mobile test counts are summarized below. | Evidence files and known verified results |

## 3. Safety Router Evaluation

Dataset:

- 144 author-labelled synthetic examples.
- Label source: author-labelled synthetic prototype examples.
- Real patient data: none.

Results:

| Metric | Value |
| --- | ---: |
| True positives | 76 |
| False positives | 0 |
| True negatives | 68 |
| False negatives | 0 |
| Precision | 1.0000 |
| Recall | 1.0000 |
| F1 | 1.0000 |
| Reason-code agreement | 1.0000 |
| Mismatches | none |

Interpretation boundary:

- This is author-labelled synthetic prototype evidence only.
- It is not clinician-reviewed.
- It is not clinical validation.
- It is not real patient validation.
- It is not deployment validation.

## 4. Mobile Voice Assist Evidence

Aura mobile now has V1 reviewed dictation, V2 read-aloud, V3 navigation-only voice commands, V4-A deterministic guided check-in parsers, and V4-B guided check-in panel UI evidence, all bounded to prototype support and not clinical validation.

Evidence summary:

- V1 adds reviewed speech-to-text dictation for the chat composer and check-in notes.
- V1 keeps **Send** and **Submit** as the only submission paths.
- V1 has no auto-send, voice commands, wake word, background listening, raw audio persistence, server transcription endpoint, or direct `/rag/reply` call.
- V2 adds user-controlled text-to-speech read-aloud for assistant replies, exercise instructions, fixed safety guidance, and selected check-in question/help text.
- V2 uses `expo-speech@~14.0.8`.
- V2 has Speak/Stop only, with no auto-play, no auto-submit, no external/server TTS, and no Safety Router bypass.
- V3 adds tap-to-use navigation-only voice commands for signed-in patient screens.
- V3 supports opening screens, going back, showing help, and stopping read-aloud.
- V3 rejects unsafe commands such as `submit check-in`, `send message`, `book appointment`, `upload photo`, `call emergency`, `message clinician`, `set pain level`, and mixed commands such as `open chat and send message`.
- V3 does not submit forms, send chat, book/cancel appointments, upload photos, log medication/hydration/nutrition, create alerts, call emergency services, pass command text to `/rag/reply`, call chat/check-in mutation paths, store command text, or persist raw audio.
- V3 is not a full voice agent and does not perform clinical actions by voice.
- V4-A implemented deterministic parser utilities and tests only for future voice-guided check-in.
- V4-A did not add UI, did not integrate with `checkin.tsx`, and did not change check-in submission behavior.
- V4-A parser utilities: `parseGuidedCheckinPainScore`, `parseGuidedCheckinMoodScore`, `parseGuidedCheckinExerciseAdherence`, `parseGuidedCheckinMedicationStatus`, `parseGuidedCheckinNotesTranscript`, `parseGuidedCheckinSleepHours`, and `parseGuidedCheckinSleepQuality`.
- V4-A parser behavior is conservative: ambiguous phrases such as "bad", "some", "fine I guess", medication names alone, and dosage-change language fail instead of guessing.
- V4-A parser module has no React, API, storage, logging, speech, submit, `/rag/reply`, alert creation, or Safety Router integration.
- V4-A preserves no auto-submit, no direct `/rag/reply`, no alert creation, no clinical action by voice, and keeps Safety Router authoritative only after normal check-in submission in later UI integration.
- Targeted parser verification: `npm test -- guidedCheckinParser.test.ts` passed 83 tests.
- V4-B implemented a collapsed-by-default guided voice panel on the Check-in tab.
- V4-B helps patients fill existing local check-in draft fields one at a time.
- V4-B writes values only after explicit patient confirmation.
- The manual check-in flow remains authoritative.
- The guided panel does not render a Submit button.
- The guided panel does not hide or disable the manual form.
- The existing `Submit check-in` button remains the only path to `POST /patient/checkins` and the Safety Router.
- The panel supports Listen, Confirm, Retry, Skip, and Edit manually.
- The panel shows transcript, interpreted value, confidence, and destination field before writing anything.
- V4-B supported fields: pain, mood, exercise completion, medication status, notes, sleep hours, and sleep quality.
- V4-B out-of-scope/manual-only areas: body map, support need, safety state, medication dosage, diagnosis, and treatment advice.
- V4-B safety/privacy boundaries: no auto-submit, no background listening, no wake word, no server STT, no external STT, no raw audio persistence, no hidden upload, no emergency calling, no alert creation, no `/rag/reply`, no diagnosis or treatment advice, and no Safety Router bypass.
- Emergency-like speech in numeric/simple fields shows visible safety guidance and writes nothing.
- High-risk notes become draft text only after explicit confirmation and route through the Safety Router only if the patient later taps `Submit check-in`.
- V4-B is not a full autonomous voice agent.
- Latest mobile verification after V4-B: `npm test` passed 48 test files / 299 tests; `npm run qa:web` passed; TypeScript passed; web guardrails and a11y smoke passed with `FAIL 0` and `WARN 0`; `expo-doctor` passed with the npm cache workaround; `expo-modules-autolinking verify` passed; `git diff --check` passed.
- Manual QA is not applicable yet for V4-A because no UI was added.
- Manual native QA is still required because V1/V3 use `expo-speech-recognition`, and V4-B guided check-in also uses speech recognition.
- Clinical validation remains future work.

Evidence sources:

- `mobile-voice-assist-v1-2026-04-29.md`
- `mobile-voice-assist-v2-read-aloud-2026-04-29.md`
- `mobile-voice-assist-v3-navigation-commands-2026-04-29.md`
- `mobile-voice-assist-v4a-guided-checkin-parser-2026-04-29.md`
- `mobile-voice-assist-v4b-guided-checkin-panel-2026-04-29.md`

## 5. Static RAG Phase 1

Aura's Phase 1 static RAG path implemented `/rag/reply` retrieval from curated static rehabilitation knowledge for messages that have already been classified as low risk.

Evidence summary:

- `/rag/reply` retrieves curated static rehabilitation knowledge.
- Replies are bounded and non-diagnostic.
- Citations are returned when relevant content is found.
- Safe fallback is used when no relevant chunk is found.
- No external LLM API or external embedding API is required for this retrieval path.
- High-risk messages continue through the alert/escalation path and do not call RAG.

## 6. Patient Living Memory Phase 2A + 2B

Aura's patient living memory is implemented as MongoDB-backed, patient-scoped deterministic memory.

Evidence summary:

- Patient memory records are scoped by `patientId`.
- Memory uses short sanitized summaries only.
- Memory retrieval is used for low-risk chat only.
- High-risk chat bypasses memory retrieval, RAG generation, and memory writing.
- Retrieval is same-patient only.
- MongoDB remains canonical for patient memory.
- Memory extraction skips high-risk/crisis text, medication dosage details, contact details, secrets, third-party personal details, and likely identifiers.

## 7. PGVector Static Knowledge Phase 2C-A

Aura's static rehabilitation knowledge retrieval now has optional PGVector-backed persistence and retrieval.

Evidence summary:

- Optional PGVector-backed persistence/retrieval for curated static rehab knowledge is implemented.
- JSON static rehabilitation knowledge remains the source of truth.
- No patient data is stored in the static PGVector table.
- Direct retrieval smoke succeeded for a missed-exercise query and returned `static-rehab:missed_exercises@static-rehab-v1`.
- Deterministic hashing vectors are prototype retrieval vectors, not clinically validated semantic embeddings.
- PGVector static retrieval is fallback-safe when disabled, unavailable, empty, or erroring.

## 8. PGVector Patient-Memory Index Phase 2C-B

Aura now has optional backend-owned PGVector indexing for sanitized patient memory summaries.

Evidence summary:

- MongoDB remains canonical for patient memory.
- PGVector stores only searchable copies of sanitized low-risk summaries.
- Retrieval requires exact same-patient filtering.
- Cross-patient smoke result: `sameCount=1` and `otherCount=0`.
- PGVector patient-memory retrieval is disabled by default and fallback-safe.
- Raw chat messages are not indexed.
- High-risk/crisis text is not indexed.
- Contact details, names, secrets, medication dosage details, third-party details, and real patient data are not indexed.
- High-risk chat never mirrors or queries PGVector patient memory.
- AI `/rag/reply` continues to receive bounded patient memory context from the backend; the AI service does not query PGVector patient memory directly.

## 9. Final Latency Benchmark

Final PGVector memory-enabled benchmark:

| Field | Value |
| --- | --- |
| Timestamp | `2026-04-29T14:51:04.692Z` |
| Run ID | `845047b4-7ff6-4ab5-aec7-608a590ee1c9` |
| Samples | 15 measured samples |
| Warmups | 2 warmups per flow |
| Failures | 0 |
| Created alert IDs | 17 |

Runtime:

- AI static PGVector retrieval enabled.
- Backend optional PGVector patient-memory indexing enabled.
- MongoDB and PGVector running.
- PGVector extension version `0.8.1`.

Metrics:

| Metric | Median | P95 |
| --- | ---: | ---: |
| `lowRiskChat.roundTripMs` | 24.78 ms | 64.85 ms |
| `highRiskChat.roundTripMs` | 18.34 ms | 39.97 ms |
| `alertVisibleFromRequestStartMs` | 21.39 ms | 50.72 ms |
| `clinicianAlertRetrievalMs` | 2.90 ms | 10.72 ms |
| `jobVerifiedFromRequestStartMs` | 19.83 ms | 41.46 ms |

Project target comparison:

- Low-risk chat p95 `64.85 ms` is below the `3.5 seconds` target.
- Alert visibility p95 `50.72 ms` is below the `60 seconds` target.

Interpretation boundary:

- This is local synthetic prototype evidence only.
- It is not production-scale performance evidence.
- It is not clinical deployment evidence.
- Results may vary with local machine load, Docker state, service startup, warmup effects, and webhook behavior.

## 10. Verification Status

Latest known verified results:

| Area | Result | Note |
| --- | --- | --- |
| Server full tests | 53 files passed, 336 tests passed | Verified after PGVector patient-memory index implementation. |
| Server focused PGVector/memory/chat/AI tests | 4 files passed, 41 tests passed | Includes vector service, memory service, chat flow, and AI client tests. |
| Server build | Passed | TypeScript build completed successfully. |
| AI tests | 50 passed | Normal AI tests. |
| Static PGVector regression tests | 12 passed | PGVector-enabled static retrieval regression. |
| Dashboard unit tests | 505 passed | Earlier verified evidence; rerun if dashboard code changes again. |
| Dashboard E2E tests | 19 passed | Earlier verified evidence; rerun if dashboard code changes again. |
| Mobile tests | 48 files passed, 299 tests passed | Latest known mobile verification after Voice Assist V4-B guided check-in panel. |

The dashboard count is included as a known verified result supplied for this final summary. The latest mobile count is recorded in the Mobile Voice Assist V4-B evidence. These surfaces should be rerun if they change again before submission.

## 11. Limitations And Cautions

- This is synthetic prototype evidence only.
- This is not clinical validation.
- This is not clinician-reviewed validation.
- This is not real patient validation.
- This is not production-scale validation.
- This is not proof of unsupervised clinical deployment safety.
- Deterministic hashing vectors are prototype retrieval vectors, not clinically validated semantic embeddings.
- Privacy filtering is defense in depth, not clinical-grade de-identification.
- Local latency may vary with machine load, Docker state, service startup, warmup, and webhook behavior.
- PGVector patient-memory indexing stores only sanitized summaries, while MongoDB remains canonical.
- No raw patient chat messages should be stored in PGVector.
- High-risk chat remains on the deterministic escalation path and bypasses RAG, memory retrieval, memory writing, and PGVector patient-memory indexing.
- Mobile Voice Assist evidence is local/prototype implementation evidence and still requires native development/production build QA for V1/V3 speech recognition and V4-B guided check-in speech recognition.
- Voice Assist V3 is navigation-only and does not perform clinical actions by voice.
- Voice Assist V4-A is parser-only evidence; it has no guided panel, no voice-guided check-in UI, no clinical validation, no auto-submit, no alert creation, and no clinical action by voice.
- Voice Assist V4-B is guided panel prototype evidence, not a full autonomous voice agent, not clinical validation, and still requires manual native QA.

## 12. Safe Report Wording

### A. Testing And Evaluation

Aura was evaluated using functional tests, synthetic Safety Router examples, and local synthetic latency benchmarks. The deterministic Safety Router achieved 1.0000 precision, recall, F1, and reason-code agreement on 144 author-labelled synthetic examples. Server, AI, dashboard, and mobile tests were used to verify implementation behavior. A final local benchmark with PGVector retrieval paths enabled measured 64.85 ms p95 low-risk chat latency and 50.72 ms p95 alert visibility time across 15 measured requests.

### B. Limitations And Future Work

These results are prototype evidence only. The Safety Router evaluation used author-labelled synthetic examples rather than clinician-reviewed or real patient data. PGVector retrieval uses deterministic hashing vectors and should not be interpreted as clinically validated semantic retrieval. Further work should include clinician review, real-world usability testing, larger-scale performance testing, and formal clinical safety evaluation.

### C. Viva/Demo Explanation

Aura keeps high-risk rehabilitation messages on a deterministic escalation path, while low-risk support can use static rehabilitation retrieval and patient-scoped living memory, with MongoDB as canonical storage and PGVector used only as an optional sanitized retrieval index.

## 13. Final Abstract-Ready Facts

Facts that are safe to use later when writing an abstract, with the surrounding limitation that clinical validation remains future work:

- 144-example author-labelled synthetic Safety Router evaluation.
- 1.0000 precision, recall, F1, and reason-code agreement.
- Static rehabilitation retrieval and patient-scoped living memory implemented.
- MongoDB canonical memory with optional PGVector indexing for sanitized retrieval.
- 336 server tests, 299 mobile tests across 48 files, 505 dashboard unit tests, 19 dashboard E2E tests, and 50 AI tests passed.
- Mobile Voice Assist V1 reviewed dictation, V2 read-aloud, V3 navigation-only voice commands, V4-A deterministic guided check-in parsers, and V4-B guided check-in panel implemented, with manual native QA for speech-based UI and clinical validation still future work.
- Final latency benchmark: 64.85 ms p95 low-risk chat, 50.72 ms p95 alert visibility.
- Clinical validation remains future work.

## 14. Cleanup / Demo Note

Benchmarks write synthetic local chat, alert, and notification job records.

Cleanup command:

```bash
cd "/Users/University/Final Project/aura/server"
npm run seed:reset
```
