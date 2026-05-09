# Final Evaluation Evidence Summary - 2026-04-29

## 1. Purpose

This file summarizes the final available evaluation evidence for Aura as of 2026-04-29. It is intended as report-writing support only and does not modify product behavior, Safety Router behavior, backend behavior, AI behavior, dashboard behavior, mobile behavior, n8n workflows, seed logic, tests, benchmark scripts, or the abstract.

This summary uses existing evidence files and known verified results only. It should not be read as clinical validation, production readiness evidence, real patient validation, or proof of unsupervised clinical deployment safety.

## 2. Implementation Evidence Overview

| Area | Final evidence status | Evidence source |
| --- | --- | --- |
| Safety Router | Deterministic router evaluated on 144 author-labelled synthetic examples with no mismatches. | `safety-router-author-labelled-evaluation-2026-04-29.md` |
| Patient app | Patient-facing flows are covered by existing server/mobile verification; mobile tests are listed under verification status. | Known verified test results |
| Mobile UI/UX accessibility | Phase 1 scoped accessibility and task-completion blockers from the read-only UI/UX audit were fixed for mobile. | `mobile-uiux-accessibility-phase1-2026-04-29.md` |
| Voice Agent V5-A | Backend-only OpenAI Realtime session broker implemented for authenticated patient users; no mobile UI or clinical voice actions. | `voice-agent-v5a-realtime-session-broker-2026-04-29.md` |
| Voice Agent V5-B1 | Mobile-only Voice Agent session request prototype implemented; no live audio, WebRTC, tools, or clinical actions. | `voice-agent-v5b1-mobile-session-request-ui-2026-04-29.md` |
| Voice Agent V5-B2-Web | Browser-only live Realtime WebRTC audio demo implemented on `/voice-agent`; native live audio, tools, and clinical voice actions remain out of scope. | `voice-agent-v5b2-web-realtime-audio-2026-04-29.md` |
| Voice Agent V5-C1 | Mobile-only deterministic safe action proposal layer implemented with local whitelist parsing, visible review UI, and no data-changing voice execution. | `voice-agent-v5c1-safe-action-proposals-2026-04-29.md` |
| Voice Agent V5-C2 | Mobile-only safe route/control actions and safe workflow-start actions implemented with visible proposal review and no data-changing voice execution. | `voice-agent-v5c2-safe-workflow-starts-2026-04-29.md` |
| Voice Agent V5-D1 | Mobile-only Check-in-screen-owned confirmed voice check-in submit implemented with explicit review, conservative confirmation, and the existing submit path. | `voice-agent-v5d1-confirmed-checkin-submit-2026-04-29.md` |
| Voice Agent V5-D2 | Mobile-only Chat-screen-owned confirmed voice chat send implemented with exact message review, explicit confirmation, and the existing manual chat send path. | `voice-agent-v5d2-confirmed-chat-send-2026-04-29.md` |
| Voice Agent V5-D3 | Mobile-only Appointments-screen confirmed voice appointment request implemented with selected-slot review, explicit confirmation, existing appointment request path, and pending clinician approval semantics. | `voice-agent-v5d3-confirmed-appointment-request-2026-04-29.md` |
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

## 4. Mobile Voice Assist And UI/UX Accessibility Evidence

Aura mobile now has V1 reviewed dictation, V2 read-aloud, V3 navigation-only voice commands, V4-A deterministic guided check-in parsers, V4-B guided check-in panel UI evidence, V5-C1 deterministic safe action proposal evidence, V5-C2 safe workflow-start evidence, V5-D1 confirmed voice check-in submit evidence, V5-D2 confirmed voice chat send evidence, V5-D3 confirmed voice appointment request evidence, and Mobile UI/UX Accessibility Fix Phase 1 evidence. Voice features remain bounded to prototype support and not clinical validation.

Evidence summary:

