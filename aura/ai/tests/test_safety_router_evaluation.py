import unittest

from evaluation.evaluate_safety_router import evaluate_dataset, load_dataset


class SafetyRouterEvaluationTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.dataset = load_dataset()

    def test_dataset_metadata_marks_synthetic_prototype_scope(self) -> None:
        metadata = self.dataset["metadata"]

        self.assertEqual(metadata["positiveClass"], "high")
        self.assertIn("Synthetic", metadata["disclaimer"])
        self.assertIn("prototype-level", metadata["disclaimer"])
        self.assertIn("no real patient data", metadata["noRealPatientData"].lower())

    def test_dataset_contains_expanded_schema_valid_examples(self) -> None:
        examples = self.dataset["examples"]

        self.assertGreater(len(examples), 24)
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
        ]:
            self.assertIn(key, metrics)


if __name__ == "__main__":
    unittest.main()
