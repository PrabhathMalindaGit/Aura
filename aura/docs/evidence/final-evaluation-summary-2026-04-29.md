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
| Dashboard UI/UX Phase 1 | Clinician dashboard accessibility/demo-readiness Phase 1 fixes completed, including V2 shell alignment, collapsed nav accessible names, safe skip links, dark-mode primary button contrast, and symptom photo review in patient history. | `dashboard-uiux-phase1-clinician-accessibility-2026-04-29.md` |
| Dashboard UI/UX Phase 2A | Clinician dashboard Phase 2A accessibility semantics fixes completed, including alert queue roving focus/keyboard scanning, appointment request row native selectable semantics, and visible Selected indicator for worklist/triage rows. | `dashboard-uiux-phase2a-clinician-accessibility-2026-04-29.md` |
| Voice Agent V5-A | Backend-only OpenAI Realtime session broker implemented for authenticated patient users; no mobile UI or clinical voice actions. | `voice-agent-v5a-realtime-session-broker-2026-04-29.md` |
| Voice Agent V5-B1 | Mobile-only Voice Agent session request prototype implemented; no live audio, WebRTC, tools, or clinical actions. | `voice-agent-v5b1-mobile-session-request-ui-2026-04-29.md` |
| Voice Agent V5-B2-Web | Browser-only live Realtime WebRTC audio demo implemented on `/voice-agent`; native live audio, tools, and clinical voice actions remain out of scope. | `voice-agent-v5b2-web-realtime-audio-2026-04-29.md` |
| Voice Agent V5-C1 | Mobile-only deterministic safe action proposal layer implemented with local whitelist parsing, visible review UI, and no data-changing voice execution. | `voice-agent-v5c1-safe-action-proposals-2026-04-29.md` |
| Voice Agent V5-C2 | Mobile-only safe route/control actions and safe workflow-start actions implemented with visible proposal review and no data-changing voice execution. | `voice-agent-v5c2-safe-workflow-starts-2026-04-29.md` |
| Voice Agent V5-D1 | Mobile-only Check-in-screen-owned confirmed voice check-in submit implemented with explicit review, conservative confirmation, and the existing submit path. | `voice-agent-v5d1-confirmed-checkin-submit-2026-04-29.md` |
| Voice Agent V5-D2 | Mobile-only Chat-screen-owned confirmed voice chat send implemented with exact message review, explicit confirmation, and the existing manual chat send path. | `voice-agent-v5d2-confirmed-chat-send-2026-04-29.md` |
| Voice Agent V5-D3 | Mobile-only Appointments-screen confirmed voice appointment request implemented with selected-slot review, explicit confirmation, existing appointment request path, and pending clinician approval semantics. | `voice-agent-v5d3-confirmed-appointment-request-2026-04-29.md` |
| Voice Agent V5-D4A | Mobile-only Hydration-screen confirmed voice hydration logging implemented for reviewed quick-add amounts 250 ml, 500 ml, and 750 ml, using the existing hydration quick-add path and preserving offline queue behavior. | `voice-agent-v5d4a-confirmed-hydration-log-2026-04-29.md` |
| Voice Agent V5-D4B | Mobile-only Nutrition-screen confirmed voice nutrition logging implemented with exact current-form review, explicit confirmation, existing nutrition save path, and preserved offline queue behavior. | `voice-agent-v5d4b-confirmed-nutrition-log-2026-04-29.md` |
| Voice Agent V5-D4C | Mobile-only Medications-screen confirmed voice medication status logging implemented for visible scheduled doses with taken/skipped only, exact review, explicit confirmation, existing medication dose action path, and preserved offline sync behavior. | `voice-agent-v5d4c-confirmed-medication-status-log-2026-04-29.md` |
| Voice Agent V5-D automated QA guardrails | Cross-flow automated QA guardrails implemented for the completed V5-D confirmed-action series, covering review-first behavior, explicit confirmation, ambiguous/cancel handling, expiry, same-path mutation behavior, forbidden side-effect source guards, accessibility checks, and `/voice-agent` boundary protection. | `voice-agent-v5d-automated-qa-guardrails-2026-04-29.md` |
| Clinician dashboard | Dashboard behavior is covered by existing dashboard unit, E2E, build, and accessibility smoke verification; dashboard counts are listed under verification status. | `dashboard-uiux-phase1-clinician-accessibility-2026-04-29.md`; `dashboard-uiux-phase2a-clinician-accessibility-2026-04-29.md` |
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