- Mobile UI/UX Accessibility Fix Phase 1 completed.
- Phase 1 fixed scoped accessibility and task-completion blockers from the read-only UI/UX audit.
- Body-map visual hotspot size was preserved while tappable area was expanded to at least 44pt where needed using `hitSlop`.
- Body-region labels now announce selection state.
- Check-in accessibility improved for steppers, clear buttons, mood/options, notes, medication reason, and support switch.
- Existing check-in submit path and high-risk routing were preserved.
- Exercise feedback modal accessibility improved with modal boundary semantics, screen-reader header, selected difficulty state, pain value announcement, labeled note input, and clearer save/cancel/skip hints.
- StatusPill semantic foreground text now uses calmer high-contrast colors.
- Global floating voice command button is hidden on `/voice-agent` to avoid competing with the Voice Agent session UI.
- Voice command safety boundaries were preserved.
- No backend, AI, dashboard, n8n, API contract, clinical routing, Safety Router, high-risk routing, check-in submit routing, or voice-agent session behavior changed.
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
- V5-B1 implemented a mobile-only Voice Agent session request prototype.
- V5-B1 added `/voice-agent`, reusable `VoiceAgentSessionPanel`, and a Home/Demo Hub entry.
- V5-B1 lets a signed-in patient request a backend-created temporary Realtime session secret from `POST /patient/voice/session`.
- V5-B1 UI shows prepared-session status, safe metadata, and expiry.
- In V5-B1, "connected" means prototype session ready/session prepared, not live voice conversation.
- V5-B1 added `createPatientVoiceSession(token)`.
- `createPatientVoiceSession(token)` sends authenticated `POST /patient/voice/session` with no body.
- `createPatientVoiceSession(token)` validates `ok`, `clientSecret.value`, `clientSecret.expiresAt`, `session.id`, and `session.model`.
- `createPatientVoiceSession(token)` maps `404`, `401`/`403`, `429`, server, network, and timeout failures to safe user-facing messages.
- V5-B1 does not expose raw upstream errors.
- V5-B1 safety/privacy boundaries: no live audio, no WebRTC, no native packages, no microphone session, no background listening, no app action tools, no clinical mutations, no check-in submission, no chat sending, no appointment booking/canceling, no medication/hydration/nutrition logging, no uploads, no alerts, no emergency calls, no Safety Router bypass, no mobile OpenAI API key, no `EXPO_PUBLIC_OPENAI_API_KEY`, no transcript storage, and no raw audio storage.
- V5-B1 keeps `clientSecret.value` in component memory only.
- V5-B1 never renders or logs `clientSecret.value`.
- V5-B1 clears `clientSecret.value` on stop, unmount, backgrounding, expiry, error, and missing token/sign-out detection.
- V5-B1 does not persist `clientSecret.value` to AsyncStorage or SecureStore.
- V5-B2-Web implemented browser-only live Realtime WebRTC audio on `/voice-agent`.
- V5-B2-Web uses the existing V5-A backend broker `POST /patient/voice/session`.
- V5-B2-Web uses `createPatientVoiceSession(token)`.
- V5-B2-Web keeps `clientSecret.value` in memory only.
- V5-B2-Web requests browser microphone permission only after Start.
- V5-B2-Web creates `RTCPeerConnection` on Expo web/browser only.
- V5-B2-Web posts SDP to `https://api.openai.com/v1/realtime/calls` using the temporary client secret.
- V5-B2-Web transitions to live after the SDP answer is set.
- Native iOS/Android do not start live audio in V5-B2-Web and show web-demo-only copy.
- V5-B2-Web added no native WebRTC packages.
- V5-B2-Web did not change `mobile/package.json`.
- V5-B2-Web did not change `mobile/app.json`.
- V5-B2-Web added no OpenAI API key or `EXPO_PUBLIC_OPENAI_API_KEY` to mobile.
- V5-B2-Web safety/privacy boundaries: no secret rendering/logging/storage, no AsyncStorage/SecureStore secret writes, no transcript persistence, no raw audio persistence, no background listening, no always-on microphone, no tools, no app actions, no check-in submission, no chat sending, no appointment booking/canceling, no medication/hydration/nutrition logging, no uploads, no alerts, no emergency calling, and no Safety Router bypass.
- V5-B2-Web automated tests use mocked WebRTC/OpenAI behavior.
- V5-B2-Web automated tests made no live OpenAI calls.
- V5-C1 implemented a mobile-only deterministic voice action proposal layer.
- V5-C1 parses local text intent into whitelisted safe proposals.
- V5-C1 shows visible review UI in the Voice Agent panel.
- V5-C1 proposal-only drafts remain memory-only on `/voice-agent`.
- V5-C1 actions come only from a local whitelist parser, not from Realtime model output.
- V5-C1 does not wire live Realtime transcript text into the proposal parser as an executable command source.
- V5-C1 allowed actions: Open Check-in, Open Chat, Open Exercise plan, Open Appointments, Open Safety, Open Coping tools, Go back, Stop session, Stop reading, and Show voice help.
- V5-C1 proposal-only actions: Start guided check-in screen, Draft check-in note only, Draft chat message only, Select appointment slot, Prepare hydration log, Prepare medication status, Prepare nutrition log, and Prepare exercise completion.
- V5-C1 proposal-only actions only offer review/open-screen paths.
- V5-C1 proposal-only actions do not call mutation APIs.
- V5-C1 blocked actions: diagnosis, treatment advice, medication dose or schedule changes, silent submit/send/book/log/upload, alert creation, emergency calling, Safety Router bypass, clinician override, and suppress or ignore alert requests.
- V5-C1 safety/privacy boundaries: no backend changes, no Realtime tools, no server tool calling, no mutation APIs, no check-in submission by voice, no chat sending by voice, no appointment booking/canceling by voice, no medication/hydration/nutrition logging by voice, no photo upload by voice, no direct alert creation, no emergency call automation, no transcript persistence, no raw audio persistence, no draft storage, no URL-param draft passing, no OpenAI key exposure, no Safety Router behavior changes, and no clinical routing behavior changes.
- V5-C2 was implemented for the mobile app only.
- V5-C2 adds safe route/control actions and safe workflow-start actions.
- V5-C2 keeps proposal review visible in the Voice Agent panel.
- V5-C2 adds safe guided check-in workflow start.
- V5-C2 does not add data-changing voice actions.
- V5-C2 allowed route/control proposals: Open check-in, Open chat, Open exercise plan, Open appointments, Open safety, Open coping tools, Go back, Stop session, Stop reading, Voice help, and Guided check-in workflow start.
- V5-C2 guided check-in workflow-start behavior: "start guided check-in" routes to `/(tabs)/checkin` with only `voiceGuided=1`.
- The V5-C2 guided check-in route flag expands/starts the guided check-in surface state only.
- The V5-C2 guided check-in route flag does not start microphone recognition, submit answers, autosave drafts, call `createCheckin`, or pass clinical text through route params.
- Unknown or array route params are ignored safely.
- V5-C2 safety/privacy boundaries: no mutation APIs, no care-data writes, no alert creation, no Safety Router bypass, no transcript persistence, no draft persistence, no raw-audio persistence, no Realtime tools or handlers, no live Realtime transcript command execution, and no mobile OpenAI key exposure.
- V5-C2 intentionally does not implement V5-D confirmed actions, voice check-in submission, chat sending, appointment booking/canceling, medication/hydration/nutrition logging, photo upload, emergency calling, diagnosis, treatment, dosage advice, or Realtime transcript/event command execution.
- V5-D1 was implemented as a mobile-only, Check-in-screen-owned confirmed voice submit flow.
- V5-D1 lets the patient review the current check-in, hear or read a summary, listen for a conservative confirmation phrase, and submit through the existing check-in submit path.
- `VoiceGuidedCheckinPanel` can request or open the V5-D1 review flow, but it does not own API submission.
- V5-D1 added a compact "Voice submit review" panel on the final Review step.
- The V5-D1 panel supports reviewing the current draft, reading the summary aloud, listening for confirmation, manual Confirm submit, and canceling.
- Confirmed voice submit uses the same submit wrapper and path as manual Submit check-in.
- V5-D1 confirmation state is memory-only and includes `draftReady`, `needsRequiredFields`, `reviewSummary`, `awaitingVoiceConfirmation`, `confirmedSubmit`, `cancelled`, `submitting`, `submitted`, `highRiskRouted`, `offlineBlocked`, and `expired`.
- V5-D1 accepted voice confirmations are only "yes submit", "confirm submit", and "submit check-in".
- V5-D1 ambiguous phrases do nothing.
- V5-D1 cancel phrases clear the state.
- V5-D1 confirmation expires after about 30 seconds.
- V5-D1 draft changes invalidate the prior summary.
- V5-D1 submit path safety: same submit wrapper as manual submit, existing validation, preserved offline behavior, `createCheckin`, `POST /patient/checkins`, preserved Safety Router handling, and preserved high-risk routing to `/safety`.
- V5-D1 added no voice-only API, no direct alert creation, and no Safety Router bypass.
- V5-D1 safety/privacy boundaries: no Realtime transcript integration, no Realtime tools, no server-side tools, no backend changes, no transcript persistence, no raw audio persistence, no unconfirmed draft persistence, no OpenAI key exposure, no `EXPO_PUBLIC_OPENAI_API_KEY`, no emergency promise, no diagnosis, no treatment advice, no medication dosage advice, no chat sending, no appointment booking/canceling, no medication/hydration/nutrition logging, no photo upload, and no direct alert creation.
- V5-D2 was implemented as a Chat-screen-only confirmed voice send flow.
- V5-D2 lets the patient review the exact trimmed draft, optionally hear the summary, listen for an explicit confirmation phrase, and send through the existing manual chat send path.
- Dictation still only fills the draft and never sends.
- V5-D2 added a "Voice send review" card in the existing Chat composer area.
- The V5-D2 card supports Review for voice send, Listen for confirmation, Confirm send, and Cancel.
- The patient must review the exact trimmed message before sending.
- The flow sends only after explicit confirmation.
- V5-D2 confirmation state is memory-only and includes `draftReady`, `needsMessage`, `reviewMessage`, `awaitingVoiceConfirmation`, `confirmedSend`, `cancelled`, `sending`, `sent`, `highRiskRouted`, `offlineBlocked`, and `expired`.
- V5-D2 accepted voice confirmations are only "yes send", "confirm send", and "send message".
- V5-D2 ambiguous phrases, empty phrases, parser failure, recognition error, and negative phrases do not send.
- V5-D2 reviews expire after 30 seconds.
- V5-D2 raw draft changes invalidate the review.
- V5-D2 send path safety: same `handleSend()` path as manual Send, current-review validation, preserved trim/non-empty/read-only/offline validation, preserved `sendChat`, preserved assistant reply behavior, and preserved high-risk routing to `/safety`.
- V5-D2 added no voice-only chat API, no direct alert creation, and no Safety Router bypass.
- V5-D2 safety/privacy boundaries: no backend routes, no backend API contract changes, no Realtime tool-calling, no OpenAI mobile keys, no `EXPO_PUBLIC_OPENAI_API_KEY`, no direct alert creation, no transcript persistence, no audio persistence, no unconfirmed draft persistence, `recordingOptions.persist=false` for confirmation speech recognition, no appointment booking/canceling, no medication/hydration/nutrition logging, no photo upload, no emergency calling, no diagnosis, no treatment advice, and no medication dosage advice.
- Latest mobile verification after Voice Agent V5-D2: `npm test -- chatTruth.test.tsx voiceChatSendConfirmation.test.ts VoiceAgentSessionPanel.test.tsx` passed 3 files / 71 tests; `npm test` passed 57 files / 436 tests; `npm run qa:web` passed; TypeScript passed; web guardrails passed with 0 issues; a11y smoke passed with 0 issues; `git diff --check` passed; existing `react-test-renderer` deprecation and `act` warnings appeared but did not fail the suite.
- V5-D3 was implemented as a narrow mobile-only Appointments screen feature.
- V5-D3 lets patients review a selected appointment request, then submit only after explicit voice or button confirmation.
- V5-D3 creates a pending appointment request, not a guaranteed appointment.
- Appointment canceling by voice was not added.
- The Appointments screen now shows a "Voice request review" panel in Find time mode.
- V5-D3 blocks confirmation until a slot is selected.
- V5-D3 builds a memory-only snapshot of the selected slot plus optional trimmed note.
- V5-D3 shows the exact request summary.
- V5-D3 submits only after "yes request", "confirm request", "request appointment", or pressing Confirm request.
- V5-D3 confirmation states include `draftReady`, `needsSlot`, `needsReason`, `reviewRequest`, `awaitingVoiceConfirmation`, `confirmedRequest`, `cancelled`, `requesting`, `requested`, `offlineBlocked`, `expired`, and `unavailableSlot`.
- V5-D3 reviews expire after 30 seconds.
- V5-D3 slot changes invalidate the snapshot.
- V5-D3 note changes invalidate the snapshot.
- Ambiguous, error, nomatch, cancel, and negative phrases do not request.
- V5-D3 request path safety: confirmed requests reuse the existing `handleRequestSlot(selectedSlot)` path, that path calls `createAppointmentRequest`, and it uses the existing `POST /patient/appointments/requests` API.
- V5-D3 added no voice-only appointment API, no backend route, and no validation bypass.
- Successful V5-D3 response shows pending/request status, not direct booking.
- Existing unavailable-slot/server-conflict behavior is preserved.
- V5-D3 safety/privacy boundaries: no transcript persistence, no raw audio persistence, no unconfirmed draft persistence, no OpenAI key exposure, no `EXPO_PUBLIC_OPENAI_API_KEY`, no alert creation, no Safety Router bypass, no chat send, no check-in submit, no medication/hydration/nutrition logging, no upload calls, no emergency calling, no diagnosis, no treatment advice, no appointment canceling by voice, no `/voice-agent` Realtime transcript/tool behavior, no backend changes, and no direct booking guarantee.
- Latest mobile verification after Voice Agent V5-D3: `npm test -- voiceAppointmentRequestConfirmation.test.ts appointmentsScreen.test.tsx` passed 35 tests; `npm test` passed 59 files / 471 tests; `npm run qa:web` passed; TypeScript, web guardrails, and accessibility smoke passed; `git diff --check` passed; existing React test-renderer/act warnings appeared but did not fail the suite.
- V5-D4 later voice health-log actions remain future work.
- Remaining mobile UI/UX limitations: Home/Demo Hub density, deeper voice UX explanation, full long-screen hierarchy cleanup, keyboard-overlap manual device QA, broader caregiver/patient flow separation polish, and no real device/emulator visual QA pass was run.
- Manual QA is not applicable yet for V4-A because no UI was added.
- Manual native QA is still required because V1/V3 use `expo-speech-recognition`, and V4-B guided check-in also uses speech recognition.
- Manual live browser QA is still required for V5-B2-Web.
- Clinical validation remains future work.

