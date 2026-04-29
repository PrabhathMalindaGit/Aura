import os
import unittest

import src.config as config_module


class AiConfigTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.original_env = os.environ.copy()

    def tearDown(self) -> None:
        os.environ.clear()
        os.environ.update(self.original_env)
        config_module.get_settings.cache_clear()

    def test_production_like_empty_ai_service_key_is_rejected(self) -> None:
        os.environ["ENV"] = "production"
        os.environ["AURA_AI_SERVICE_KEY"] = ""

        config_module.get_settings.cache_clear()

        with self.assertRaises(config_module.ConfigurationError):
            config_module.get_settings()

    def test_invalid_numeric_env_is_rejected(self) -> None:
        os.environ["PORT"] = "not-a-number"

        config_module.get_settings.cache_clear()

        with self.assertRaises(config_module.ConfigurationError):
            config_module.get_settings()

    def test_development_and_test_defaults_are_allowed(self) -> None:
        os.environ["ENV"] = "development"
        os.environ.pop("AURA_AI_SERVICE_KEY", None)

        config_module.get_settings.cache_clear()
        development_settings = config_module.get_settings()
        self.assertEqual(development_settings.aura_ai_service_key, "dev_aura_ai_key")

        config_module.get_settings.cache_clear()
        os.environ["ENV"] = "test"
        os.environ.pop("AURA_AI_SERVICE_KEY", None)

        test_settings = config_module.get_settings()
        self.assertEqual(test_settings.aura_ai_service_key, "dev_aura_ai_key")

    def test_pgvector_defaults_are_fallback_safe(self) -> None:
        config_module.get_settings.cache_clear()
        settings = config_module.get_settings()

        self.assertFalse(settings.rag_pgvector_enabled)
        self.assertEqual(settings.rag_pgvector_database_url, "")
        self.assertTrue(settings.rag_pgvector_fallback_enabled)
        self.assertEqual(settings.rag_pgvector_top_k, 2)
        self.assertEqual(settings.rag_pgvector_dimensions, 384)

    def test_invalid_pgvector_boolean_env_is_rejected(self) -> None:
        os.environ["RAG_PGVECTOR_ENABLED"] = "maybe"

        config_module.get_settings.cache_clear()

        with self.assertRaises(config_module.ConfigurationError):
            config_module.get_settings()


if __name__ == "__main__":
    unittest.main()