Aura mobile now has V1 reviewed dictation, V2 read-aloud, V3 navigation-only voice commands, V4-A deterministic guided check-in parsers, V4-B guided check-in panel UI evidence, V5-C1 deterministic safe action proposal evidence, V5-C2 safe workflow-start evidence, V5-D1 confirmed voice check-in submit evidence, V5-D2 confirmed voice chat send evidence, V5-D3 confirmed voice appointment request evidence, V5-D4A confirmed voice hydration log evidence, V5-D4B confirmed voice nutrition log evidence, V5-D4C confirmed voice medication status log evidence, V5-D automated QA guardrail evidence, and Mobile UI/UX Accessibility Fix Phase 1 evidence. Voice features remain bounded to prototype support and not clinical validation.

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
- V5-D4A was implemented as a narrow mobile-only hydration feature.
- The Hydration screen now supports confirmed voice hydration logging for reviewed quick-add amounts only: 250 ml, 500 ml, and 750 ml.
- V5-D4A does not add nutrition or medication voice logging.
- A "Voice log review" panel was added near hydration quick-add.
- The patient reviews an exact summary such as: "Hydration log: Add 250 ml for today."
- The patient can press Confirm log or use on-device speech confirmation.
- V5-D4A accepted voice confirmations are exactly "yes log", "confirm log", and "log this".
- V5-D4A cancel phrases clear state and do not log.
- V5-D4A ambiguous phrases do not log.
- V5-D4A speech errors do not log.
- V5-D4A nomatch does not log.
- V5-D4A expired reviews do not log.
- V5-D4A reviews expire after about 30 seconds.
- V5-D4A changing the reviewed amount invalidates the prior snapshot.
- V5-D4A log path safety: confirmed voice hydration uses the same existing quick-add path as manual hydration logging: `handleQuickAdd`, `submitQueueableWrite`, `sendHydrationSync`, and `POST /patient/hydration/log`.
- V5-D4A added no voice-only hydration API.
- Existing offline queue behavior is preserved.
- Existing validation remains authoritative.
- V5-D4A safety/privacy boundaries: no transcript persistence, no raw audio persistence, no unconfirmed draft persistence, no OpenAI key exposure, no `EXPO_PUBLIC_OPENAI_API_KEY`, no alert creation, no Safety Router bypass, no chat send, no check-in submit, no appointment request, no upload action, no nutrition logging, no medication logging, no Realtime transcript integration, no `/voice-agent` behavior changes, no backend changes, no server-side tools, no diagnosis, no treatment advice, no emergency support, and no medication advice.
- Latest mobile verification after Voice Agent V5-D4A: `npm test -- voiceHealthLogConfirmation.test.ts hydrationScreen.test.tsx` passed 2 files / 38 tests; `npm test` passed 61 files / 509 tests; `npm run qa:web` passed; `git diff --check` passed; existing `react-test-renderer` deprecation warnings appeared but did not fail the suite.
- V5-D4B was implemented as a mobile-only Nutrition screen feature.
- The patient reviews an exact summary of the current Nutrition form.
- The patient must explicitly confirm before the normal nutrition save path runs.
- V5-D4B does not add medication logging, hydration logging, diet advice, diagnosis, treatment advice, or backend changes.
- A "Voice nutrition review" panel was added near the existing save/log controls.
- The V5-D4B panel builds a memory-only snapshot from the current Nutrition form.
- The V5-D4B summary includes protein, fruit/veg servings, anti-inflammatory focus, meal regularity, appetite, and notes.
- The patient can press Confirm log or use on-device speech confirmation.
- V5-D4B confirmation states include `draftReady`, `needsValue`, `reviewLog`, `awaitingVoiceConfirmation`, `confirmedLog`, `cancelled`, `logging`, `logged`, `offlineBlocked`, `validationBlocked`, and `expired`.
- V5-D4B accepted voice confirmations are only "yes log", "confirm log", and "log this".
- V5-D4B ambiguous phrases do not log.
- V5-D4B speech errors do not log.
- V5-D4B nomatch does not log.
- V5-D4B cancel phrases do not log.
- V5-D4B expired reviews do not log.
- V5-D4B field changes invalidate the prior snapshot.
- V5-D4B log path safety: confirmed voice nutrition logging uses the same local nutrition save helper as manual Save today's log.
- The existing V5-D4B nutrition path still builds `NutritionLogPayload`, adds `clientMutationId`, calls `submitQueueableWrite`, uses `sendNutritionSync`, and preserves offline queue behavior.
- V5-D4B added no voice-only nutrition API.
- Existing validation remains authoritative.
- V5-D4B safety/privacy boundaries: no backend routes, no backend API contract changes, no Realtime tool-calling, no OpenAI key exposure, no `EXPO_PUBLIC_OPENAI_API_KEY`, no transcript persistence, no raw audio persistence, no unconfirmed draft persistence, no direct alert creation, no Safety Router bypass, no medication logging, no hydration log from nutrition voice flow, no chat send, no check-in submit, no appointment request, no upload action, no diagnosis, no treatment advice, no diet advice, no medication advice, and no emergency calling.
- Latest mobile verification after Voice Agent V5-D4B: `npm test -- voiceHealthLogConfirmation.test.ts nutritionScreen.test.tsx` passed 45 tests; `npm test` passed 62 files / 541 tests; `npm run qa:web` passed; TypeScript passed; web guardrails passed with 0 failures / 0 warnings; accessibility smoke passed with 0 failures / 0 warnings; `git diff --check` passed; existing `react-test-renderer` deprecation and `act` warnings appeared but did not fail the suite.
- V5-D4C was implemented in the mobile Medications screen.
- Patients can review an existing scheduled dose, choose taken or skipped, then explicitly confirm before logging.
- V5-D4C supports medication status logging only.
- V5-D4C does not add dosage advice, schedule changes, new medication creation, name editing, free-form medication interpretation, or missed status.
- V5-D4C added per-dose Review taken and Review skipped actions.
- V5-D4C added a screen-owned "Voice medication review" panel.
- The V5-D4C panel includes exact summary text, read-aloud support, Listen for log confirmation, Confirm log, and Cancel.
- V5-D4C review is available only from visible scheduled doses on today's Medications checklist.
- V5-D4C supported statuses are taken and skipped.
- V5-D4C confirmation states include `draftReady`, `needsDose`, `needsStatus`, `reviewLog`, `awaitingVoiceConfirmation`, `confirmedLog`, `cancelled`, `logging`, `logged`, `offlineBlocked`, `validationBlocked`, and `expired`.
- V5-D4C accepted voice confirmations are only "yes log", "confirm log", and "log this".
- V5-D4C ambiguous phrases do not log.
- V5-D4C speech errors do not log.
- V5-D4C nomatch does not log.
- V5-D4C cancel phrases do not log.
- V5-D4C expired reviews do not log.
- V5-D4C confirmation expires after about 30 seconds.
- V5-D4C note, dose, or status changes invalidate the prior snapshot.
- V5-D4C log path safety: confirmed voice medication status logging calls the same local `handleDoseAction` path used by manual dose buttons.
- The existing V5-D4C medication path still uses `submitQueueableWrite`, `sendMedicationSync`, and existing medication sync behavior.
- V5-D4C added no voice-only medication API.
- V5-D4C made no backend/API contract changes.
- Existing validation remains authoritative.
- V5-D4C safety/privacy boundaries: no backend/API contract changes, no voice-only API, no Realtime tool calling, no transcript persistence, no raw audio persistence, no unconfirmed draft persistence, no OpenAI key exposure, no `EXPO_PUBLIC_OPENAI_API_KEY`, no dosage advice, no schedule changes, no medication name editing, no new medication creation, no free-form medication interpretation, no missed voice status, no direct alert creation, no Safety Router bypass, no chat send, no check-in submit, no appointment request, no upload action, no hydration log, no nutrition log, no diagnosis, no treatment advice, and no emergency calling.
- Latest mobile verification after Voice Agent V5-D automated QA guardrails: targeted required test command passed 10 files / 336 tests; `npm test` passed 64 files / 698 tests; `npm run qa:web` passed; TypeScript passed; web guardrails passed with `FAIL 0` / `WARN 0`; a11y smoke passed with `FAIL 0` / `WARN 0`; `git diff --check` passed; existing `react-test-renderer` deprecation and `act` warnings appeared but did not fail the suite.
- V5-D automated QA guardrail pass was implemented as a narrow test/safety hardening change across the completed confirmed-action series.
- The V5-D automated QA guardrails cover V5-D1 confirmed check-in submit, V5-D2 confirmed chat send, V5-D3 confirmed appointment request, V5-D4A confirmed hydration log, V5-D4B confirmed nutrition log, and V5-D4C confirmed medication status log.
- The V5-D automated QA guardrails strengthen coverage for review-first behavior, explicit-confirmation-only behavior, no ambiguous mutation, cancel clears state, expiry behavior, offline/validation preservation, and unrelated mutation prevention.
- A tiny production safety-hardening adjustment made cancellation phrases consistently conservative across all confirmed-action parsers, including "never mind", "go back", and cross-flow "do not ..." phrases.
- Confirmation phrases remain narrow.
- Phrase, expiry, and invalidation evidence: shared parser guardrails were added for exact accepted phrase sets; generic ambiguous phrases are blocked across confirmed actions; screen-level ambiguous/cancel matrices were expanded; existing expiry and snapshot invalidation tests remain covered across flows; cancellation phrase handling is more conservative across all confirmed-action parsers.
- Same-path mutation evidence: check-in, chat, appointment, hydration, nutrition, and medication status flows retain same-path behavior; hydration delegation through `sendHydrationSync` is covered; nutrition delegation through `sendNutritionSync` is covered; existing screen tests cover check-in, chat, appointments, and medication dose action paths.
- Source-guard evidence: `VoiceAgentSecurityGuard` now scans V5-D screens, confirmation utilities, `/voice-agent`, and Realtime files.
- Source guards cover forbidden APIs, cross-flow mutations, Realtime tools, `tool_choice`/function calls, persistence shortcuts, OpenAI key exposure, direct alerts, and Voice Agent confirmed-action execution.
- Accessibility evidence: existing and expanded screen tests verify review controls, confirmation controls, cancel controls, disabled state, live status, summaries, and readable safety/status text for V5-D panels.
- Remaining mobile UI/UX limitations: Home/Demo Hub density, deeper voice UX explanation, full long-screen hierarchy cleanup, keyboard-overlap manual device QA, broader caregiver/patient flow separation polish, and no real device/emulator visual QA pass was run.
- Manual QA is not applicable yet for V4-A because no UI was added.
- Manual native QA is still required because V1/V3 use `expo-speech-recognition`, and V4-B guided check-in also uses speech recognition.
- Manual live browser QA is still required for V5-B2-Web.
- Manual VoiceOver/TalkBack spot checks on a real device are still useful for V5-D review panels, especially spoken order, tactile flow, and review panel behavior.
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
- `voice-agent-v5d4a-confirmed-hydration-log-2026-04-29.md`
- `voice-agent-v5d4b-confirmed-nutrition-log-2026-04-29.md`
- `voice-agent-v5d4c-confirmed-medication-status-log-2026-04-29.md`
- `voice-agent-v5d-automated-qa-guardrails-2026-04-29.md`

