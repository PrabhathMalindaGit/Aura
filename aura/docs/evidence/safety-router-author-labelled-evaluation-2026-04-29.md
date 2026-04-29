# Safety Router Author-Labelled Synthetic Evaluation Evidence - 2026-04-29

## Purpose

This evidence file records an expanded author-labelled synthetic prototype evaluation of Aura's deterministic Safety Router. It is intended to support the final report with traceable prototype evidence only.

This file does not write the abstract.

## Dataset Provenance

- Dataset file: `ai/evaluation/safety_router_author_labelled_synthetic_v2.json`
- Dataset size: 144 examples.
- Label source: `author_labelled_synthetic`.
- Data source: synthetic examples written for prototype evaluation.
- Real patient data: none.
- Existing 35-example dataset: unchanged and still reproducible at `ai/evaluation/safety_router_synthetic_v1.json`.

## Strong Limitation Statement

This is author-labelled synthetic prototype evidence only. It is not clinician-reviewed, not clinical validation, not real patient validation, and not deployment validation.

The result measures deterministic router behavior on authored synthetic examples. It should not be interpreted as evidence of real-world clinical safety performance.

## Category Count Table

| Category | Count |
| --- | ---: |
| `high_pain_threshold` | 12 |
| `severe_pain_functional_limitation` | 12 |
| `explicit_crisis_language` | 10 |
| `passive_indirect_crisis_language` | 10 |
| `urgent_symptom_phrases` | 12 |
| `medication_overdose_concern` | 10 |
| `falls_bleeding_fainting` | 10 |
| `low_risk_rehabilitation_support` | 10 |
| `normal_soreness_fatigue` | 10 |
| `app_navigation_false_positive_probe` | 12 |
| `borderline_pain_5_6` | 12 |
| `adherence_decline_without_crisis` | 8 |
| `emotional_distress_without_crisis` | 8 |
| `prompt_injection_irrelevant_text` | 8 |
| **Total** | **144** |

Expected label distribution:

| Expected label | Count |
| --- | ---: |
| `high` | 76 |
| `low` | 68 |

## Evaluation Command

Run from `ai/`:

```bash
PYTHONPATH=. .venv/bin/python evaluation/evaluate_safety_router.py evaluation/safety_router_author_labelled_synthetic_v2.json
```

## Overall Metrics

| Metric | Result |
| --- | ---: |
| Total examples | 144 |
| True positives | 76 |
| False positives | 0 |
| True negatives | 68 |
| False negatives | 0 |
| Precision | 1.0000 |
| Recall | 1.0000 |
| F1 | 1.0000 |
| Reason-code agreement | 1.0000 (144/144) |
| Mismatches | none |

## Category-Level Metrics

| Category | Total | TP | FP | TN | FN | Precision | Recall | F1 | Reason-code agreement | Mismatches |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `adherence_decline_without_crisis` | 8 | 0 | 0 | 8 | 0 | 0.0000 | 0.0000 | 0.0000 | 1.0000 (8/8) | 0 |
| `app_navigation_false_positive_probe` | 12 | 0 | 0 | 12 | 0 | 0.0000 | 0.0000 | 0.0000 | 1.0000 (12/12) | 0 |
| `borderline_pain_5_6` | 12 | 0 | 0 | 12 | 0 | 0.0000 | 0.0000 | 0.0000 | 1.0000 (12/12) | 0 |
| `emotional_distress_without_crisis` | 8 | 0 | 0 | 8 | 0 | 0.0000 | 0.0000 | 0.0000 | 1.0000 (8/8) | 0 |
| `explicit_crisis_language` | 10 | 10 | 0 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 | 1.0000 (10/10) | 0 |
| `falls_bleeding_fainting` | 10 | 10 | 0 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 | 1.0000 (10/10) | 0 |
| `high_pain_threshold` | 12 | 12 | 0 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 | 1.0000 (12/12) | 0 |
| `low_risk_rehabilitation_support` | 10 | 0 | 0 | 10 | 0 | 0.0000 | 0.0000 | 0.0000 | 1.0000 (10/10) | 0 |
| `medication_overdose_concern` | 10 | 10 | 0 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 | 1.0000 (10/10) | 0 |
| `normal_soreness_fatigue` | 10 | 0 | 0 | 10 | 0 | 0.0000 | 0.0000 | 0.0000 | 1.0000 (10/10) | 0 |
| `passive_indirect_crisis_language` | 10 | 10 | 0 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 | 1.0000 (10/10) | 0 |
| `prompt_injection_irrelevant_text` | 8 | 0 | 0 | 8 | 0 | 0.0000 | 0.0000 | 0.0000 | 1.0000 (8/8) | 0 |
| `severe_pain_functional_limitation` | 12 | 12 | 0 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 | 1.0000 (12/12) | 0 |
| `urgent_symptom_phrases` | 12 | 12 | 0 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 | 1.0000 (12/12) | 0 |

## Mismatch Analysis

The evaluator reported no mismatches for the 144-example author-labelled synthetic dataset.

If future runs produce mismatches, they should be reported directly with example id, category, difficulty, expected risk/reasons, predicted risk/reasons, and rationale. Mismatches should not be hidden or softened.

## Safe Report/Abstract Wording

"The Safety Router was evaluated on 144 author-labelled synthetic prototype scenarios covering high-pain thresholds, crisis-language phrases, urgent symptom wording, rehabilitation-support cases, app-navigation false-positive probes, borderline pain, adherence decline, emotional distress, and prompt-injection-style irrelevant text. This evaluation provides prototype evidence only and is not clinician-reviewed, clinical validation, real patient validation, or deployment validation."

"On this author-labelled synthetic dataset, the deterministic Safety Router produced TP=76, FP=0, TN=68, FN=0, with precision, recall, F1, and reason-code agreement of 1.0000; this should be interpreted only as synthetic prototype evidence."

## Caution Statement

- This is author-labelled synthetic prototype evidence only. It is not clinician-reviewed, not clinical validation, not real patient validation, and not deployment validation.
- The dataset was authored to exercise known deterministic Safety Router behavior.
- The result does not establish safety for real users, real rehabilitation settings, or deployed clinical workflows.
- The evaluation should be reported as prototype evidence, not as a clinical safety claim.
