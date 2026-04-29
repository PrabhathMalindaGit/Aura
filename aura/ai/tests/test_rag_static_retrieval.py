import importlib
import os
import socket
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import src.config as config_module
from src.services.rag_store import retrieve_static_knowledge
from src.services.pgvector_store import PGVectorUnavailable


class RagStaticRetrievalTestCase(unittest.TestCase):
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

    def post_rag(self, message: str):
        return self.client.post(
            "/rag/reply",
            headers={"x-aura-ai-key": "test-ai-key"},
            json={
                "patientId": "demo-patient-1",
                "message": message,
            },
        )

    def post_rag_with_memory(self, message: str):
        return self.client.post(
            "/rag/reply",
            headers={"x-aura-ai-key": "test-ai-key"},
            json={
                "patientId": "demo-patient-1",
                "message": message,
                "context": {
                    "patientMemory": [
                        {
                            "id": "memory-1",
                            "memoryType": "preference",
                            "summary": "Patient prefers short reminders.",
                            "sourceKind": "low_risk_chat",
                            "score": 0.75,
                        }
                    ]
                },
            },
        )

    def test_rag_reply_returns_citations_for_relevant_query(self) -> None:
        response = self.post_rag("I need help pacing my exercise and rest today.")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["reply"])
        self.assertLessEqual(len(payload["reply"]), 500)
        self.assertGreater(len(payload["citations"]), 0)
        self.assertFalse(payload["grounding"]["fallbackUsed"])
        self.assertGreater(len(payload["grounding"]["sources"]), 0)

    def test_missed_exercises_query_retrieves_missed_exercises_chunk(self) -> None:
        results = retrieve_static_knowledge(
            "I missed my exercises and feel discouraged about restarting."
        )

        self.assertGreater(len(results), 0)
        self.assertEqual(results[0].chunk.id, "missed_exercises")

    def test_soreness_query_retrieves_soreness_and_fatigue_chunk(self) -> None:
        results = retrieve_static_knowledge(
            "My muscles feel sore and I am fatigued after rehab."
        )

        self.assertGreater(len(results), 0)
        self.assertEqual(results[0].chunk.id, "normal_soreness_and_fatigue")

    def test_pgvector_disabled_uses_lexical_retrieval(self) -> None:
        os.environ["RAG_PGVECTOR_ENABLED"] = "false"
        os.environ["RAG_PGVECTOR_DATABASE_URL"] = (
            "postgresql://aura:aura@localhost:5432/aura_vectors"
        )
        config_module.get_settings.cache_clear()

        with patch("src.services.rag_store.retrieve_static_knowledge_rows") as mocked:
            results = retrieve_static_knowledge(
                "I missed my exercises and feel discouraged about restarting."
            )

        mocked.assert_not_called()
        self.assertGreater(len(results), 0)
        self.assertEqual(results[0].chunk.id, "missed_exercises")

    def test_pgvector_result_preserves_retrieval_shape(self) -> None:
        os.environ["RAG_PGVECTOR_ENABLED"] = "true"
        os.environ["RAG_PGVECTOR_DATABASE_URL"] = (
            "postgresql://aura:aura@localhost:5432/aura_vectors"
        )
        config_module.get_settings.cache_clear()

        with patch(
            "src.services.rag_store.retrieve_static_knowledge_rows",
            return_value=[
                {
                    "id": "pacing_and_rest",
                    "title": "Pacing And Rest",
                    "category": "rehab_support",
                    "chunk_text": "Pacing activity with planned rest can support rehab.",
                    "safe_response_snippet": "Keep today manageable with planned rests.",
                    "source_version": "static-rehab-v1",
                    "safety_tags": ["supportive", "non_diagnostic"],
                    "keywords": ["pace", "rest"],
                    "score": 0.42,
                }
            ],
        ):
            results = retrieve_static_knowledge("How should I pace activity today?")

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].chunk.id, "pacing_and_rest")
        self.assertEqual(results[0].chunk.source_version, "static-rehab-v1")
        self.assertEqual(results[0].score, 0.42)

    def test_pgvector_failure_falls_back_to_lexical_retrieval(self) -> None:
        os.environ["RAG_PGVECTOR_ENABLED"] = "true"
        os.environ["RAG_PGVECTOR_DATABASE_URL"] = (
            "postgresql://aura:aura@localhost:5432/aura_vectors"
        )
        config_module.get_settings.cache_clear()

        with patch(
            "src.services.rag_store.retrieve_static_knowledge_rows",
            side_effect=PGVectorUnavailable("table missing"),
        ):
            results = retrieve_static_knowledge(
                "I missed my exercises and feel discouraged about restarting."
            )

        self.assertGreater(len(results), 0)
        self.assertEqual(results[0].chunk.id, "missed_exercises")

    def test_empty_pgvector_result_falls_back_to_lexical_retrieval(self) -> None:
        os.environ["RAG_PGVECTOR_ENABLED"] = "true"
        os.environ["RAG_PGVECTOR_DATABASE_URL"] = (
            "postgresql://aura:aura@localhost:5432/aura_vectors"
        )
        config_module.get_settings.cache_clear()

        with patch(
            "src.services.rag_store.retrieve_static_knowledge_rows",
            return_value=[],
        ):
            results = retrieve_static_knowledge(
                "My muscles feel sore and I am fatigued after rehab."
            )

        self.assertGreater(len(results), 0)
        self.assertEqual(results[0].chunk.id, "normal_soreness_and_fatigue")

    def test_irrelevant_query_uses_safe_fallback_with_metadata(self) -> None:
        response = self.post_rag("The dashboard button color looks strange.")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["citations"], [])
        self.assertTrue(payload["grounding"]["fallbackUsed"])
        self.assertEqual(payload["grounding"]["sources"], [])
        self.assertIn("contact your care team", payload["reply"])

    def test_rag_reply_accepts_memory_context_with_grounding_metadata(self) -> None:
        response = self.post_rag_with_memory(
            "Can you help me keep reminders short while pacing exercises?"
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertLessEqual(len(payload["reply"]), 500)
        memory_sources = [
            source
            for source in payload["grounding"]["sources"]
            if source["type"] == "patient_memory"
        ]
        self.assertEqual(len(memory_sources), 1)
        self.assertEqual(memory_sources[0]["id"], "memory-1")
        self.assertEqual(memory_sources[0]["memoryType"], "preference")
        self.assertEqual(memory_sources[0]["sourceKind"], "low_risk_chat")
        self.assertNotIn("summary", memory_sources[0])
        self.assertIn("patient-memory:memory-1", payload["citations"])

    def test_empty_memory_context_does_not_break_fallback(self) -> None:
        response = self.client.post(
            "/rag/reply",
            headers={"x-aura-ai-key": "test-ai-key"},
            json={
                "patientId": "demo-patient-1",
                "message": "The dashboard button color looks strange.",
                "context": {"patientMemory": []},
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["citations"], [])
        self.assertTrue(payload["grounding"]["fallbackUsed"])
        self.assertEqual(payload["grounding"]["sources"], [])

    def test_response_stays_bounded_and_avoids_clinical_advice(self) -> None:
        response = self.post_rag(
            "I missed exercises, feel sore, and wonder whether I should change my plan."
        )

        self.assertEqual(response.status_code, 200)
        reply = response.json()["reply"].lower()
        self.assertLessEqual(len(reply), 500)
        self.assertNotIn("diagnose", reply)
        self.assertNotIn("increase your medication", reply)
        self.assertNotIn("change your medication", reply)
        self.assertNotIn("change your exercise plan", reply)

    def test_rag_reply_requires_no_external_network_calls(self) -> None:
        def fail_socket(*args, **kwargs):
            raise AssertionError("external network call attempted")

        with patch.object(socket, "create_connection", side_effect=fail_socket):
            response = self.post_rag("I missed exercises and need encouragement.")

        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(response.json()["citations"]), 0)


if __name__ == "__main__":
    unittest.main()