## 5. Voice Agent V5-A Through V5-D Automated QA Guardrails Evidence

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

Aura Voice Agent V5-D4A implemented confirmed voice hydration logging for the mobile Hydration screen only. It allows a patient to log one reviewed hydration quick-add amount hands-free only after exact log review and explicit confirmation, using the same quick-add path as manual hydration logging.

Evidence summary:

- V5-D4A was implemented as a narrow mobile-only hydration feature.
- The Hydration screen now supports confirmed voice hydration logging for reviewed quick-add amounts only: 250 ml, 500 ml, and 750 ml.
- V5-D4A does not add nutrition or medication voice logging.
- A "Voice log review" panel was added near hydration quick-add.
- The patient reviews an exact summary such as: "Hydration log: Add 250 ml for today."
- The patient can press Confirm log or use on-device speech confirmation.
- Accepted voice confirmations exactly: "yes log", "confirm log", and "log this".
- Cancel phrases clear state and do not log.
- Ambiguous phrases do not log.
- Speech errors do not log.
- Nomatch does not log.
- Expired reviews do not log.
- Review expires after about 30 seconds.
- Changing the reviewed amount invalidates the prior snapshot.
- Confirmed voice hydration uses the same existing quick-add path as manual hydration logging.
- Existing path includes `handleQuickAdd`, `submitQueueableWrite`, `sendHydrationSync`, and `POST /patient/hydration/log`.
- No voice-only hydration API was added.
- Existing offline queue behavior is preserved.
- Existing validation remains authoritative.
- Safety/privacy boundaries: no transcript persistence, no raw audio persistence, no unconfirmed draft persistence, no OpenAI key exposure, no `EXPO_PUBLIC_OPENAI_API_KEY`, no alert creation, no Safety Router bypass, no chat send, no check-in submit, no appointment request, no upload action, no nutrition logging, no medication logging, no Realtime transcript integration, no `/voice-agent` behavior changes, no backend changes, no server-side tools, no diagnosis, no treatment advice, no emergency support, and no medication advice.
- Verification recorded: `npm test -- voiceHealthLogConfirmation.test.ts hydrationScreen.test.tsx` passed: 2 files / 38 tests.
- Verification recorded: `npm test` passed: 61 files / 509 tests.
- Verification recorded: `npm run qa:web` passed.
- Verification recorded: `git diff --check` passed.
- Existing `react-test-renderer` deprecation warnings appeared but did not fail the suite.
- V5-D4A only supports pre-reviewed quick-add amounts: 250 ml, 500 ml, and 750 ml.
- Speech confirmation depends on on-device speech recognition availability.
- Manual Confirm log remains available after review.
- V5-D4A is prototype support, not clinical validation.
- V5-D4A is not production voice-agent validation.

