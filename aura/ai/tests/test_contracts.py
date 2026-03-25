import importlib
import os
import unittest

from fastapi.testclient import TestClient
from pydantic import ValidationError

import src.config as config_module
from src.models.schemas import ClassifyResponse, RagReplyResponse


class AiContractsTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.original_env = os.environ.copy()
        os.environ["AURA_AI_SERVICE_KEY"] = "test-ai-key"
        os.environ["LOG_LEVEL"] = "WARNING"

        config_module.get_settings.cache_clear()
        import src.main as main_module

        self.main_module = importlib.reload(main_module)
        self.client = TestClient(self.main_module.app)

    def tearDown(self) -> None:
        self.client.close()
        os.environ.clear()
        os.environ.update(self.original_env)
        config_module.get_settings.cache_clear()

    def test_chat_classify_requires_text(self) -> None:
        response = self.client.post(
            "/classify",
            headers={"x-aura-ai-key": "test-ai-key"},
            json={
                "type": "chat",
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_classify_response_rejects_unknown_reason_codes(self) -> None:
        with self.assertRaises(ValidationError):
            ClassifyResponse(
                risk="high",
                reasons=["UNKNOWN_REASON"],
                ruleVersion="v1",
            )

    def test_rag_reply_response_rejects_blank_or_overlong_reply(self) -> None:
        with self.assertRaises(ValidationError):
            RagReplyResponse(reply="   ", citations=[])

        with self.assertRaises(ValidationError):
            RagReplyResponse(reply="x" * 501, citations=[])


if __name__ == "__main__":
    unittest.main()
