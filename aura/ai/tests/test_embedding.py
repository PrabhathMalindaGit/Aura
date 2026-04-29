import math
import unittest

from src.services.embedding import deterministic_hashing_vector


class DeterministicHashingVectorTestCase(unittest.TestCase):
    def test_vector_length_defaults_to_384(self) -> None:
        vector = deterministic_hashing_vector("pacing exercise and rest")

        self.assertEqual(len(vector), 384)

    def test_vector_is_stable_for_same_input(self) -> None:
        first = deterministic_hashing_vector("missed exercises after work")
        second = deterministic_hashing_vector("missed exercises after work")

        self.assertEqual(first, second)

    def test_non_empty_vector_is_normalized(self) -> None:
        vector = deterministic_hashing_vector("soreness fatigue rehab")
        norm = math.sqrt(sum(component * component for component in vector))

        self.assertAlmostEqual(norm, 1.0, places=10)

    def test_empty_or_stop_word_only_input_returns_zero_vector(self) -> None:
        empty_vector = deterministic_hashing_vector("")
        stop_word_vector = deterministic_hashing_vector("the and or to")

        self.assertEqual(empty_vector, [0.0] * 384)
        self.assertEqual(stop_word_vector, [0.0] * 384)


if __name__ == "__main__":
    unittest.main()