Evidence sources:

- `mobile-voice-assist-v1-2026-04-29.md`
- `mobile-voice-assist-v2-read-aloud-2026-04-29.md`
- `mobile-voice-assist-v3-navigation-commands-2026-04-29.md`
- `mobile-voice-assist-v4a-guided-checkin-parser-2026-04-29.md`
- `mobile-voice-assist-v4b-guided-checkin-panel-2026-04-29.md`
- `mobile-uiux-accessibility-phase1-2026-04-29.md`
- `voice-agent-v5b1-mobile-session-request-ui-2026-04-29.md`
- `voice-agent-v5b2-web-realtime-audio-2026-04-29.md`
- `voice-agent-v5c1-safe-action-proposals-2026-04-29.md`
- `voice-agent-v5c2-safe-workflow-starts-2026-04-29.md`
- `voice-agent-v5d1-confirmed-checkin-submit-2026-04-29.md`
- `voice-agent-v5d2-confirmed-chat-send-2026-04-29.md`
- `voice-agent-v5d3-confirmed-appointment-request-2026-04-29.md`

## 5. Voice Agent V5-A Through V5-D3 Evidence

Aura Voice Agent V5-A implemented a backend-only OpenAI Realtime session broker. It is not a full voice agent yet and does not add mobile Realtime UI or clinical voice actions.

Evidence summary:

