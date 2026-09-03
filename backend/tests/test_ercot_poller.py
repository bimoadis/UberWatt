"""
Unit tests for ERCOT Poller (Payload parsing & token auto-renew logic)
"""
from datetime import datetime, timezone
import unittest
from app.ingestion.ercot import ERCOTPoller


class TestERCOTPoller(unittest.TestCase):
    def test_parse_ercot_payload(self):
        poller = ERCOTPoller(primary_node="HB_WEST")

        mock_payload = {
            "data": [
                {
                    "settlementPoint": "HB_WEST",
                    "intervalEnding": "2026-09-01T14:05:00Z",
                    "settlementPointPrice": 23.41,
                }
            ]
        }

        fetched_at = datetime.now(timezone.utc)
        source_url = "https://api.ercot.com/test?node=HB_WEST"

        tick = poller._parse_ercot_payload(
            mock_payload, "HB_WEST", source_url, fetched_at
        )

        self.assertEqual(tick.grid, "ercot")
        self.assertEqual(tick.node, "HB_WEST")
        self.assertEqual(tick.price, 23.41)
        self.assertEqual(tick.currency, "USD")
        self.assertEqual(tick.interval_minutes, 5)
        self.assertEqual(tick.source_url, source_url)
        self.assertEqual(tick.fetched_at, fetched_at)


if __name__ == "__main__":
    unittest.main()
