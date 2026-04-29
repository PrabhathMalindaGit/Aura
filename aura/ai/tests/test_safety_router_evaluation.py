import io
import unittest
from collections import Counter
from contextlib import redirect_stdout
from pathlib import Path

from evaluation.evaluate_safety_router import evaluate_dataset, load_dataset, print_report


AUTHOR_LABELLED_DATASET_PATH = (
    Path(__file__).resolve().parents[1]
    / "evaluation"
    / "safety_router_author_labelled_synthetic_v2.json"
)
EXPECTED_CATEGORY_COUNTS = {
    "high_pain_threshold": 12,
    "severe_pain_functional_limitation": 12,
    "explicit_crisis_language": 10,
    "passive_indirect_crisis_language": 10,
    "urgent_symptom_phrases": 12,
    "medication_overdose_concern": 10,
    "falls_bleeding_fainting": 10,
    "low_risk_rehabilitation_support": 10,
    "normal_soreness_fatigue": 10,
    "app_navigation_false_positive_probe": 12,
    "borderline_pain_5_6": 12,
    "adherence_decline_without_crisis": 8,
    "emotional_distress_without_crisis": 8,
    "prompt_injection_irrelevant_text": 8,
}
EXPECTED_REASON_CODES = {"PAIN_GE_THRESHOLD", "CRISIS_LANGUAGE"}


class SafetyRouterEvaluationTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.dataset = load_dataset()
        self.author_labelled_dataset = load_dataset(AUTHOR_LABELLED_DATASET_PATH)

    def test_dataset_metadata_marks_synthetic_prototype_scope(self) -> None:
        metadata = self.dataset["metadata"]

        self.assertEqual(metadata["positiveClass"], "high")
        self.assertIn("Synthetic", metadata["disclaimer"])
        self.assertIn("prototype-level", metadata["disclaimer"])
        self.assertIn("no real patient data", metadata["noRealPatientData"].lower())

    def test_existing_dataset_still_loads_and_evaluates(self) -> None:
        metrics = evaluate_dataset(self.dataset)

        self.assertEqual(metrics["total"], 35)
        self.assertEqual(metrics["tp"], 23)
        self.assertEqual(metrics["fp"], 0)
        self.assertEqual(metrics["tn"], 12)
        self.assertEqual(metrics["fn"], 0)
        self.assertEqual(metrics["precision"], 1.0)
        self.assertEqual(metrics["recall"], 1.0)
        self.assertEqual(metrics["f1"], 1.0)
        self.assertEqual(metrics["reasonCodeAgreement"], 1.0)
        self.assertEqual(metrics["mismatches"], [])

    def test_existing_dataset_contains_valid_compatible_schema(self) -> None:
        examples = self.dataset["examples"]

        self.assertEqual(len(examples), 35)
        for example in examples:
            self.assertIsInstance(example["id"], str)
            self.assertIn(example["type"], {"checkin", "chat"})
            self.assertIsInstance(example["text"], str)
            self.assertTrue(example["text"].strip())
            self.assertTrue(
                example["pain"] is None or isinstance(example["pain"], int)
            )
            self.assertIn(example["expectedRisk"], {"low", "high"})
            self.assertIsInstance(example["expectedReasons"], list)
            self.assertIsInstance(example["category"], str)
            self.assertIsInstance(example["rationale"], str)

    def test_author_labelled_dataset_schema_and_counts_are_valid(self) -> None:
        examples = self.author_labelled_dataset["examples"]

        self.assertEqual(len(examples), 144)
        self.assertEqual(
            Counter(example["category"] for example in examples),
            EXPECTED_CATEGORY_COUNTS,
        )

        expected_ids = [f"sr-author-{index:03d}" for index in range(1, 145)]
        self.assertEqual([example["id"] for example in examples], expected_ids)

        for example in examples:
            self.assertEqual(
                set(example.keys()),
                {
                    "id",
                    "type",
                    "text",
                    "pain",
                    "expectedRisk",
                    "expectedReasons",
                    "category",
                    "difficulty",
                    "rationale",
                    "labelSource",
                },
            )
            self.assertIn(example["type"], {"checkin", "chat"})
            self.assertIsInstance(example["text"], str)
            self.assertTrue(example["text"].strip())
            self.assertTrue(
                example["pain"] is None
                or (isinstance(example["pain"], int) and 0 <= example["pain"] <= 10)
            )
            self.assertIn(example["expectedRisk"], {"low", "high"})
            self.assertTrue(set(example["expectedReasons"]) <= EXPECTED_REASON_CODES)
            self.assertIn(example["category"], EXPECTED_CATEGORY_COUNTS)
            self.assertIn(example["difficulty"], {"easy", "medium", "hard"})
            self.assertIsInstance(example["rationale"], str)
            self.assertTrue(example["rationale"].strip())
            self.assertEqual(example["labelSource"], "author_labelled_synthetic")

    def test_author_labelled_dataset_expected_label_distribution(self) -> None:
        examples = self.author_labelled_dataset["examples"]
        risk_counts = Counter(example["expectedRisk"] for example in examples)

        self.assertEqual(risk_counts["high"], 76)
        self.assertEqual(risk_counts["low"], 68)

    def test_evaluator_returns_expected_metric_keys(self) -> None:
        metrics = evaluate_dataset(self.dataset)
        expected_total = len(self.dataset["examples"])

        self.assertEqual(metrics["total"], expected_total)
        for key in [
            "tp",
            "fp",
            "tn",
            "fn",
            "precision",
            "recall",
            "f1",
            "reasonCodeAgreement",
            "reasonCodeMatches",
            "mismatches",
            "mismatchCount",
            "categories",
        ]:
            self.assertIn(key, metrics)

        self.assertTrue(metrics["categories"])
        for category_metrics in metrics["categories"].values():
            for key in [
                "total",
                "tp",
                "fp",
                "tn",
                "fn",
                "precision",
                "recall",
                "f1",
                "reasonCodeAgreement",
                "reasonCodeMatches",
                "mismatches",
                "mismatchCount",
            ]:
                self.assertIn(key, category_metrics)

    def test_author_labelled_dataset_evaluates_with_category_metrics(self) -> None:
        metrics = evaluate_dataset(self.author_labelled_dataset)

        self.assertEqual(metrics["total"], 144)
        self.assertEqual(metrics["tp"], 76)
        self.assertEqual(metrics["fp"], 0)
        self.assertEqual(metrics["tn"], 68)
        self.assertEqual(metrics["fn"], 0)
        self.assertEqual(metrics["precision"], 1.0)
        self.assertEqual(metrics["recall"], 1.0)
        self.assertEqual(metrics["f1"], 1.0)
        self.assertEqual(metrics["reasonCodeAgreement"], 1.0)
        self.assertEqual(metrics["mismatches"], [])
        self.assertEqual(set(metrics["categories"]), set(EXPECTED_CATEGORY_COUNTS))

        for category, expected_count in EXPECTED_CATEGORY_COUNTS.items():
            self.assertEqual(metrics["categories"][category]["total"], expected_count)
            self.assertEqual(metrics["categories"][category]["mismatchCount"], 0)

    def test_print_report_keeps_mismatches_visible(self) -> None:
        mismatched_dataset = {
            "metadata": {
                "name": "Mismatch visibility fixture",
                "version": "test",
                "createdAt": "2026-04-29",
                "positiveClass": "high",
                "disclaimer": "Synthetic prototype fixture.",
                "noRealPatientData": "All examples are synthetic.",
            },
            "examples": [
                {
                    "id": "sr-mismatch-001",
                    "type": "chat",
                    "text": "I need encouragement for rehab.",
                    "pain": None,
                    "expectedRisk": "high",
                    "expectedReasons": ["CRISIS_LANGUAGE"],
                    "category": "mismatch_probe",
                    "difficulty": "hard",
                    "rationale": "Fixture intentionally disagrees with router output.",
                }
            ],
        }
        metrics = evaluate_dataset(mismatched_dataset)
        output = io.StringIO()

        with redirect_stdout(output):
            print_report(mismatched_dataset, metrics)

        report = output.getvalue()
        self.assertEqual(metrics["mismatchCount"], 1)
        self.assertIn("Mismatches:", report)
        self.assertIn("sr-mismatch-001", report)
        self.assertIn("mismatch_probe | hard", report)


if __name__ == "__main__":
    unittest.main()