- V5-A added `POST /patient/voice/session`.
- The route is for authenticated patient users only.
- The route is feature-flagged off by default.
- The real `OPENAI_API_KEY` remains server-only.
- Mobile does not receive or store the real OpenAI API key.
- The route returns only `ok`, `clientSecret.value`, `clientSecret.expiresAt`, `session.id`, and `session.model`.
- The route does not return `OPENAI_API_KEY`, OpenAI request payload, safety identifier, instructions, tools, patient profile, or raw upstream errors.
- V5-A uses controlled Realtime session configuration with `tool_choice: none`, `tools: []`, parallel tool calls disabled, short TTL, tracing disabled, server VAD, near-field noise reduction, controlled Aura voice-support instructions, and hashed `OpenAI-Safety-Identifier` rather than raw patient id.
- V5-A preserves no mobile UI, no Realtime tools, no clinical mutations, no check-in submit, no chat send, no appointment booking, no alert creation, no emergency calling, no `/rag/reply`, no Safety Router bypass, no transcript logging, no audio logging, and no prompt/instruction logging.
- No live OpenAI call was made during verification.
- No API credits were spent.
- V5-A has no mobile Realtime UI, no actual voice conversation, no tool/action proposal layer, and no clinical actions by voice.
- V5-A is not clinical validation and not production voice-agent validation.

Aura Voice Agent V5-B1 implemented the first mobile-only Voice Agent session request UI. It is session preparation UI only and does not start a live voice conversation.

Evidence summary:

- V5-B1 added `/voice-agent`.
- V5-B1 added reusable `VoiceAgentSessionPanel`.
- V5-B1 added a Home/Demo Hub entry.
- V5-B1 lets a signed-in patient request a backend-created temporary Realtime session secret from `POST /patient/voice/session`.
- The UI shows prepared-session status, safe metadata, and expiry.
- In V5-B1, "connected" means prototype session ready/session prepared, not live voice conversation.
- V5-B1 added `createPatientVoiceSession(token)`.
- `createPatientVoiceSession(token)` sends authenticated `POST /patient/voice/session` with no body.
- `createPatientVoiceSession(token)` validates `ok`, `clientSecret.value`, `clientSecret.expiresAt`, `session.id`, and `session.model`.
- `createPatientVoiceSession(token)` maps `404`, `401`/`403`, `429`, server, network, and timeout failures to safe user-facing messages.
- V5-B1 does not expose raw upstream errors.
- V5-B1 has no live audio, no WebRTC, no native packages, no microphone session, no background listening, no app action tools, and no clinical mutations.
- V5-B1 has no check-in submission, no chat sending, no appointment booking/canceling, no medication/hydration/nutrition logging, no uploads, no alerts, no emergency calls, and no Safety Router bypass.
- V5-B1 has no mobile OpenAI API key, no `EXPO_PUBLIC_OPENAI_API_KEY`, no transcript storage, and no raw audio storage.
- `clientSecret.value` stays in component memory only.
- `clientSecret.value` is never rendered or logged.
- `clientSecret.value` is cleared on stop, unmount, backgrounding, expiry, error, and missing token/sign-out detection.
- `clientSecret.value` is not persisted to AsyncStorage or SecureStore.
- V5-B1 is not clinical validation and not production voice-agent validation.

Aura Voice Agent V5-B2-Web implemented a browser-only live Realtime WebRTC audio demo on `/voice-agent`. It is web demo evidence only and does not add native live audio, tools, or clinical voice actions.

Evidence summary:

- V5-B2-Web implemented browser-only live Realtime WebRTC audio on `/voice-agent`.
- V5-B2-Web uses the existing V5-A backend broker `POST /patient/voice/session`.
- V5-B2-Web uses `createPatientVoiceSession(token)`.
- V5-B2-Web keeps `clientSecret.value` in memory only.
- V5-B2-Web requests browser microphone permission only after Start.
- V5-B2-Web creates `RTCPeerConnection` on Expo web/browser only.
- V5-B2-Web posts SDP to `https://api.openai.com/v1/realtime/calls` using the temporary client secret.
- V5-B2-Web transitions to live after the SDP answer is set.
- Native iOS/Android do not start live audio in this phase and show web-demo-only copy.
- No native WebRTC packages were added.
- `mobile/package.json` was not changed.
- `mobile/app.json` was not changed.
- No OpenAI API key or `EXPO_PUBLIC_OPENAI_API_KEY` was added to mobile.
- V5-B2-Web preserves no secret rendering/logging/storage, no AsyncStorage/SecureStore secret writes, no transcript persistence, no raw audio persistence, no background listening, no always-on microphone, no tools, no app actions, no check-in submission, no chat sending, no appointment booking/canceling, no medication/hydration/nutrition logging, no uploads, no alerts, no emergency calling, and no Safety Router bypass.
- Automated tests use mocked WebRTC/OpenAI behavior.
- Automated tests made no live OpenAI calls.
- Manual live browser QA is still required.
- Live browser testing has real OpenAI API cost and privacy exposure.
- Browser WebRTC/microphone support varies.
- Remote audio playback can depend on browser autoplay policies.
- Native live audio remains future development-build work.
- V5-B2-Web has no clinical actions by voice yet and no tool/action proposal layer yet.
- V5-B2-Web is not clinical validation and not production voice-agent validation.

Aura Voice Agent V5-C1 implemented deterministic safe action proposals for the mobile Voice Agent. It is a proposal/review layer only and does not implement confirmed data-changing voice actions.

Evidence summary:

- V5-C1 was implemented as a mobile-only deterministic voice action proposal layer.
- V5-C1 parses local text intent into whitelisted safe proposals.
- V5-C1 shows visible review UI in the Voice Agent panel.
- Proposal-only drafts remain memory-only on `/voice-agent`.
- Actions come only from a local whitelist parser, not from Realtime model output.
- V5-C1 does not wire live Realtime transcript text into the proposal parser as an executable command source.
- Allowed actions: Open Check-in, Open Chat, Open Exercise plan, Open Appointments, Open Safety, Open Coping tools, Go back, Stop session, Stop reading, and Show voice help.
- Proposal-only actions: Start guided check-in screen, Draft check-in note only, Draft chat message only, Select appointment slot, Prepare hydration log, Prepare medication status, Prepare nutrition log, and Prepare exercise completion.
- Proposal-only actions only offer review/open-screen paths.
- Proposal-only actions do not call mutation APIs.
- Blocked actions: Diagnosis, treatment advice, medication dose or schedule changes, silent submit/send/book/log/upload, alert creation, emergency calling, Safety Router bypass, clinician override, and suppress or ignore alert requests.
- Safety/privacy boundaries: no backend changes, no Realtime tools, no server tool calling, no mutation APIs, no check-in submission by voice, no chat sending by voice, no appointment booking/canceling by voice, no medication/hydration/nutrition logging by voice, no photo upload by voice, no direct alert creation, no emergency call automation, no transcript persistence, no raw audio persistence, no draft storage, no URL-param draft passing, no OpenAI key exposure, no Safety Router behavior changes, and no clinical routing behavior changes.
- V5-C1 reviews typed/local intent in the Voice Agent panel.
- Live Realtime transcript text is not yet wired into the proposal parser as an executable command source.
- V5-C1 is prototype support, not clinical validation.
- V5-C1 is not production voice-agent validation.
- Confirmed data-changing voice actions remain future V5-D work.

Aura Voice Agent V5-C2 implemented safe route/control actions and safe workflow-start actions for the mobile Voice Agent. It keeps proposal review visible in the Voice Agent panel and does not add data-changing voice actions.