Aura Voice Agent V5-D4B implemented confirmed voice nutrition logging for the mobile Nutrition screen only. It allows a patient to log the current Nutrition form hands-free only after exact current-form review and explicit confirmation, using the same nutrition save path as manual Save today's log.

Evidence summary:

- V5-D4B was implemented as a mobile-only Nutrition screen feature.
- The patient reviews an exact summary of the current Nutrition form.
- The patient must explicitly confirm before the normal nutrition save path runs.
- V5-D4B does not add medication logging, hydration logging, diet advice, diagnosis, treatment advice, or backend changes.
- A "Voice nutrition review" panel was added near the existing save/log controls.
- The panel builds a memory-only snapshot from the current Nutrition form.
- The summary includes protein, fruit/veg servings, anti-inflammatory focus, meal regularity, appetite, and notes.
- The patient can press Confirm log or use on-device speech confirmation.
- Memory-only states include `draftReady`, `needsValue`, `reviewLog`, `awaitingVoiceConfirmation`, `confirmedLog`, `cancelled`, `logging`, `logged`, `offlineBlocked`, `validationBlocked`, and `expired`.
- Accepted voice confirmations only: "yes log", "confirm log", and "log this".
- Ambiguous phrases do not log.
- Speech errors do not log.
- Nomatch does not log.
- Cancel phrases do not log.
- Expired reviews do not log.
- Field changes invalidate the prior snapshot.
- Confirmed voice nutrition logging uses the same local nutrition save helper as manual Save today's log.
- Existing path still builds `NutritionLogPayload`.
- Existing path still adds `clientMutationId`.
- Existing path still calls `submitQueueableWrite`.
- Existing path still uses `sendNutritionSync`.
- Existing path still preserves offline queue behavior.
- No voice-only nutrition API was added.
- Existing validation remains authoritative.
- Safety/privacy boundaries: no backend routes, no backend API contract changes, no Realtime tool-calling, no OpenAI key exposure, no `EXPO_PUBLIC_OPENAI_API_KEY`, no transcript persistence, no raw audio persistence, no unconfirmed draft persistence, no direct alert creation, no Safety Router bypass, no medication logging, no hydration log from nutrition voice flow, no chat send, no check-in submit, no appointment request, no upload action, no diagnosis, no treatment advice, no diet advice, no medication advice, and no emergency calling.
- Verification recorded: `npm test -- voiceHealthLogConfirmation.test.ts nutritionScreen.test.tsx` passed: 45 tests.
- Verification recorded: `npm test` passed: 62 files / 541 tests.
- Verification recorded: `npm run qa:web` passed.
- Verification recorded: TypeScript passed.
- Verification recorded: web guardrails passed with 0 failures / 0 warnings.
- Verification recorded: accessibility smoke passed with 0 failures / 0 warnings.
- Verification recorded: `git diff --check` passed.
- Existing `react-test-renderer` deprecation and `act` warnings appeared but did not fail the suite.
- V5-D4B uses the current Nutrition form state only.
- Speech confirmation depends on on-device speech recognition availability.
- Manual Confirm log remains available after review.
- V5-D4B is prototype support, not clinical validation.
- V5-D4B is not production voice-agent validation.

Aura Voice Agent V5-D4C implemented confirmed voice medication status logging for the mobile Medications screen only. It allows a patient to log taken or skipped for a visible scheduled dose hands-free only after exact existing-dose review and explicit confirmation, using the same medication dose action path as manual dose buttons.

Evidence summary:

- V5-D4C was implemented in the mobile Medications screen.
- Patients can review an existing scheduled dose, choose taken or skipped, then explicitly confirm before logging.
- V5-D4C supports medication status logging only.
- V5-D4C does not add dosage advice, schedule changes, new medication creation, name editing, free-form medication interpretation, or missed status.
- V5-D4C added per-dose Review taken and Review skipped actions.
- V5-D4C added a screen-owned "Voice medication review" panel.
- The panel includes exact summary text, read-aloud support, Listen for log confirmation, Confirm log, and Cancel.
- Review is available only from visible scheduled doses on today's Medications checklist.
- Supported statuses are taken and skipped.
- Memory-only states include `draftReady`, `needsDose`, `needsStatus`, `reviewLog`, `awaitingVoiceConfirmation`, `confirmedLog`, `cancelled`, `logging`, `logged`, `offlineBlocked`, `validationBlocked`, and `expired`.
- Accepted voice confirmations remain "yes log", "confirm log", and "log this".
- Ambiguous phrases do not log.
- Speech errors do not log.
- Nomatch does not log.
- Cancel phrases do not log.
- Expired reviews do not log.
- Confirmation expires after about 30 seconds.
- Note, dose, or status changes invalidate the prior snapshot.
- Confirmed voice medication status logging calls the same local `handleDoseAction` path used by manual dose buttons.
- The existing path still uses `submitQueueableWrite`.
- The existing path still uses `sendMedicationSync`.
- The existing path still uses existing medication sync behavior.
- No voice-only medication API was added.
- No backend/API contract changes were made.
- Existing validation remains authoritative.
- Safety/privacy boundaries: no backend/API contract changes, no voice-only API, no Realtime tool calling, no transcript persistence, no raw audio persistence, no unconfirmed draft persistence, no OpenAI key exposure, no `EXPO_PUBLIC_OPENAI_API_KEY`, no dosage advice, no schedule changes, no medication name editing, no new medication creation, no free-form medication interpretation, no missed voice status, no direct alert creation, no Safety Router bypass, no chat send, no check-in submit, no appointment request, no upload action, no hydration log, no nutrition log, no diagnosis, no treatment advice, and no emergency calling.
- Verification recorded: `npm test -- voiceHealthLogConfirmation.test.ts medicationsScreen.test.tsx` passed: 2 files / 54 tests.
- Verification recorded: `npm test` passed: 63 files / 582 tests.
- Verification recorded: `npm run qa:web` passed.
- Verification recorded: TypeScript, web guardrails, and a11y smoke passed.
- Verification recorded: `git diff --check` passed.
- The review is only available from visible scheduled doses on today's Medications checklist.
- Confirmation expires after about 30 seconds.
- Note, dose, and status changes invalidate the prior snapshot.
- Speech confirmation depends on on-device speech recognition availability.
- Manual Confirm log remains available after review.
- V5-D4C is prototype support, not clinical validation.
- V5-D4C is not production voice-agent validation.

