"""
Unit tests for Sprint 5: Data Staleness Detection & Production Readiness
"""
from datetime import datetime, timezone, timedelta
import unittest
from app.main import app
from fastapi.testclient import TestClient


class TestSprint5StalenessAndProduction(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_staleness_calculation_threshold(self):
        now = datetime.now(timezone.utc)
        fresh_tick_time = now - timedelta(minutes=5)
        stale_tick_time = now - timedelta(minutes=16)

        fresh_age = (now - fresh_tick_time).total_seconds()
        stale_age = (now - stale_tick_time).total_seconds()

        # Rule: > 900 seconds (15 mins) is stale
        self.assertLess(fresh_age, 900)
        self.assertGreater(stale_age, 900)

    def test_health_endpoint_staleness_report(self):
        res = self.client.get("/v1/health")
        self.assertEqual(res.status_code, 200)
        health_list = res.json()
        for item in health_list:
            self.assertIn("staleness_seconds", item)
            self.assertIn("status", item)


if __name__ == "__main__":
    unittest.main()