Evidence summary:

- V5-C2 was implemented for the mobile app only.
- V5-C2 adds safe route/control actions and safe workflow-start actions.
- V5-C2 keeps proposal review visible in the Voice Agent panel.
- V5-C2 adds safe guided check-in workflow start.
- V5-C2 does not add data-changing voice actions.
- Allowed route/control proposals: Open check-in, Open chat, Open exercise plan, Open appointments, Open safety, Open coping tools, Go back, Stop session, Stop reading, Voice help, and Guided check-in workflow start.
- Guided check-in workflow-start behavior: "start guided check-in" routes to `/(tabs)/checkin` with only `voiceGuided=1`.
- The `voiceGuided=1` flag expands/starts the guided check-in surface state only.
- The guided check-in route flag does not start microphone recognition.
- The guided check-in route flag does not submit answers.
- The guided check-in route flag does not autosave drafts.
- The guided check-in route flag does not call `createCheckin`.
- The guided check-in route flag does not pass clinical text through route params.
- Unknown or array route params are ignored safely.
- Safety/privacy boundaries: no mutation APIs, no care-data writes, no alert creation, no Safety Router bypass, no transcript persistence, no draft persistence, no raw-audio persistence, no Realtime tools or handlers, no live Realtime transcript command execution, and no mobile OpenAI key exposure.
- Intentionally not implemented: V5-D confirmed actions, voice check-in submission, chat sending, appointment booking/canceling, medication/hydration/nutrition logging, photo upload, emergency calling, diagnosis, treatment, dosage advice, and Realtime transcript/event command execution.
- V5-C2 still depends on local typed/reviewed deterministic proposal parsing.
- Live Realtime transcript integration remains intentionally postponed for a later scoped version.
- V5-C2 is prototype support, not clinical validation.
- V5-C2 is not production voice-agent validation.
- Confirmed data-changing voice actions remain future V5-D work.

Aura Voice Agent V5-D1 implemented confirmed voice check-in submit for the mobile Check-in screen only. It allows a patient to submit the current check-in hands-free only after review and explicit confirmation, using the same submit path as manual Submit check-in.

Evidence summary:

- V5-D1 was implemented as a mobile-only, Check-in-screen-owned confirmed voice submit flow.
- The patient can review the current check-in, hear or read a summary, listen for a conservative confirmation phrase, and submit through the existing check-in submit path.
- `VoiceGuidedCheckinPanel` can request or open the review flow, but it does not own API submission.
- V5-D1 added a compact "Voice submit review" panel on the final Review step.
- The panel supports reviewing the current draft, reading the summary aloud, listening for confirmation, manual Confirm submit, and canceling.
- Confirmed voice submit uses the same submit wrapper and path as manual Submit check-in.
- Memory-only states include `draftReady`, `needsRequiredFields`, `reviewSummary`, `awaitingVoiceConfirmation`, `confirmedSubmit`, `cancelled`, `submitting`, `submitted`, `highRiskRouted`, `offlineBlocked`, and `expired`.
- Accepted voice confirmations only: "yes submit", "confirm submit", and "submit check-in".
- Ambiguous phrases do nothing.
- Cancel phrases clear the state.
- Confirmation expires after about 30 seconds.
- Any draft change invalidates the prior summary.
- Voice-confirmed submit uses the same submit wrapper as manual submit.
- Voice-confirmed submit still goes through existing validation.
- Voice-confirmed submit preserves offline behavior.
- Voice-confirmed submit calls `createCheckin`.
- Voice-confirmed submit uses `POST /patient/checkins`.
- Voice-confirmed submit preserves Safety Router handling.
- Voice-confirmed submit preserves high-risk routing to `/safety`.
- No voice-only API was added.
- No direct alert creation was added.
- No Safety Router bypass was added.
- Safety/privacy boundaries: no Realtime transcript integration, no Realtime tools, no server-side tools, no backend changes, no transcript persistence, no raw audio persistence, no unconfirmed draft persistence, no OpenAI key exposure, no `EXPO_PUBLIC_OPENAI_API_KEY`, no emergency promise, no diagnosis, no treatment advice, no medication dosage advice, no chat sending, no appointment booking/canceling, no medication/hydration/nutrition logging, no photo upload, and no direct alert creation.
- Verification recorded: `npm test -- checkinScreen.test.tsx VoiceGuidedCheckinPanel.test.tsx voiceActionProposals.test.ts` passed.
- Verification recorded: `npm test` passed.
- Verification recorded: `npm run qa:web` passed.
- Verification recorded: `git diff --check` passed.
- Full mobile suite passed: 56 files / 401 tests.
- Voice confirmation is intentionally narrow and conservative.
- Patient must review the current summary first.
- Confirmation is time-limited.
- Changed drafts require a fresh review.
- On-device speech support depends on platform/runtime capability already used by the guided flow.
- V5-D1 is prototype support, not clinical validation.
- V5-D1 is not production voice-agent validation.

Aura Voice Agent V5-D2 implemented confirmed voice chat send for the mobile Chat screen only. It allows a patient to send the current chat draft hands-free only after exact message review and explicit confirmation, using the same send path as manual Send.

Evidence summary:

- V5-D2 was implemented as a Chat-screen-only confirmed voice send flow.
- The patient can review the exact trimmed draft, optionally hear the summary, listen for an explicit confirmation phrase, and send through the existing manual chat send path.
- Dictation still only fills the draft and never sends.
- V5-D2 added a "Voice send review" card in the existing Chat composer area.
- The card supports Review for voice send, Listen for confirmation, Confirm send, and Cancel.
- The patient must review the exact trimmed message before sending.
- The flow sends only after explicit confirmation.
- Memory-only states include `draftReady`, `needsMessage`, `reviewMessage`, `awaitingVoiceConfirmation`, `confirmedSend`, `cancelled`, `sending`, `sent`, `highRiskRouted`, `offlineBlocked`, and `expired`.
- Accepted confirmation phrases only: "yes send", "confirm send", and "send message".
- Ambiguous phrases do not send.
- Empty phrases do not send.
- Parser failure does not send.
- Recognition error does not send.
- Negative phrases do not send.
- Reviews expire after 30 seconds.
- Any raw draft change invalidates the review.
- Voice-confirmed send calls the same `handleSend()` path as manual Send.
- Voice-confirmed send validates that the reviewed draft is still current.
- Voice-confirmed send preserves trim/non-empty/read-only/offline validation.
- Voice-confirmed send preserves `sendChat`.
- Voice-confirmed send preserves assistant reply behavior.
- Voice-confirmed send preserves high-risk `/safety` navigation.
- No voice-only chat API was added.
- No direct alert creation was added.
- No Safety Router bypass was added.
- Safety/privacy boundaries: no backend routes, no backend API contract changes, no Realtime tool-calling, no OpenAI mobile keys, no `EXPO_PUBLIC_OPENAI_API_KEY`, no direct alert creation, no transcript persistence, no audio persistence, no unconfirmed draft persistence, `recordingOptions.persist=false` for confirmation speech recognition, no appointment booking/canceling, no medication/hydration/nutrition logging, no photo upload, no emergency calling, no diagnosis, no treatment advice, and no medication dosage advice.
- Verification recorded: `npm test -- chatTruth.test.tsx voiceChatSendConfirmation.test.ts VoiceAgentSessionPanel.test.tsx` passed: 3 files / 71 tests.
- Verification recorded: `npm test` passed: 57 files / 436 tests.
- Verification recorded: `npm run qa:web` passed.
- Verification recorded: Typecheck passed.
- Verification recorded: web guardrails passed with 0 issues.
- Verification recorded: a11y smoke passed with 0 issues.
- Verification recorded: `git diff --check` passed.
- Existing React test renderer / `act` warnings appeared but did not fail tests.
- Confirmation depends on on-device speech recognition accuracy.
- Explicit phrase gate and exact visible review are the safety controls.
- The 30-second expiry is intentionally short.
- Ambiguous phrases do not refresh expiry.
- V5-D2 is prototype support, not clinical validation.
- V5-D2 is not production voice-agent validation.