Aura Voice Agent V5-D automated QA guardrails were implemented for the completed confirmed-action series as a narrow test/safety hardening change. The pass covers V5-D1 confirmed check-in submit, V5-D2 confirmed chat send, V5-D3 confirmed appointment request, V5-D4A confirmed hydration log, V5-D4B confirmed nutrition log, and V5-D4C confirmed medication status log.

Evidence summary:

- The pass strengthens cross-flow coverage for review-first behavior.
- The pass strengthens explicit-confirmation-only behavior.
- The pass verifies no ambiguous mutation.
- The pass verifies cancel clears state.
- The pass verifies expiry behavior.
- The pass verifies offline/validation preservation.
- The pass verifies unrelated mutation prevention.
- Shared parser guardrails were added for exact accepted phrase sets.
- Generic ambiguous phrases are blocked across confirmed actions.
- Screen-level ambiguous/cancel matrices were expanded.
- Existing expiry and snapshot invalidation tests remain covered across flows.
- Cancellation phrase handling is more conservative across all confirmed-action parsers, including "never mind", "go back", and cross-flow "do not ..." phrases.
- Confirmation phrases remain narrow.
- Check-in, chat, appointment, hydration, nutrition, and medication status flows retain same-path behavior.
- Hydration delegation through `sendHydrationSync` is covered.
- Nutrition delegation through `sendNutritionSync` is covered.
- Existing screen tests cover check-in, chat, appointments, and medication dose action paths.
- `VoiceAgentSecurityGuard` now scans V5-D screens, confirmation utilities, `/voice-agent`, and Realtime files.
- Source guards cover forbidden APIs, cross-flow mutations, Realtime tools, `tool_choice`/function calls, persistence shortcuts, OpenAI key exposure, direct alerts, and Voice Agent confirmed-action execution.
- Existing and expanded screen tests verify review controls, confirmation controls, cancel controls, disabled state, live status, summaries, and readable safety/status text for V5-D panels.
- Verification recorded: targeted required test command passed: 10 files / 336 tests.
- Verification recorded: `npm test` passed: 64 files / 698 tests.
- Verification recorded: `npm run qa:web` passed.
- Verification recorded: TypeScript passed.
- Verification recorded: web guardrails passed: `FAIL 0` / `WARN 0`.
- Verification recorded: a11y smoke passed: `FAIL 0` / `WARN 0`.
- Verification recorded: `git diff --check` passed.
- Existing `react-test-renderer` deprecation and `act` warnings appeared but did not fail the suite.
- Source guards are conservative regex checks, so future legitimate refactors may need test updates.
- This is automated QA evidence only, not clinical validation.
- This is not production voice-agent validation.
- Real microphone/speech-recognition behavior still requires manual/device QA.
- Manual VoiceOver/TalkBack spot checks on a real device are still useful.
- Manual QA should focus on spoken order, tactile flow, and review panels.

Evidence sources:

- `voice-agent-v5a-realtime-session-broker-2026-04-29.md`
- `voice-agent-v5b1-mobile-session-request-ui-2026-04-29.md`
- `voice-agent-v5b2-web-realtime-audio-2026-04-29.md`
- `voice-agent-v5c1-safe-action-proposals-2026-04-29.md`
- `voice-agent-v5c2-safe-workflow-starts-2026-04-29.md`
- `voice-agent-v5d1-confirmed-checkin-submit-2026-04-29.md`
- `voice-agent-v5d2-confirmed-chat-send-2026-04-29.md`
- `voice-agent-v5d3-confirmed-appointment-request-2026-04-29.md`
- `voice-agent-v5d4a-confirmed-hydration-log-2026-04-29.md`
- `voice-agent-v5d4b-confirmed-nutrition-log-2026-04-29.md`
- `voice-agent-v5d4c-confirmed-medication-status-log-2026-04-29.md`
- `voice-agent-v5d-automated-qa-guardrails-2026-04-29.md`

## 6. Clinician Dashboard UI/UX Evidence

Aura clinician dashboard Phase 1 accessibility and demo-readiness fixes were completed for scoped read-only dashboard audit findings.

Dashboard UI/UX Phase 1 evidence summary:

- V2 shell now defaults to the intended V2 experience.
- V2 route content and shell now use one consistent "V2 experience enabled" gate.
- Shell-wide and route-level rollback remain available.
- Collapsed/icon-only nav links now have accessible labels: Dashboard, Worklist, Patients, Alerts, Communication, Appointments, Insights, and Settings.
- Skip-to-main remains intact.
- Skip-to-context appears only when `dashboard-v2-context-rail` is rendered.
- Dark-mode primary buttons now use tokenized `--v2-on-primary` foreground for AA text contrast.
- Patient History includes compact "Recent symptom photos" review section.
- Clinicians can choose "View photo."
- UI uses existing direct URL fields when present.
- Otherwise, UI uses existing `fetchPhotoBlob(photo.id)`.
- If preview cannot load, the dashboard shows honest unavailable copy.
- No clinical interpretation is generated or claimed.

Verification recorded:

