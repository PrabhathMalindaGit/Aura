from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from src.models.schemas import ClassifyRequest
from src.services.router_service import classify_risk


DATASET_PATH = Path(__file__).with_name("safety_router_synthetic_v1.json")
PAIN_HIGH_THRESHOLD = 7
POSITIVE_CLASS = "high"

RiskLabel = Literal["low", "high"]


def _safe_divide(numerator: int | float, denominator: int | float) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def load_dataset(path: Path = DATASET_PATH) -> dict[str, Any]:
    with path.open(encoding="utf-8") as dataset_file:
        return json.load(dataset_file)


def evaluate_dataset(dataset: dict[str, Any]) -> dict[str, Any]:
    examples = dataset["examples"]
    tp = fp = tn = fn = 0
    reason_matches = 0
    mismatches: list[dict[str, Any]] = []

    for example in examples:
        request = ClassifyRequest(
            type=example["type"],
            pain=example["pain"],
            text=example["text"],
        )
        predicted = classify_risk(request, PAIN_HIGH_THRESHOLD)
        expected_risk: RiskLabel = example["expectedRisk"]
        predicted_risk = predicted.risk
        expected_positive = expected_risk == POSITIVE_CLASS
        predicted_positive = predicted_risk == POSITIVE_CLASS

        if expected_positive and predicted_positive:
            tp += 1
        elif not expected_positive and predicted_positive:
            fp += 1
        elif not expected_positive and not predicted_positive:
            tn += 1
        else:
            fn += 1

        expected_reasons = example["expectedReasons"]
        predicted_reasons = list(predicted.reasons)
        reason_match = set(predicted_reasons) == set(expected_reasons)
        if reason_match:
            reason_matches += 1

        if predicted_risk != expected_risk or not reason_match:
            mismatches.append(
                {
                    "id": example["id"],
                    "category": example["category"],
                    "expectedRisk": expected_risk,
                    "expectedReasons": expected_reasons,
                    "predictedRisk": predicted_risk,
                    "predictedReasons": predicted_reasons,
                    "rationale": example["rationale"],
                }
            )

    total = len(examples)
    precision = _safe_divide(tp, tp + fp)
    recall = _safe_divide(tp, tp + fn)
    f1 = _safe_divide(2 * precision * recall, precision + recall)

    return {
        "total": total,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "reasonCodeAgreement": _safe_divide(reason_matches, total),
        "reasonCodeMatches": reason_matches,
        "mismatches": mismatches,
    }


def print_report(dataset: dict[str, Any], metrics: dict[str, Any]) -> None:
    metadata = dataset["metadata"]
    print("Aura Safety Router synthetic evaluation")
    print(f"Dataset: {metadata['name']} ({metadata['version']})")
    print(f"Created at: {metadata['createdAt']}")
    print(f"Positive class: {metadata['positiveClass']}")
    print(f"Disclaimer: {metadata['disclaimer']}")
    print(f"No real patient data: {metadata['noRealPatientData']}")
    print()
    print(f"Total examples: {metrics['total']}")
    print(
        "Confusion matrix: "
        f"TP={metrics['tp']} FP={metrics['fp']} "
        f"TN={metrics['tn']} FN={metrics['fn']}"
    )
    print(f"Precision: {metrics['precision']:.4f}")
    print(f"Recall: {metrics['recall']:.4f}")
    print(f"F1: {metrics['f1']:.4f}")
    print(
        "Reason-code agreement: "
        f"{metrics['reasonCodeAgreement']:.4f} "
        f"({metrics['reasonCodeMatches']}/{metrics['total']})"
    )
    print()

    mismatches = metrics["mismatches"]
    if not mismatches:
        print("Mismatches: none")
        return

    print("Mismatches:")
    for mismatch in mismatches:
        print(
            "- "
            f"{mismatch['id']} [{mismatch['category']}]: "
            f"expected {mismatch['expectedRisk']} {mismatch['expectedReasons']} -> "
            f"predicted {mismatch['predictedRisk']} {mismatch['predictedReasons']}. "
            f"Rationale: {mismatch['rationale']}"
        )


def main() -> None:
    dataset = load_dataset()
    metrics = evaluate_dataset(dataset)
    print_report(dataset, metrics)


if __name__ == "__main__":
    main()
