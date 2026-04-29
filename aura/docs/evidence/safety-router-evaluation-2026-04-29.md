# Safety Router Synthetic Evaluation Evidence - 2026-04-29

## Purpose

This evidence file records the measured result of the Aura Safety Router synthetic evaluation after a narrow deterministic rule improvement. It is intended to support project documentation and reporting with a traceable, cautious summary of what was evaluated, what changed, and what the measured prototype result was.

This file does not introduce new evaluation results, clinical claims, or abstract text.

## What Was Evaluated

The Safety Router synthetic evaluation was expanded from 24 to 35 labelled synthetic prototype examples.

The evaluated behavior covered:

- High pain threshold routing.
- Explicit crisis phrase detection.
- Passive crisis phrase detection.
- Context-aware handling for the phrase `"need urgent help"`.
- Reason-code agreement for deterministic rule outputs.

The AI router and backend fallback now share the same deterministic split between unconditional crisis phrases and context-aware `"need urgent help"` handling.

No chat/check-in flow, alert logic, dashboard, mobile, n8n, seed, benchmark, or abstract/report text was changed.

## Rule Behavior After Improvement

- `pain >= threshold` still adds `PAIN_GE_THRESHOLD`.
- The default threshold remains `7`.
- Explicit crisis phrases and passive crisis phrases add `CRISIS_LANGUAGE`.
- `"need urgent help"` is high when alone.
- `"need urgent help"` is high with clinical/safety context.
- `"need urgent help"` is low with app/navigation context only.
- If both clinical and app terms appear, clinical/safety context wins and the result is high.
- No new reason codes were added.

## Dataset Details

- Dataset type: labelled synthetic prototype examples.
- Previous size: 24 examples.
- Expanded size: 35 examples.
- Scope: deterministic Safety Router prototype evaluation.
- Data provenance: synthetic examples only.
- Clinical status: not a clinically curated dataset and not clinical validation.

### Files Changed

- `ai/src/services/router_service.py`
- `server/src/services/fallbackSafetyClassifier.ts`
- `ai/evaluation/safety_router_synthetic_v1.json`
- `ai/tests/test_safety_router_evaluation.py`

### Files Added

- `ai/tests/test_router_service.py`
- `server/tests/fallbackSafetyClassifier.test.ts`

## Evaluation Command

```bash
PYTHONPATH=. .venv/bin/python evaluation/evaluate_safety_router.py
```

## Evaluation Metrics

| Metric | Result |
| --- | ---: |
| Total examples | 35 |
| True positives | 23 |
| False positives | 0 |
| True negatives | 12 |
| False negatives | 0 |
| Precision | 1.0000 |
| Recall | 1.0000 |
| F1 | 1.0000 |
| Reason-code agreement | 1.0000 (35/35) |
| Mismatches | none |

## Test and Build Verification

### Python Verification

- Focused tests: `10 passed in 0.06s`.
- Full AI suite: `25 passed, 1 warning in 0.30s`.
- Warning: existing Starlette `python_multipart` `PendingDeprecationWarning`.

### Server Verification

```bash
npm test -- fallbackSafetyClassifier.test.ts ai.service.test.ts
```

- Result: 2 test files passed, 13 tests passed.

```bash
npm run build
```

- Result: exited 0.

## Safe Report or Abstract Wording

"The deterministic Safety Router was evaluated on 35 labelled synthetic prototype examples, achieving 1.0000 precision, recall, and F1 with 1.0000 reason-code agreement. This result reflects synthetic prototype evaluation only and is not clinical validation."

## Limitations and Cautions

- This is deterministic keyword matching.
- The dataset is synthetic and prototype-level.
- The dataset is not clinically curated.
- This result is not clinical validation.
- This result does not prove real-world clinical safety performance.
- Further evaluation should use larger, clinically reviewed examples and adversarial phrasing.

## Suggested Cleanup or Follow-Up

- Keep this evidence file separate from abstract/report prose until final writing.
- Consider adding future evidence files for larger clinically reviewed evaluation sets.
- Consider adversarial and paraphrase-heavy examples for future Safety Router evaluation.