- `npm run typecheck` passed.
- `npm test` passed: 83 files / 511 tests.
- `npm run e2e -- --grep "dashboard v2|patient workspace v2|settings v2"` passed: 4 tests.
- `npm run e2e -- tests/e2e/a11y-smoke.spec.ts --project=mocked` passed: 1 test.
- `npm run build` passed.
- `git diff --check` passed.

Remaining dashboard UI/UX limitations after Phase 1:

- Inbox narrow mode remains future work.
- Settings demo-tool redesign remains future work.
- Photo viewing depends on existing photo URLs or existing photo file fetch path.
- Unavailable files produce honest fallback copy.
- Build still reports existing large chunk warning.
- Tests still emit React Router future-flag warnings.

Evidence source:

- `dashboard-uiux-phase1-clinician-accessibility-2026-04-29.md`

Aura clinician dashboard Phase 2A accessibility semantics fixes were completed as a narrow clinician workflow pass.

Dashboard UI/UX Phase 2A evidence summary:

- Dashboard UI/UX Phase 2A was implemented only.
- Scope covered alert queue roving focus / keyboard scanning.
- Scope covered appointment request row native selectable semantics.
- Scope covered visible selected indicator for worklist/triage rows.
- Alert queue now supports efficient keyboard scanning.
- Appointment request selection now uses a native summary button instead of clickable article behavior.
- Worklist/triage selected rows now include a visible `Selected` chip.

Alert queue behavior:

- ArrowRight and ArrowDown move focus forward.
- ArrowLeft and ArrowUp move focus backward.
- Home and End jump to first/last alert.
- Arrow movement only moves focus.
- Arrow movement does not select, acknowledge, resolve, assign, or mutate alerts.
- Enter, Space, and click preserve existing selection behavior.

Appointment row behavior:

- Each appointment request now has a native request summary button for selection.
- Open patient, Approve, and Reject remain independent controls.
- Nested controls do not accidentally trigger row selection.
- Pending/approved/rejected behavior is preserved.
- No direct booking guarantee was introduced.

Worklist selected-state behavior:

- Selected triage/worklist row now shows a compact visible `Selected` indicator.
- Existing `aria-pressed` behavior is preserved.
- Existing ArrowUp/ArrowDown behavior is preserved.

Accessibility improvements:

- Clearer keyboard navigation.
- Native button semantics.
- Selected-state announcement/visibility.
- Improved low-vision selected row clarity.
- No dashboard redesign was introduced.

Safety/product boundaries preserved:

- No backend/API/server/mobile/n8n/seed changes.
- No new clinical actions.
- No fake messaging.
- No booking claims.
- No alert workflow changes.
- No appointment workflow changes.
- No inbox narrow mode.
- No settings redesign.

Verification recorded:

- `npm test -- AlertsRoute.test.tsx AppointmentsRoute.test.tsx TriageQueueRoute.test.tsx` passed.
- `npm run e2e -- --grep "alerts v2|appointments v2|worklist v2"` passed.
- `npm run typecheck` passed.
- `npm test` passed: 83 files / 513 tests.
- `npm run e2e -- tests/e2e/a11y-smoke.spec.ts --project=mocked` passed.
- `npm run build` passed.
- `git diff --check` passed.

Remaining dashboard UI/UX limitations after Phase 2A:

- Inbox narrow mode / queue-thread focus parity remains future Phase 2B work.
- Settings demo/presentation tool separation remains future Phase 2B work.
- `npm run build` passed with the existing Vite large chunk warning.
- A11y smoke still covers the existing smoke target, not every Phase 2A route exhaustively.

Evidence source:

- `dashboard-uiux-phase2a-clinician-accessibility-2026-04-29.md`

## 7. Static RAG Phase 1

Aura's Phase 1 static RAG path implemented `/rag/reply` retrieval from curated static rehabilitation knowledge for messages that have already been classified as low risk.

Evidence summary:

- `/rag/reply` retrieves curated static rehabilitation knowledge.
- Replies are bounded and non-diagnostic.
- Citations are returned when relevant content is found.
- Safe fallback is used when no relevant chunk is found.
- No external LLM API or external embedding API is required for this retrieval path.
- High-risk messages continue through the alert/escalation path and do not call RAG.

## 8. Patient Living Memory Phase 2A + 2B

Aura's patient living memory is implemented as MongoDB-backed, patient-scoped deterministic memory.

Evidence summary:

- Patient memory records are scoped by `patientId`.
- Memory uses short sanitized summaries only.
- Memory retrieval is used for low-risk chat only.
- High-risk chat bypasses memory retrieval, RAG generation, and memory writing.
- Retrieval is same-patient only.
- MongoDB remains canonical for patient memory.
- Memory extraction skips high-risk/crisis text, medication dosage details, contact details, secrets, third-party personal details, and likely identifiers.

## 9. PGVector Static Knowledge Phase 2C-A

Aura's static rehabilitation knowledge retrieval now has optional PGVector-backed persistence and retrieval.

Evidence summary:

- Optional PGVector-backed persistence/retrieval for curated static rehab knowledge is implemented.
- JSON static rehabilitation knowledge remains the source of truth.
- No patient data is stored in the static PGVector table.
- Direct retrieval smoke succeeded for a missed-exercise query and returned `static-rehab:missed_exercises@static-rehab-v1`.
- Deterministic hashing vectors are prototype retrieval vectors, not clinically validated semantic embeddings.
- PGVector static retrieval is fallback-safe when disabled, unavailable, empty, or erroring.

## 10. PGVector Patient-Memory Index Phase 2C-B

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

## 11. Final Latency Benchmark

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

## 12. Verification Status

Latest known verified results:

