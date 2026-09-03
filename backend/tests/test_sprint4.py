"""
Unit tests for Sprint 4: Agent Feed Generator, SSE Stream, Day Schedule, and Wallet Auth
"""
from datetime import datetime, timezone
import unittest
from fastapi.testclient import TestClient

from app.feed.generator import AgentFeedGenerator
from app.main import app


class TestSprint4Features(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_agent_feed_generator_formatting(self):
        now = datetime.now(timezone.utc)
        post = AgentFeedGenerator.format_post(
            post_id="post-test-1",
            grid="ercot",
            node="HB_WEST",
            signal="RUN",
            price=-18.0,
            currency="$",
            breakeven=45.0,
            timestamp_utc=now,
            solana_tx_sig="test_solana_tx_sig",
            solana_digest="test_digest_123",
        )

        self.assertEqual(post.post_id, "post-test-1")
        self.assertIn("HB_WEST at −$18.00/MWh", post.en)
        self.assertIn("HB_WEST bei −18.00 $/MWh", post.de)
        self.assertIn("HB_WEST 报 −18.00 $/兆瓦时", post.zh)
        self.assertEqual(post.solana_tx_sig, "test_solana_tx_sig")

    def test_get_day_schedule_endpoint(self):
        res = self.client.get("/v1/grids/ercot/day")
        self.assertEqual(res.status_code, 200)
        blocks = res.json()
        self.assertEqual(len(blocks), 48)
        self.assertEqual(blocks[0]["time_hhmm"], "00:00")
        self.assertEqual(blocks[1]["time_hhmm"], "00:30")
        self.assertEqual(blocks[47]["time_hhmm"], "23:30")

    def test_get_agent_feed_endpoint(self):
        res = self.client.get("/v1/feed?grid=ercot&limit=5")
        self.assertEqual(res.status_code, 200)
        feed = res.json()
        self.assertGreaterEqual(len(feed), 1)
        self.assertEqual(feed[0]["grid"], "ercot")

    def test_accuracy_window_filtering(self):
        res_all = self.client.get("/v1/accuracy?grid=ercot")
        self.assertEqual(res_all.status_code, 200)
        self.assertEqual(len(res_all.json()), 3)

        res_filtered = self.client.get("/v1/accuracy?grid=ercot&window=30")
        self.assertEqual(res_filtered.status_code, 200)
        scores = res_filtered.json()
        self.assertEqual(len(scores), 1)
        self.assertEqual(scores[0]["window_days"], 30)

    def test_wallet_nonce_auth_flow(self):
        pubkey = "5K2mX1234567890abcdef1234567890abcdef123"
        # 1. Get Nonce
        res_nonce = self.client.get(f"/v1/auth/nonce?wallet={pubkey}")
        self.assertEqual(res_nonce.status_code, 200)
        data_nonce = res_nonce.json()
        self.assertIn("nonce", data_nonce)
        nonce_str = data_nonce["nonce"]

        # 2. Verify Signature
        res_verify = self.client.post(
            "/v1/auth/verify",
            json={"wallet": pubkey, "nonce": nonce_str, "signature": "mock_ed25519_sig"},
        )
        self.assertEqual(res_verify.status_code, 200)
        data_verify = res_verify.json()
        self.assertTrue(data_verify["authenticated"])
        self.assertIn("jwt_token", data_verify)


if __name__ == "__main__":
    unittest.main()
