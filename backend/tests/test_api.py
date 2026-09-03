"""
Unit tests for FastAPI endpoints (Grids, Signals, Accuracy, Health)
"""
import unittest
from fastapi.testclient import TestClient
from app.main import app


class TestFastAPIEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_root_endpoint(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["name"], "ÜberWatt API")

    def test_list_grids(self):
        res = self.client.get("/v1/grids")
        self.assertEqual(res.status_code, 200)
        grids = res.json()
        self.assertGreaterEqual(len(grids), 5)
        self.assertEqual(grids[0]["grid"], "ercot")

    def test_current_grid_state(self):
        res = self.client.get("/v1/grids/ercot/current")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["grid"], "ercot")
        self.assertIn("price", data)

    def test_health_endpoint(self):
        res = self.client.get("/v1/health")
        self.assertEqual(res.status_code, 200)
        health = res.json()
        self.assertEqual(health[0]["grid"], "ercot")
        self.assertEqual(health[0]["status"], "HEALTHY")


if __name__ == "__main__":
    unittest.main()