| Area | Result | Note |
| --- | --- | --- |
| Server full tests | 54 files passed, 353 tests passed | Latest known server verification after Voice Agent V5-A backend session broker. |
| Server focused PGVector/memory/chat/AI tests | 4 files passed, 41 tests passed | Includes vector service, memory service, chat flow, and AI client tests. |
| Server build | Passed | TypeScript build completed successfully. |
| AI tests | 50 passed | Normal AI tests. |
| Static PGVector regression tests | 12 passed | PGVector-enabled static retrieval regression. |
| Dashboard unit tests | 83 files passed, 513 tests passed | Latest known dashboard verification after Dashboard UI/UX Phase 2A clinician accessibility semantics fixes. |
| Dashboard focused V2 E2E tests | 4 passed | `alerts v2`, `appointments v2`, and `worklist v2` mocked E2E slice. |
| Dashboard accessibility smoke E2E | 1 passed | Mocked a11y smoke spec. |
| Dashboard build | Passed | Production build completed, with existing large chunk warning still reported. |
| Mobile tests | 64 files passed, 698 tests passed | Latest known mobile verification after Voice Agent V5-D automated QA guardrails. |

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

Latest V5-D4A mobile verification:

- `npm test -- voiceHealthLogConfirmation.test.ts hydrationScreen.test.tsx` passed: 2 files / 38 tests.
- `npm test` passed: 61 files / 509 tests.
- `npm run qa:web` passed.
- `git diff --check` passed.
- Existing `react-test-renderer` deprecation warnings appeared but did not fail the suite.

Latest V5-D4B mobile verification:

- `npm test -- voiceHealthLogConfirmation.test.ts nutritionScreen.test.tsx` passed: 45 tests.
- `npm test` passed: 62 files / 541 tests.
- `npm run qa:web` passed.
- TypeScript passed.
- Web guardrails passed with 0 failures / 0 warnings.
- Accessibility smoke passed with 0 failures / 0 warnings.
- `git diff --check` passed.
- Existing `react-test-renderer` deprecation and `act` warnings appeared but did not fail the suite.

Latest V5-D4C mobile verification:

- `npm test -- voiceHealthLogConfirmation.test.ts medicationsScreen.test.tsx` passed: 2 files / 54 tests.
- `npm test` passed: 63 files / 582 tests.
- `npm run qa:web` passed.
- TypeScript, web guardrails, and a11y smoke passed.
- `git diff --check` passed.

Latest V5-D automated QA guardrail mobile verification:

- Targeted required test command passed: 10 files / 336 tests.
- `npm test` passed: 64 files / 698 tests.
- `npm run qa:web` passed.
- TypeScript passed.
- Web guardrails passed: `FAIL 0` / `WARN 0`.
- A11y smoke passed: `FAIL 0` / `WARN 0`.
- `git diff --check` passed.
- Existing `react-test-renderer` deprecation and `act` warnings appeared but did not fail the suite.

Latest Dashboard UI/UX Phase 2A verification:

- `npm run typecheck` passed.
- `npm test -- AlertsRoute.test.tsx AppointmentsRoute.test.tsx TriageQueueRoute.test.tsx` passed.
- `npm run e2e -- --grep "alerts v2|appointments v2|worklist v2"` passed.
- `npm test` passed: 83 files / 513 tests.
- `npm run e2e -- tests/e2e/a11y-smoke.spec.ts --project=mocked` passed: 1 test.
- `npm run build` passed.
- `git diff --check` passed.
- Build still reported the existing large chunk warning.
- Tests still emitted React Router future-flag warnings.

The latest dashboard count is recorded in the Dashboard UI/UX Phase 2A evidence. The latest mobile count is recorded in the Voice Agent V5-D automated QA guardrail evidence. The latest server count is recorded in the Voice Agent V5-A evidence. These surfaces should be rerun if they change again before submission.

## 13. Limitations And Cautions

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
- Dashboard UI/UX Phase 1 addressed scoped clinician accessibility/demo-readiness blockers only.
- Dashboard UI/UX Phase 2A addressed alert queue roving focus, appointment row semantics, and worklist/triage selected-state visibility only.
- Dashboard inbox narrow mode / queue-thread focus parity remains future Phase 2B work.
- Dashboard settings demo/presentation tool separation remains future Phase 2B work.
- Dashboard symptom photo viewing depends on existing photo URLs or the existing photo file fetch path.
- Dashboard unavailable photo files produce honest fallback copy.
- Dashboard build still reports the existing large chunk warning.
- Dashboard a11y smoke still covers the existing smoke target, not every Phase 2A route exhaustively.
- Dashboard tests still emit React Router future-flag warnings.
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
- Voice Agent V5-D4A only supports pre-reviewed hydration quick-add amounts: 250 ml, 500 ml, and 750 ml.
- Voice Agent V5-D4A speech confirmation depends on on-device speech recognition availability.
- Voice Agent V5-D4A manual Confirm log remains available after review.
- Voice Agent V5-D4A is prototype support, not clinical validation.
- Voice Agent V5-D4A is not production voice-agent validation.
- Voice Agent V5-D4B uses the current Nutrition form state only.
- Voice Agent V5-D4B speech confirmation depends on on-device speech recognition availability.
- Voice Agent V5-D4B manual Confirm log remains available after review.
- Voice Agent V5-D4B is prototype support, not clinical validation.
- Voice Agent V5-D4B is not production voice-agent validation.
- Voice Agent V5-D4C review is only available from visible scheduled doses on today's Medications checklist.
- Voice Agent V5-D4C confirmation expires after about 30 seconds.
- Voice Agent V5-D4C note, dose, and status changes invalidate the prior snapshot.
- Voice Agent V5-D4C speech confirmation depends on on-device speech recognition availability.
- Voice Agent V5-D4C manual Confirm log remains available after review.
- Voice Agent V5-D4C is prototype support, not clinical validation.
- Voice Agent V5-D4C is not production voice-agent validation.
- Voice Agent V5-D automated QA source guards are conservative regex checks, so future legitimate refactors may need test updates.
- Voice Agent V5-D automated QA evidence is automated QA evidence only, not clinical validation.
- Voice Agent V5-D automated QA evidence is not production voice-agent validation.
- Real microphone/speech-recognition behavior still requires manual/device QA.
- Manual VoiceOver/TalkBack spot checks on a real device are still useful.
- Manual QA should focus on spoken order, tactile flow, and review panels.

## 14. Safe Report Wording

### A. Testing And Evaluation