Aura Voice Agent V5-D3 implemented confirmed voice appointment request for the mobile Appointments screen only. It allows a patient to request a selected appointment slot hands-free only after exact request review and explicit confirmation, using the same request path as manual Request this time.

Evidence summary:

- V5-D3 was implemented as a narrow mobile-only Appointments screen feature.
- Patients can review a selected appointment request, then submit only after explicit voice or button confirmation.
- V5-D3 creates a pending appointment request, not a guaranteed appointment.
- Appointment canceling by voice was not added.
- The Appointments screen now shows a "Voice request review" panel in Find time mode.
- The panel blocks confirmation until a slot is selected.
- The panel builds a memory-only snapshot of the selected slot plus optional trimmed note.
- The panel shows the exact request summary.
- The flow submits only after "yes request", "confirm request", "request appointment", or pressing Confirm request.
- Memory-only states include `draftReady`, `needsSlot`, `needsReason`, `reviewRequest`, `awaitingVoiceConfirmation`, `confirmedRequest`, `cancelled`, `requesting`, `requested`, `offlineBlocked`, `expired`, and `unavailableSlot`.
- Reviews expire after 30 seconds.
- Slot changes invalidate the snapshot.
- Note changes invalidate the snapshot.
- Ambiguous, error, nomatch, cancel, and negative phrases do not request.
- Voice-confirmed appointment requests reuse the existing `handleRequestSlot(selectedSlot)` path.
- The existing `handleRequestSlot(selectedSlot)` path calls `createAppointmentRequest`.
- Voice-confirmed appointment requests use the existing `POST /patient/appointments/requests` API.
- No voice-only appointment API was added.
- No backend route was added.
- No validation bypass was added.
- Successful response shows pending/request status, not direct booking.
- Existing unavailable-slot/server-conflict behavior is preserved.
- Safety/privacy boundaries: no transcript persistence, no raw audio persistence, no unconfirmed draft persistence, no OpenAI key exposure, no `EXPO_PUBLIC_OPENAI_API_KEY`, no alert creation, no Safety Router bypass, no chat send, no check-in submit, no medication/hydration/nutrition logging, no upload calls, no emergency calling, no diagnosis, no treatment advice, no appointment canceling by voice, no `/voice-agent` Realtime transcript/tool behavior, no backend changes, and no direct booking guarantee.
- Verification recorded: `npm test -- voiceAppointmentRequestConfirmation.test.ts appointmentsScreen.test.tsx` passed: 35 tests.
- Verification recorded: `npm test` passed: 59 files / 471 tests.
- Verification recorded: `npm run qa:web` passed.
- Verification recorded: TypeScript, web guardrails, and accessibility smoke passed.
- Verification recorded: `git diff --check` passed.
- Existing React test-renderer/act warnings appeared but did not fail the suite.
- Voice request requires an already selected visible slot.
- It creates a pending appointment request only.
- Approval remains clinician-controlled.
- If availability changes, the existing request path surfaces the failure.
- V5-D3 is prototype support, not clinical validation.
- V5-D3 is not production voice-agent validation.
- V5-D4 later voice health-log actions remain future work.

Evidence sources:

- `voice-agent-v5a-realtime-session-broker-2026-04-29.md`
- `voice-agent-v5b1-mobile-session-request-ui-2026-04-29.md`
- `voice-agent-v5b2-web-realtime-audio-2026-04-29.md`
- `voice-agent-v5c1-safe-action-proposals-2026-04-29.md`
- `voice-agent-v5c2-safe-workflow-starts-2026-04-29.md`
- `voice-agent-v5d1-confirmed-checkin-submit-2026-04-29.md`
- `voice-agent-v5d2-confirmed-chat-send-2026-04-29.md`
- `voice-agent-v5d3-confirmed-appointment-request-2026-04-29.md`

## 6. Static RAG Phase 1

Aura's Phase 1 static RAG path implemented `/rag/reply` retrieval from curated static rehabilitation knowledge for messages that have already been classified as low risk.

Evidence summary:

- `/rag/reply` retrieves curated static rehabilitation knowledge.
- Replies are bounded and non-diagnostic.
- Citations are returned when relevant content is found.
- Safe fallback is used when no relevant chunk is found.
- No external LLM API or external embedding API is required for this retrieval path.
- High-risk messages continue through the alert/escalation path and do not call RAG.

## 7. Patient Living Memory Phase 2A + 2B

Aura's patient living memory is implemented as MongoDB-backed, patient-scoped deterministic memory.

Evidence summary:

- Patient memory records are scoped by `patientId`.
- Memory uses short sanitized summaries only.
- Memory retrieval is used for low-risk chat only.
- High-risk chat bypasses memory retrieval, RAG generation, and memory writing.
- Retrieval is same-patient only.
- MongoDB remains canonical for patient memory.
- Memory extraction skips high-risk/crisis text, medication dosage details, contact details, secrets, third-party personal details, and likely identifiers.

## 8. PGVector Static Knowledge Phase 2C-A

Aura's static rehabilitation knowledge retrieval now has optional PGVector-backed persistence and retrieval.

Evidence summary:

- Optional PGVector-backed persistence/retrieval for curated static rehab knowledge is implemented.
- JSON static rehabilitation knowledge remains the source of truth.
- No patient data is stored in the static PGVector table.
- Direct retrieval smoke succeeded for a missed-exercise query and returned `static-rehab:missed_exercises@static-rehab-v1`.
- Deterministic hashing vectors are prototype retrieval vectors, not clinically validated semantic embeddings.
- PGVector static retrieval is fallback-safe when disabled, unavailable, empty, or erroring.

## 9. PGVector Patient-Memory Index Phase 2C-B

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

## 10. Final Latency Benchmark

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

## 11. Verification Status

Latest known verified results:

