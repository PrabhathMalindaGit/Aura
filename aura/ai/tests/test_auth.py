import importlib
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient


class AiAuthTestCase(unittest.TestCase):
    def setUp(self) -> None:
        os.environ["AURA_AI_SERVICE_KEY"] = "test-ai-key"
        os.environ["LOG_LEVEL"] = "WARNING"

        import src.config as config_module

        config_module.get_settings.cache_clear()
        import src.main as main_module

        self.main_module = importlib.reload(main_module)
        self.client = TestClient(self.main_module.app)

    def tearDown(self) -> None:
        self.client.close()

    def test_health_route_stays_open(self) -> None:
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_non_health_route_requires_service_key(self) -> None:
        response = self.client.post(
            "/classify",
            json={
                "type": "checkin",
                "pain": 8,
            },
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"ok": False, "error": "UNAUTHORIZED"})

    def test_non_health_route_accepts_valid_service_key(self) -> None:
        response = self.client.post(
            "/classify",
            headers={"x-aura-ai-key": "test-ai-key"},
            json={
                "type": "checkin",
                "pain": 8,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn(payload["risk"], {"low", "high"})

    def test_non_health_route_echoes_safe_request_id(self) -> None:
        response = self.client.post(
            "/classify",
            headers={
                "x-aura-ai-key": "test-ai-key",
                "x-request-id": "req-ai-safe-1",
            },
            json={
                "type": "checkin",
                "pain": 8,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("x-request-id"), "req-ai-safe-1")

    def test_non_health_route_replaces_invalid_request_id(self) -> None:
        response = self.client.post(
            "/classify",
            headers={
                "x-aura-ai-key": "test-ai-key",
                "x-request-id": "bad request id with spaces",
            },
            json={
                "type": "checkin",
                "pain": 8,
            },
        )

        self.assertEqual(response.status_code, 200)
        echoed_request_id = response.headers.get("x-request-id")
        self.assertIsNotNone(echoed_request_id)
        self.assertNotEqual(echoed_request_id, "bad request id with spaces")
        self.assertEqual(len(echoed_request_id), 36)

    def test_exception_output_is_sanitized(self) -> None:
        with patch(
            "src.routers.classify.classify_risk",
            side_effect=RuntimeError("sensitive internal details"),
        ):
            client = TestClient(self.main_module.app, raise_server_exceptions=False)
            response = client.post(
                "/classify",
                headers={"x-aura-ai-key": "test-ai-key"},
                json={
                    "type": "checkin",
                    "pain": 8,
                },
            )
            client.close()

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"ok": False, "error": "INTERNAL_ERROR"})
        self.assertTrue(response.headers.get("x-request-id"))


if __name__ == "__main__":
    unittest.main()