Aura was evaluated using functional tests, synthetic Safety Router examples, and local synthetic latency benchmarks. The deterministic Safety Router achieved 1.0000 precision, recall, F1, and reason-code agreement on 144 author-labelled synthetic examples. Server, AI, dashboard, and mobile tests were used to verify implementation behavior. A final local benchmark with PGVector retrieval paths enabled measured 64.85 ms p95 low-risk chat latency and 50.72 ms p95 alert visibility time across 15 measured requests.

### B. Limitations And Future Work

These results are prototype evidence only. The Safety Router evaluation used author-labelled synthetic examples rather than clinician-reviewed or real patient data. PGVector retrieval uses deterministic hashing vectors and should not be interpreted as clinically validated semantic retrieval. Further work should include clinician review, real-world usability testing, larger-scale performance testing, and formal clinical safety evaluation.

### C. Viva/Demo Explanation

Aura keeps high-risk rehabilitation messages on a deterministic escalation path, while low-risk support can use static rehabilitation retrieval and patient-scoped living memory, with MongoDB as canonical storage and PGVector used only as an optional sanitized retrieval index.

## 15. Final Abstract-Ready Facts

Facts that are safe to use later when writing an abstract, with the surrounding limitation that clinical validation remains future work:

- 144-example author-labelled synthetic Safety Router evaluation.
- 1.0000 precision, recall, F1, and reason-code agreement.
- Static rehabilitation retrieval and patient-scoped living memory implemented.
- MongoDB canonical memory with optional PGVector indexing for sanitized retrieval.
- 353 server tests across 54 files, 698 mobile tests across 64 files, 513 dashboard unit tests across 83 files, 4 dashboard focused V2 E2E tests, 1 dashboard a11y smoke E2E test, dashboard build, and 50 AI tests passed.
- Mobile Voice Assist V1 reviewed dictation, V2 read-aloud, V3 navigation-only voice commands, V4-A deterministic guided check-in parsers, and V4-B guided check-in panel implemented, with manual native QA for speech-based UI and clinical validation still future work.
- Mobile UI/UX Accessibility Fix Phase 1 completed for scoped accessibility and task-completion blockers from the read-only UI/UX audit, with broader UI/UX polish and real device/emulator visual QA still future work.
- Dashboard UI/UX Phase 1 completed for scoped clinician dashboard accessibility/demo-readiness blockers, including V2 shell alignment, collapsed nav accessible names, safe skip links, dark-mode primary button contrast, and symptom photo review in patient history, with broader dashboard UI/UX polish still future work.
- Dashboard UI/UX Phase 2A completed for clinician accessibility semantics, including alert queue roving focus, appointment request row native selectable semantics, and visible worklist/triage selected-state indicators.
- Backend-only Voice Agent V5-A Realtime session broker implemented with patient-authenticated, feature-flagged short-lived client-secret creation; no mobile UI or clinical voice actions yet.
- Voice Agent V5-B1 mobile session request UI implemented with prepared-session status and expiry; no live audio, WebRTC, tools, or clinical voice actions yet.
- Voice Agent V5-B2-Web browser-only live Realtime WebRTC audio demo implemented on `/voice-agent`; native live audio, tools, and clinical voice actions remain future work.
- Voice Agent V5-C1 deterministic safe action proposals implemented on mobile with local whitelist parsing, visible review UI, memory-only drafts, and no mutation APIs or Realtime tool-calling.
- Voice Agent V5-C2 safe route/control actions and safe workflow-start actions implemented on mobile with visible proposal review, guided check-in workflow start, and no data-changing voice actions.
- Voice Agent V5-D1 confirmed voice check-in submit implemented on mobile with Check-in-screen-owned review, conservative explicit confirmation, the existing submit path, and no voice-only API, direct alert creation, or Safety Router bypass.
- Voice Agent V5-D2 confirmed voice chat send implemented on mobile with Chat-screen-owned exact message review, accepted phrases "yes send", "confirm send", and "send message", the existing manual chat send path, and no voice-only API, direct alert creation, or Safety Router bypass.
- Voice Agent V5-D3 confirmed voice appointment request implemented on mobile with Appointments-screen-owned selected-slot review, accepted phrases "yes request", "confirm request", and "request appointment", the existing appointment request path, pending clinician approval semantics, and no voice-only API, backend changes, appointment canceling by voice, or direct booking guarantee.
- Voice Agent V5-D4A confirmed voice hydration logging implemented on mobile with Hydration-screen-owned exact log review, accepted phrases "yes log", "confirm log", and "log this", supported reviewed quick-add amounts 250 ml, 500 ml, and 750 ml, the existing hydration quick-add path, preserved offline queue behavior, and no voice-only API, nutrition logging, medication logging, backend changes, or `/voice-agent` behavior changes.
- Voice Agent V5-D4B confirmed voice nutrition logging implemented on mobile with Nutrition-screen-owned exact current-form review, accepted phrases "yes log", "confirm log", and "log this", the existing nutrition save path, preserved offline queue behavior, and no voice-only API, medication logging, hydration logging from the nutrition flow, backend changes, diagnosis, treatment advice, or diet advice.
- Voice Agent V5-D4C confirmed voice medication status logging implemented on mobile with Medications-screen-owned existing-dose review, accepted phrases "yes log", "confirm log", and "log this", taken/skipped status only, existing medication dose action path, and no voice-only API, dosage advice, schedule changes, new medication creation, backend changes, or free-form medication interpretation.
- Voice Agent V5-D automated QA guardrails implemented for the completed confirmed-action series, with cross-flow tests for review-first behavior, exact confirmation, ambiguous/cancel handling, expiry, same-path mutation behavior, forbidden side effects, accessibility, and `/voice-agent` boundary protection.
- Final latency benchmark: 64.85 ms p95 low-risk chat, 50.72 ms p95 alert visibility.
- Clinical validation remains future work.

## 16. Cleanup / Demo Note

Benchmarks write synthetic local chat, alert, and notification job records.

Cleanup command:

```bash
cd "/Users/University/Final Project/aura/server"
npm run seed:reset
```
