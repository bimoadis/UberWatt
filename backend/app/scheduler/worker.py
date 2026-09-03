"""
ÜberWatt Background Scheduler Worker
Manages periodic poller execution, hysteresis signal engine processing, Solana anchoring, and health tracking.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.engine.signal_engine import PriceTick, SignalEngine, SignalFlip
from app.ingestion.ercot import ERCOTPoller
from app.solana.anchor import AnchorResult, SolanaAnchorWorker

logger = logging.getLogger(__name__)


class GridSchedulerWorker:
    """
    Worker running the 5-minute tick loop for tracked grids.
    Tracks state per grid/node, evaluates signal flips, anchors to Solana, and updates health metrics.
    """

    def __init__(
        self,
        ercot_poller: Optional[ERCOTPoller] = None,
        solana_worker: Optional[SolanaAnchorWorker] = None,
        reference_breakeven: float = 45.0,
        tick_interval_seconds: int = 300,  # 5 minutes
    ):
        self.ercot_poller = ercot_poller or ERCOTPoller()
        self.solana_worker = solana_worker or SolanaAnchorWorker()
        self.signal_engine = SignalEngine(default_breakeven=reference_breakeven)
        self.tick_interval_seconds = tick_interval_seconds

        # In-Memory State per Grid
        self.grid_states: Dict[str, str] = {"ercot": "RUN"}
        self.previous_ticks: Dict[str, PriceTick] = {}
        self.confirmed_signals: List[Dict] = []
        self.health_records: Dict[str, Dict] = {
            "ercot": {
                "grid": "ercot",
                "status": "HEALTHY",
                "last_success_at": None,
                "consecutive_failures": 0,
                "error_message": None,
            }
        }

        self.is_running = False
        self._task: Optional[asyncio.Task] = None

    async def process_grid_tick(self, grid: str = "ercot") -> Optional[Dict]:
        """
        Executes a single poller tick for the given grid:
        1. Fetches latest PriceTick from poller
        2. Passes through SignalEngine with hysteresis
        3. On signal flip: computes SHA-256 digest & anchors to Solana
        4. Updates poller health
        """
        now_utc = datetime.now(timezone.utc)
        self.health_records[grid]["last_attempt_at"] = now_utc.isoformat()

        try:
            # 1. Ingest price tick (using mock tick in dev/test if poller creds missing)
            if self.ercot_poller.subscription_key:
                tick = await self.ercot_poller.fetch_latest_price_tick()
            else:
                # Simulated production tick fallback for dev environment
                tick = PriceTick(
                    grid=grid,
                    node="HB_WEST",
                    interval_start=now_utc,
                    interval_minutes=5,
                    price=23.41,
                    currency="USD",
                    source_url="https://api.ercot.com/api/public-reports/spp?node=HB_WEST",
                    fetched_at=now_utc,
                )

            current_state = self.grid_states.get(grid, "RUN")
            prev_tick = self.previous_ticks.get(grid)

            # 2. Evaluate tick with Hysteresis 8% Deadband
            new_state, is_flip, signal_flip = self.signal_engine.evaluate_tick(
                current_state=current_state,
                current_tick=tick,
                previous_tick=prev_tick,
            )

            # Update stored previous tick
            self.previous_ticks[grid] = tick
            self.grid_states[grid] = new_state

            # 3. Handle confirmed signal flip & Solana Anchoring
            record = None
            if is_flip and signal_flip:
                payload = self.solana_worker.prepare_anchor_payload(
                    grid=signal_flip.grid,
                    node=signal_flip.node,
                    interval_start=signal_flip.interval_start.isoformat(),
                    price=signal_flip.price,
                    currency=signal_flip.currency,
                    breakeven=signal_flip.breakeven,
                    signal=signal_flip.signal,
                    detected_at=signal_flip.detected_at.isoformat(),
                )

                # Anchor payload to Solana SPL Memo
                anchor_res: AnchorResult = await self.solana_worker.anchor_signal(payload)

                record = {
                    "id": f"sig-{len(self.confirmed_signals) + 1:04d}",
                    "grid": signal_flip.grid,
                    "node": signal_flip.node,
                    "interval_start": signal_flip.interval_start.isoformat(),
                    "price": signal_flip.price,
                    "currency": signal_flip.currency,
                    "breakeven": signal_flip.breakeven,
                    "signal": signal_flip.signal,
                    "detected_at": signal_flip.detected_at.isoformat(),
                    "solana_tx_sig": anchor_res.tx_signature,
                    "solana_digest": anchor_res.digest,
                    "anchor_status": anchor_res.status,
                }
                self.confirmed_signals.insert(0, record)
                logger.info(f"CONFIRMED SIGNAL FLIP [{grid}]: {new_state} | Solana Tx: {anchor_res.tx_signature}")

            # 4. Update Poller Health (Healthy)
            self.health_records[grid]["status"] = "HEALTHY"
            self.health_records[grid]["last_success_at"] = now_utc.isoformat()
            self.health_records[grid]["consecutive_failures"] = 0
            self.health_records[grid]["error_message"] = None

            return record

        except Exception as e:
            logger.error(f"Error processing tick for grid {grid}: {e}")
            self.health_records[grid]["consecutive_failures"] += 1
            if self.health_records[grid]["consecutive_failures"] >= 3:
                self.health_records[grid]["status"] = "DOWN"
            else:
                self.health_records[grid]["status"] = "DEGRADED"
            self.health_records[grid]["error_message"] = str(e)
            return None

    async def start(self):
        """
        Starts the background tick scheduler loop.
        """
        self.is_running = True
        logger.info(f"GridSchedulerWorker started. Interval: {self.tick_interval_seconds}s")
        while self.is_running:
            await self.process_grid_tick("ercot")
            await asyncio.sleep(self.tick_interval_seconds)

    def stop(self):
        """
        Stops the background scheduler worker loop.
        """
        self.is_running = False
        logger.info("GridSchedulerWorker stopped.")