| Area | Result | Note |
| --- | --- | --- |
| Server full tests | 54 files passed, 353 tests passed | Latest known server verification after Voice Agent V5-A backend session broker. |
| Server focused PGVector/memory/chat/AI tests | 4 files passed, 41 tests passed | Includes vector service, memory service, chat flow, and AI client tests. |
| Server build | Passed | TypeScript build completed successfully. |
| AI tests | 50 passed | Normal AI tests. |
| Static PGVector regression tests | 12 passed | PGVector-enabled static retrieval regression. |
| Dashboard unit tests | 505 passed | Earlier verified evidence; rerun if dashboard code changes again. |
| Dashboard E2E tests | 19 passed | Earlier verified evidence; rerun if dashboard code changes again. |
| Mobile tests | 59 files passed, 471 tests passed | Latest known mobile verification after Voice Agent V5-D3. |

Latest V5-A focused server verification:

- `npm test -- env.security.test.ts` passed: 12 tests.
- `npm test -- openaiRealtimeService.test.ts` passed: 8 tests.
- `npm test -- patient.routes.test.ts` passed: 26 tests.
- `npm test` passed: 54 files / 353 tests.
- `npm run build` passed.
- `git diff --check` passed.
- Existing Mongoose duplicate schema index warning for `patientId` appeared but did not fail the run.

Latest V5-B1 mobile verification:

- `npm test` passed: 51 files / 314 tests.
- `npm run qa:web` passed.
- TypeScript passed.
- Web guardrails passed: `FAIL 0` / `WARN 0`.
- A11y smoke passed: `FAIL 0` / `WARN 0`.
- `expo-doctor` passed with the npm cache workaround.
- `expo-modules-autolinking verify -v` passed.
- `git diff --check` passed.
- Existing `react-test-renderer` deprecation warnings appeared but did not fail tests.

Latest V5-B2-Web mobile verification:

- `npm test` passed: 52 files / 324 tests.
- Existing `react-test-renderer` deprecation and `act` warnings appeared but exit code was 0.
- `npm run qa:web` passed.
- TypeScript passed.
- Web guardrails passed: `FAIL 0` / `WARN 0`.
- A11y smoke passed: `FAIL 0` / `WARN 0`.
- `git diff --check` passed.

Latest Mobile UI/UX Accessibility Fix Phase 1 verification:

- `npm test` passed: 55 files / 330 tests.
- `npm run qa:web` passed.
- TypeScript clean.
- Web guardrails passed: `FAIL 0` / `WARN 0`.
- A11y smoke passed: `FAIL 0` / `WARN 0`.
- `git diff --check` passed.
- Existing React test-renderer deprecation and `act` warnings remained but did not fail the suite.

Latest V5-C1 mobile verification:

- `npm test -- voiceActionProposals` passed.
- `npm test -- VoiceAgentSessionPanel.test.tsx` passed.
- `npm test -- voiceCommands` passed.
- `npm test -- todayScreen.test.tsx` passed.
- `npm test -- VoiceAgentSecurityGuard.test.ts` passed.
- `npm test` passed: 56 files / 377 tests.
- `npm run qa:web` passed.
- `git diff --check` passed.
- Existing React test-renderer / `act` warnings appeared but did not fail the suite.

Latest V5-C2 mobile verification:

- Targeted test command passed: 5 files / 94 tests.
- `npm test` passed: 56 files / 383 tests.
- `npm run qa:web` passed.
- TypeScript, web guardrails, and a11y smoke checks passed.
- `git diff --check` passed.
- Existing React test renderer / `act` warnings appeared but did not fail the suite.

Latest V5-D1 mobile verification:

- `npm test -- checkinScreen.test.tsx VoiceGuidedCheckinPanel.test.tsx voiceActionProposals.test.ts` passed.
- `npm test` passed.
- `npm run qa:web` passed.
- `git diff --check` passed.
- Full mobile suite passed: 56 files / 401 tests.

Latest V5-D2 mobile verification:

- `npm test -- chatTruth.test.tsx voiceChatSendConfirmation.test.ts VoiceAgentSessionPanel.test.tsx` passed: 3 files / 71 tests.
- `npm test` passed: 57 files / 436 tests.
- `npm run qa:web` passed.
- Typecheck passed.
- Web guardrails passed with 0 issues.
- A11y smoke passed with 0 issues.
- `git diff --check` passed.
- Existing React test renderer / `act` warnings appeared but did not fail tests.

Latest V5-D3 mobile verification:

- `npm test -- voiceAppointmentRequestConfirmation.test.ts appointmentsScreen.test.tsx` passed: 35 tests.
- `npm test` passed: 59 files / 471 tests.
- `npm run qa:web` passed.
- TypeScript, web guardrails, and accessibility smoke passed.
- `git diff --check` passed.
- Existing React test-renderer/act warnings appeared but did not fail the suite.

The dashboard count is included as a known verified result supplied for this final summary. The latest mobile count is recorded in the Voice Agent V5-D3 evidence. The latest server count is recorded in the Voice Agent V5-A evidence. These surfaces should be rerun if they change again before submission.

