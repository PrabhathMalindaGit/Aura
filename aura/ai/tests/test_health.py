import importlib
import os
import unittest

from fastapi.testclient import TestClient

import src.config as config_module


class AiHealthTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.original_env = os.environ.copy()

    def tearDown(self) -> None:
        os.environ.clear()
        os.environ.update(self.original_env)
        config_module.get_settings.cache_clear()

    def _build_client(self) -> TestClient:
        config_module.get_settings.cache_clear()
        import src.main as main_module

        reloaded = importlib.reload(main_module)
        return TestClient(reloaded.app)

    def test_health_remains_liveness_only(self) -> None:
        os.environ["AURA_AI_SERVICE_KEY"] = "test-ai-key"
        os.environ["LOG_LEVEL"] = "WARNING"

        client = self._build_client()
        response = client.get("/health")
        client.close()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_readiness_returns_ready_when_config_is_valid(self) -> None:
        os.environ["AURA_AI_SERVICE_KEY"] = "test-ai-key"
        os.environ["LOG_LEVEL"] = "WARNING"

        client = self._build_client()
        response = client.get("/health/ready")
        client.close()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ready"})

    def test_readiness_returns_unready_when_config_is_invalid(self) -> None:
        os.environ["ENV"] = "production"
        os.environ["AURA_AI_SERVICE_KEY"] = ""
        os.environ["LOG_LEVEL"] = "WARNING"

        client = self._build_client()
        liveness = client.get("/health")
        readiness = client.get("/health/ready")
        client.close()

        self.assertEqual(liveness.status_code, 200)
        self.assertEqual(liveness.json(), {"status": "ok"})
        self.assertEqual(readiness.status_code, 503)
        self.assertEqual(
            readiness.json(),
            {"status": "unready", "reason": "CONFIG_INVALID"},
        )


if __name__ == "__main__":
    unittest.main()
