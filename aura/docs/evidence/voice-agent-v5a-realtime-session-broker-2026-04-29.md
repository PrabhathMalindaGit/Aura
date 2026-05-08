# Voice Agent V5-A Realtime Session Broker Evidence

Date: 2026-04-29

## Summary

Aura Voice Agent V5-A implemented a backend-only OpenAI Realtime session broker for authenticated patient users.

The broker adds `POST /patient/voice/session`. The route is feature-flagged off by default and returns only a short-lived OpenAI Realtime client secret plus minimal non-sensitive session metadata.

No mobile UI, mobile Realtime connection code, or clinical voice action layer was added in V5-A.

## Implemented Route

- `POST /patient/voice/session`
- Authenticated patient users only.
- Feature-flagged off by default.
- Real `OPENAI_API_KEY` remains server-only.
- Mobile does not receive or store the real OpenAI API key.

## Response Shape

The route returns only:

- `ok`
- `clientSecret.value`
- `clientSecret.expiresAt`
- `session.id`
- `session.model`

The route does not return:

- `OPENAI_API_KEY`
- OpenAI request payload
- Safety identifier
- Instructions
- Tools
- Patient profile
- Raw upstream errors

## Files Added

- `server/src/services/openaiRealtimeService.ts`
- `server/tests/openaiRealtimeService.test.ts`

## Files Changed

- `server/src/env.ts`
- `server/src/routes/patient.routes.ts`
- `server/tests/env.security.test.ts`
- `server/tests/patient.routes.test.ts`

## Environment Variables Added

- `OPENAI_API_KEY`
- `AURA_VOICE_AGENT_ENABLED`
- `AURA_VOICE_AGENT_MODEL`
- `AURA_VOICE_AGENT_CLIENT_SECRET_TTL_SECONDS`
- `AURA_VOICE_AGENT_REQUEST_TIMEOUT_MS`
- `AURA_VOICE_AGENT_RATE_LIMIT_WINDOW_MS`
- `AURA_VOICE_AGENT_RATE_LIMIT_MAX`

## Safety And Session Configuration

V5-A uses a controlled OpenAI Realtime session configuration:

- `tool_choice: none`
- `tools: []`
- `parallel_tool_calls: false`
- Short TTL
- Tracing disabled
- Server VAD
- Near-field noise reduction
- Controlled Aura voice-support instructions
- Hashed `OpenAI-Safety-Identifier`, not raw patient id

## Security And Privacy Boundaries

V5-A preserves the following boundaries:

- No mobile UI.
- No Realtime tools.
- No clinical mutations.
- No check-in submit.
- No chat send.
- No appointment booking.
- No alert creation.
- No emergency calling.
- No `/rag/reply`.
- No Safety Router bypass.
- No transcript logging.
- No audio logging.
- No prompt/instruction logging.
- No API key leakage in route responses or service errors.
- No client-secret leakage in service errors.
- No safety-identifier leakage in route responses or service errors.

## Verification Recorded

- `npm test -- env.security.test.ts` passed: 12 tests.
- `npm test -- openaiRealtimeService.test.ts` passed: 8 tests.
- `npm test -- patient.routes.test.ts` passed: 26 tests.
- `npm test` passed: 54 files / 353 tests.
- `npm run build` passed.
- `git diff --check` passed.
- Existing Mongoose duplicate schema index warning for `patientId` appeared but did not fail the run.

## OpenAI Verification Notes

- No live OpenAI call was made during verification.
- No API credits were spent.
- Automated tests mocked OpenAI behavior.

## Manual / Live API Testing Notes

- Live testing requires `AURA_VOICE_AGENT_ENABLED=true`.
- Live testing requires `OPENAI_API_KEY` set in `server/.env`.
- V5-A only brokers a short-lived session secret.
- The safety boundary is no tools and no backend mutations.
- Prompt instructions are guidance, not clinical safety control by themselves.

## Limitations

- No mobile Realtime UI yet.
- No actual voice conversation yet.
- No tool/action proposal layer yet.
- No clinical actions by voice.
- Not clinical validation.
- Not production voice-agent validation.
