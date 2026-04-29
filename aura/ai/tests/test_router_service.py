import unittest

from src.models.schemas import ClassifyRequest
from src.services.router_service import classify_risk


class RouterServiceTestCase(unittest.TestCase):
    def classify(
        self,
        *,
        text: str | None = None,
        pain: int | None = None,
        request_type: str = "chat",
    ):
        return classify_risk(
            ClassifyRequest(type=request_type, pain=pain, text=text),
            threshold=7,
        )

    def test_pain_seven_remains_high_with_threshold_reason(self) -> None:
        result = self.classify(
            text="Pain persists after walking.",
            pain=7,
            request_type="checkin",
        )

        self.assertEqual(result.risk, "high")
        self.assertEqual(result.reasons, ["PAIN_GE_THRESHOLD"])

    def test_urgent_help_app_navigation_context_is_low(self) -> None:
        result = self.classify(text="I need urgent help finding the settings button.")

        self.assertEqual(result.risk, "low")
        self.assertEqual(result.reasons, [])

    def test_urgent_help_alone_remains_high(self) -> None:
        result = self.classify(text="I need urgent help.")

        self.assertEqual(result.risk, "high")
        self.assertEqual(result.reasons, ["CRISIS_LANGUAGE"])

    def test_urgent_help_clinical_context_is_high(self) -> None:
        result = self.classify(text="I need urgent help because I can't breathe.")

        self.assertEqual(result.risk, "high")
        self.assertEqual(result.reasons, ["CRISIS_LANGUAGE"])

    def test_urgent_help_password_context_is_low(self) -> None:
        result = self.classify(text="I need urgent help with my password.")

        self.assertEqual(result.risk, "low")
        self.assertEqual(result.reasons, [])

    def test_passive_crisis_phrase_is_high(self) -> None:
        result = self.classify(text="I do not want to wake up anymore.")

        self.assertEqual(result.risk, "high")
        self.assertEqual(result.reasons, ["CRISIS_LANGUAGE"])

    def test_existing_explicit_crisis_phrase_remains_high(self) -> None:
        result = self.classify(text="I might kill myself tonight.")

        self.assertEqual(result.risk, "high")
        self.assertEqual(result.reasons, ["CRISIS_LANGUAGE"])


if __name__ == "__main__":
    unittest.main()
