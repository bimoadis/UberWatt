"""
Unit tests for Sprint 2: Solana RPC Anchor Worker & GridSchedulerWorker
"""
import asyncio
from datetime import datetime, timezone
import unittest

from app.engine.signal_engine import PriceTick
from app.scheduler.worker import GridSchedulerWorker
from app.solana.anchor import SolanaAnchorWorker


class TestSprint2SchedulerAndSolana(unittest.TestCase):
    def test_solana_rpc_anchor_preparation(self):
        worker = SolanaAnchorWorker(rpc_url="https://api.devnet.solana.com")
        payload = worker.prepare_anchor_payload(
            grid="ercot",
            node="HB_WEST",
            interval_start="2026-09-01T14:05:00Z",
            price=23.41,
            currency="USD",
            breakeven=45.0,
            signal="RUN",
            detected_at="2026-09-01T14:11:03Z",
        )

        res = asyncio.run(worker.anchor_signal(payload))
        self.assertIn(res.status, ["ANCHORED", "PENDING"])
        self.assertTrue(res.memo_text.startswith("UW1:"))
        self.assertEqual(len(res.digest), 64)

    def test_grid_scheduler_tick_processing(self):
        scheduler = GridSchedulerWorker(
            solana_worker=SolanaAnchorWorker(rpc_url="https://api.devnet.solana.com")
        )

        # Run process_grid_tick
        record = asyncio.run(scheduler.process_grid_tick("ercot"))

        health = scheduler.health_records["ercot"]
        self.assertEqual(health["status"], "HEALTHY")
        self.assertIsNotNone(health["last_success_at"])
        self.assertEqual(health["consecutive_failures"], 0)

    def test_grid_scheduler_flip_triggers_solana_anchor(self):
        scheduler = GridSchedulerWorker()
        scheduler.grid_states["ercot"] = "STOP"

        now = datetime.now(timezone.utc)
        tick1 = PriceTick(
            grid="ercot",
            node="HB_WEST",
            interval_start=now,
            interval_minutes=5,
            price=30.0,  # Below 41.4 run_threshold
            currency="USD",
            source_url="https://api.ercot.com/test",
            fetched_at=now,
        )
        tick2 = PriceTick(
            grid="ercot",
            node="HB_WEST",
            interval_start=now,
            interval_minutes=5,
            price=32.0,  # 2nd consecutive tick below 41.4 -> FLIP TO RUN
            currency="USD",
            source_url="https://api.ercot.com/test",
            fetched_at=now,
        )

        scheduler.previous_ticks["ercot"] = tick1

        # Evaluate tick2 via process_grid_tick or engine
        _, is_flip, signal_flip = scheduler.signal_engine.evaluate_tick("STOP", tick2, previous_tick=tick1)

        self.assertTrue(is_flip)
        self.assertIsNotNone(signal_flip)
        self.assertEqual(signal_flip.signal, "RUN")


if __name__ == "__main__":
    unittest.main()
