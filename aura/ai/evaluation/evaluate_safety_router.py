from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Literal

from src.models.schemas import ClassifyRequest
from src.services.router_service import classify_risk


DATASET_PATH = Path(__file__).with_name("safety_router_synthetic_v1.json")
PAIN_HIGH_THRESHOLD = 7
POSITIVE_CLASS = "high"

RiskLabel = Literal["low", "high"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate Aura Safety Router synthetic examples."
    )
    parser.add_argument(
        "dataset_path",
        nargs="?",
        type=Path,
        default=DATASET_PATH,
        help="Optional dataset JSON path. Defaults to the v1 synthetic dataset.",
    )
    return parser.parse_args()


def _safe_divide(numerator: int | float, denominator: int | float) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def _new_metric_bucket() -> dict[str, Any]:
    return {
        "total": 0,
        "tp": 0,
        "fp": 0,
        "tn": 0,
        "fn": 0,
        "reasonCodeMatches": 0,
        "mismatches": [],
    }


def _finalize_metric_bucket(bucket: dict[str, Any]) -> dict[str, Any]:
    precision = _safe_divide(bucket["tp"], bucket["tp"] + bucket["fp"])
    recall = _safe_divide(bucket["tp"], bucket["tp"] + bucket["fn"])
    f1 = _safe_divide(2 * precision * recall, precision + recall)

    return {
        **bucket,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "reasonCodeAgreement": _safe_divide(
            bucket["reasonCodeMatches"], bucket["total"]
        ),
        "mismatchCount": len(bucket["mismatches"]),
    }


def _record_prediction(
    bucket: dict[str, Any],
    expected_risk: RiskLabel,
    predicted_risk: RiskLabel,
    reason_match: bool,
) -> None:
    expected_positive = expected_risk == POSITIVE_CLASS
    predicted_positive = predicted_risk == POSITIVE_CLASS

    bucket["total"] += 1
    if expected_positive and predicted_positive:
        bucket["tp"] += 1
    elif not expected_positive and predicted_positive:
        bucket["fp"] += 1
    elif not expected_positive and not predicted_positive:
        bucket["tn"] += 1
    else:
        bucket["fn"] += 1

    if reason_match:
        bucket["reasonCodeMatches"] += 1


def _positive_class_metrics_not_applicable(metrics: dict[str, Any]) -> bool:
    has_expected_positives = metrics["tp"] + metrics["fn"] > 0
    has_predicted_positives = metrics["tp"] + metrics["fp"] > 0
    return not has_expected_positives and not has_predicted_positives


def _format_category_positive_class_metric(
    metrics: dict[str, Any], metric_name: str
) -> str:
    if _positive_class_metrics_not_applicable(metrics):
        return "N/A"
    return f"{metrics[metric_name]:.4f}"


def load_dataset(path: Path = DATASET_PATH) -> dict[str, Any]:
    with path.open(encoding="utf-8") as dataset_file:
        return json.load(dataset_file)


def evaluate_dataset(dataset: dict[str, Any]) -> dict[str, Any]:
    examples = dataset["examples"]
    overall = _new_metric_bucket()
    category_buckets: dict[str, dict[str, Any]] = {}

    for example in examples:
        request = ClassifyRequest(
            type=example["type"],
            pain=example["pain"],
            text=example["text"],
        )
        predicted = classify_risk(request, PAIN_HIGH_THRESHOLD)
        expected_risk: RiskLabel = example["expectedRisk"]
        predicted_risk = predicted.risk
        expected_reasons = example["expectedReasons"]
        predicted_reasons = list(predicted.reasons)
        reason_match = set(predicted_reasons) == set(expected_reasons)
        category = example["category"]
        category_bucket = category_buckets.setdefault(category, _new_metric_bucket())

        _record_prediction(overall, expected_risk, predicted_risk, reason_match)
        _record_prediction(
            category_bucket, expected_risk, predicted_risk, reason_match
        )

        if predicted_risk != expected_risk or not reason_match:
            mismatch = {
                "id": example["id"],
                "category": category,
                "difficulty": example.get("difficulty"),
                "expectedRisk": expected_risk,
                "expectedReasons": expected_reasons,
                "predictedRisk": predicted_risk,
                "predictedReasons": predicted_reasons,
                "rationale": example["rationale"],
            }
            overall["mismatches"].append(mismatch)
            category_bucket["mismatches"].append(mismatch)

    finalized_overall = _finalize_metric_bucket(overall)
    finalized_categories = {
        category: _finalize_metric_bucket(bucket)
        for category, bucket in sorted(category_buckets.items())
    }
    return {**finalized_overall, "categories": finalized_categories}


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
    print("Category metrics:")
    print(
        "category | total | TP | FP | TN | FN | precision | recall | F1 | "
        "reason-code agreement | mismatches"
    )
    for category, category_metrics in metrics["categories"].items():
        print(
            f"{category} | {category_metrics['total']} | "
            f"{category_metrics['tp']} | {category_metrics['fp']} | "
            f"{category_metrics['tn']} | {category_metrics['fn']} | "
            f"{_format_category_positive_class_metric(category_metrics, 'precision')} | "
            f"{_format_category_positive_class_metric(category_metrics, 'recall')} | "
            f"{_format_category_positive_class_metric(category_metrics, 'f1')} | "
            f"{category_metrics['reasonCodeAgreement']:.4f} "
            f"({category_metrics['reasonCodeMatches']}/"
            f"{category_metrics['total']}) | "
            f"{category_metrics['mismatchCount']}"
        )
    print()

    mismatches = metrics["mismatches"]
    if not mismatches:
        print("Mismatches: none")
        return

    print("Mismatches:")
    for mismatch in mismatches:
        difficulty = mismatch["difficulty"] or "n/a"
        print(
            "- "
            f"{mismatch['id']} [{mismatch['category']} | {difficulty}]: "
            f"expected {mismatch['expectedRisk']} {mismatch['expectedReasons']} -> "
            f"predicted {mismatch['predictedRisk']} {mismatch['predictedReasons']}. "
            f"Rationale: {mismatch['rationale']}"
        )


def main() -> None:
    args = parse_args()
    dataset = load_dataset(args.dataset_path)
    metrics = evaluate_dataset(dataset)
    print_report(dataset, metrics)


if __name__ == "__main__":
    main()