## 12. Limitations And Cautions

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
- Mobile UI/UX Accessibility Fix Phase 1 addressed scoped audit blockers only; Home/Demo Hub density, deeper voice UX explanation, full long-screen hierarchy cleanup, keyboard-overlap manual device QA, and broader caregiver/patient flow separation polish remain.
- No real device/emulator visual QA pass was run for Mobile UI/UX Accessibility Fix Phase 1.
- Voice Assist V3 is navigation-only and does not perform clinical actions by voice.
- Voice Assist V4-A is parser-only evidence; it has no guided panel, no voice-guided check-in UI, no clinical validation, no auto-submit, no alert creation, and no clinical action by voice.
- Voice Assist V4-B is guided panel prototype evidence, not a full autonomous voice agent, not clinical validation, and still requires manual native QA.
- Voice Agent V5-A is a backend-only session broker, not a full voice agent.
- Voice Agent V5-A has no mobile Realtime UI, no actual voice conversation, no tool/action proposal layer, and no clinical actions by voice.
- Voice Agent V5-A verification made no live OpenAI call and spent no API credits.
- Voice Agent V5-A safety boundaries rely on no tools and no backend mutations; prompt instructions are guidance, not clinical safety control by themselves.
- Voice Agent V5-A is not clinical validation and not production voice-agent validation.
- Voice Agent V5-B1 is session preparation UI only.
- Voice Agent V5-B1 has no actual Realtime audio yet.
- Voice Agent V5-B1 has no live conversation yet.
- Voice Agent V5-B1 has no WebRTC yet.
- Voice Agent V5-B1 has no tool/action proposal layer yet.
- Voice Agent V5-B1 has no confirmed actions yet.
- Voice Agent V5-B2 must separately plan native Realtime audio/WebRTC and development-build QA.
- Voice Agent V5-B1 is not clinical validation and not production voice-agent validation.
- Voice Agent V5-B2-Web is a browser-only live Realtime audio demo, not clinical validation and not production voice-agent validation.
- Voice Agent V5-B2-Web manual live browser QA is still required.
- Voice Agent V5-B2-Web live browser testing has real OpenAI API cost and privacy exposure.
- Voice Agent V5-B2-Web browser WebRTC/microphone support varies.
- Voice Agent V5-B2-Web remote audio playback can depend on browser autoplay policies.
- Voice Agent V5-B2-Web native live audio remains future development-build work.
- Voice Agent V5-B2-Web has no clinical actions by voice yet and no tool/action proposal layer yet.
- Voice Agent V5-C1 reviews typed/local intent in the Voice Agent panel.
- Voice Agent V5-C1 live Realtime transcript text is not yet wired into the proposal parser as an executable command source.
- Voice Agent V5-C1 is prototype support, not clinical validation.
- Voice Agent V5-C1 is not production voice-agent validation.
- Voice Agent V5-C1 confirmed data-changing voice actions remain future V5-D work.
- Voice Agent V5-C2 still depends on local typed/reviewed deterministic proposal parsing.
- Voice Agent V5-C2 live Realtime transcript integration remains intentionally postponed for a later scoped version.
- Voice Agent V5-C2 is prototype support, not clinical validation.
- Voice Agent V5-C2 is not production voice-agent validation.
- Voice Agent V5-D1 voice confirmation is intentionally narrow and conservative.
- Voice Agent V5-D1 requires the patient to review the current summary first.
- Voice Agent V5-D1 confirmation is time-limited.
- Voice Agent V5-D1 changed drafts require a fresh review.
- Voice Agent V5-D1 on-device speech support depends on platform/runtime capability already used by the guided flow.
- Voice Agent V5-D1 is prototype support, not clinical validation.
- Voice Agent V5-D1 is not production voice-agent validation.
- Voice Agent V5-D2 confirmation depends on on-device speech recognition accuracy.
- Voice Agent V5-D2 explicit phrase gate and exact visible review are the safety controls.
- Voice Agent V5-D2 30-second expiry is intentionally short.
- Voice Agent V5-D2 ambiguous phrases do not refresh expiry.
- Voice Agent V5-D2 is prototype support, not clinical validation.
- Voice Agent V5-D2 is not production voice-agent validation.
- Voice Agent V5-D3 voice request requires an already selected visible slot.
- Voice Agent V5-D3 creates a pending appointment request only.
- Voice Agent V5-D3 approval remains clinician-controlled.
- Voice Agent V5-D3 surfaces availability changes through the existing request path.
- Voice Agent V5-D3 is prototype support, not clinical validation.
- Voice Agent V5-D3 is not production voice-agent validation.
- Voice Agent V5-D4 later voice health-log actions remain future work.

## 13. Safe Report Wording

### A. Testing And Evaluation

Aura was evaluated using functional tests, synthetic Safety Router examples, and local synthetic latency benchmarks. The deterministic Safety Router achieved 1.0000 precision, recall, F1, and reason-code agreement on 144 author-labelled synthetic examples. Server, AI, dashboard, and mobile tests were used to verify implementation behavior. A final local benchmark with PGVector retrieval paths enabled measured 64.85 ms p95 low-risk chat latency and 50.72 ms p95 alert visibility time across 15 measured requests.

### B. Limitations And Future Work

These results are prototype evidence only. The Safety Router evaluation used author-labelled synthetic examples rather than clinician-reviewed or real patient data. PGVector retrieval uses deterministic hashing vectors and should not be interpreted as clinically validated semantic retrieval. Further work should include clinician review, real-world usability testing, larger-scale performance testing, and formal clinical safety evaluation.

### C. Viva/Demo Explanation

Aura keeps high-risk rehabilitation messages on a deterministic escalation path, while low-risk support can use static rehabilitation retrieval and patient-scoped living memory, with MongoDB as canonical storage and PGVector used only as an optional sanitized retrieval index.

## 14. Final Abstract-Ready Facts

Facts that are safe to use later when writing an abstract, with the surrounding limitation that clinical validation remains future work:

- 144-example author-labelled synthetic Safety Router evaluation.
- 1.0000 precision, recall, F1, and reason-code agreement.
- Static rehabilitation retrieval and patient-scoped living memory implemented.
- MongoDB canonical memory with optional PGVector indexing for sanitized retrieval.
- 353 server tests across 54 files, 471 mobile tests across 59 files, 505 dashboard unit tests, 19 dashboard E2E tests, and 50 AI tests passed.
- Mobile Voice Assist V1 reviewed dictation, V2 read-aloud, V3 navigation-only voice commands, V4-A deterministic guided check-in parsers, and V4-B guided check-in panel implemented, with manual native QA for speech-based UI and clinical validation still future work.
- Mobile UI/UX Accessibility Fix Phase 1 completed for scoped accessibility and task-completion blockers from the read-only UI/UX audit, with broader UI/UX polish and real device/emulator visual QA still future work.
- Backend-only Voice Agent V5-A Realtime session broker implemented with patient-authenticated, feature-flagged short-lived client-secret creation; no mobile UI or clinical voice actions yet.
- Voice Agent V5-B1 mobile session request UI implemented with prepared-session status and expiry; no live audio, WebRTC, tools, or clinical voice actions yet.
- Voice Agent V5-B2-Web browser-only live Realtime WebRTC audio demo implemented on `/voice-agent`; native live audio, tools, and clinical voice actions remain future work.
- Voice Agent V5-C1 deterministic safe action proposals implemented on mobile with local whitelist parsing, visible review UI, memory-only drafts, and no mutation APIs or Realtime tool-calling.
- Voice Agent V5-C2 safe route/control actions and safe workflow-start actions implemented on mobile with visible proposal review, guided check-in workflow start, and no data-changing voice actions.
- Voice Agent V5-D1 confirmed voice check-in submit implemented on mobile with Check-in-screen-owned review, conservative explicit confirmation, the existing submit path, and no voice-only API, direct alert creation, or Safety Router bypass.
- Voice Agent V5-D2 confirmed voice chat send implemented on mobile with Chat-screen-owned exact message review, accepted phrases "yes send", "confirm send", and "send message", the existing manual chat send path, and no voice-only API, direct alert creation, or Safety Router bypass.
- Voice Agent V5-D3 confirmed voice appointment request implemented on mobile with Appointments-screen-owned selected-slot review, accepted phrases "yes request", "confirm request", and "request appointment", the existing appointment request path, pending clinician approval semantics, and no voice-only API, backend changes, appointment canceling by voice, or direct booking guarantee.
- Final latency benchmark: 64.85 ms p95 low-risk chat, 50.72 ms p95 alert visibility.
- Clinical validation remains future work.

## 15. Cleanup / Demo Note

Benchmarks write synthetic local chat, alert, and notification job records.

Cleanup command:

```bash
cd "/Users/University/Final Project/aura/server"
npm run seed:reset
```
