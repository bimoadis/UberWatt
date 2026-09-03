"""
ÜberWatt Signal Engine Module
Implements the 8% deadband hysteresis logic, state tracking, and daily edge calculation.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Tuple


@dataclass
class PriceTick:
    grid: str
    node: str
    interval_start: datetime
    interval_minutes: int
    price: float
    currency: str
    source_url: str
    fetched_at: datetime


@dataclass
class SignalFlip:
    grid: str
    node: str
    interval_start: datetime
    price: float
    currency: str
    breakeven: float
    signal: str  # 'RUN' or 'STOP'
    detected_at: datetime


class SignalEngine:
    """
    State-based signal engine using hysteresis and smoothing deadband (8%).
    Rule:
    - enter RUN  when price < (breakeven - band) for 2 consecutive intervals
    - enter STOP when price >= (breakeven + band) for 2 consecutive intervals
    - hold current state otherwise
    """

    def __init__(self, default_breakeven: float = 45.0, deadband_ratio: float = 0.08):
        self.default_breakeven = default_breakeven
        self.deadband_ratio = deadband_ratio

    def calculate_deadband(self, breakeven: float) -> Tuple[float, float]:
        """
        Calculates (run_threshold, stop_threshold) for a given breakeven.
        band = 0.08 * breakeven
        RUN threshold  = breakeven - band
        STOP threshold = breakeven + band
        """
        band = self.deadband_ratio * breakeven
        return (breakeven - band, breakeven + band)

    def evaluate_tick(
        self,
        current_state: str,  # 'RUN' or 'STOP'
        current_tick: PriceTick,
        previous_tick: Optional[PriceTick],
        breakeven: Optional[float] = None,
    ) -> Tuple[str, bool, Optional[SignalFlip]]:
        """
        Evaluates a new PriceTick against the current state and hysteresis rule.

        Returns:
            (new_state, is_flip, signal_flip_object_if_flipped)
        """
        be = breakeven if breakeven is not None else self.default_breakeven
        run_threshold, stop_threshold = self.calculate_deadband(be)

        new_state = current_state
        is_flip = False
        signal_flip = None

        if current_state == "STOP":
            # Candidate for RUN: price < (breakeven - band)
            if current_tick.price < run_threshold:
                # Check 2 consecutive intervals
                if previous_tick and previous_tick.price < run_threshold:
                    new_state = "RUN"
                    is_flip = True

        elif current_state == "RUN":
            # Candidate for STOP: price >= (breakeven + band)
            if current_tick.price >= stop_threshold:
                # Check 2 consecutive intervals
                if previous_tick and previous_tick.price >= stop_threshold:
                    new_state = "STOP"
                    is_flip = True

        if is_flip:
            signal_flip = SignalFlip(
                grid=current_tick.grid,
                node=current_tick.node,
                interval_start=current_tick.interval_start,
                price=current_tick.price,
                currency=current_tick.currency,
                breakeven=be,
                signal=new_state,
                detected_at=current_tick.fetched_at,
            )

        return (new_state, is_flip, signal_flip)

    @staticmethod
    def calculate_daily_edge(
        price_blocks: List[float],
        breakeven: float,
        mw: float,
        block_duration_hours: float = 0.5,
    ) -> dict:
        """
        Calculates daily economics based on 5-min or 30-min price blocks.
        Formula matches DEV BRIEF Section 4.3:
        run_hours  = block_duration_hours * count(blocks where price < breakeven)
        stop_hours = block_duration_hours * count(blocks where price >= breakeven)
        daily_edge = sum((price - breakeven) * mw * block_duration_hours for blocks where price >= breakeven)
        """
        run_count = 0
        stop_count = 0
        daily_edge = 0.0

        for price in price_blocks:
            if price < breakeven:
                run_count += 1
            else:
                stop_count += 1
                daily_edge += (price - breakeven) * mw * block_duration_hours

        return {
            "run_hours": run_count * block_duration_hours,
            "stop_hours": stop_count * block_duration_hours,
            "daily_edge": round(daily_edge, 2),
            "breakeven": breakeven,
            "mw": mw,
        }
