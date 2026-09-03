"""
Unit tests for ÜberWatt Signal Engine (Hysteresis & Edge Calculation)
"""
from datetime import datetime, timezone
from app.engine.signal_engine import SignalEngine, PriceTick


def make_tick(price: float, fetched_at: datetime = None) -> PriceTick:
    now = fetched_at or datetime.now(timezone.utc)
    return PriceTick(
        grid="ercot",
        node="HB_WEST",
        interval_start=now,
        interval_minutes=5,
        price=price,
        currency="USD",
        source_url="https://api.ercot.com/test",
        fetched_at=now,
    )


def test_deadband_calculation():
    engine = SignalEngine(default_breakeven=45.0, deadband_ratio=0.08)
    run_threshold, stop_threshold = engine.calculate_deadband(45.0)
    # 8% of 45 is 3.6 -> run: 41.4, stop: 48.6
    assert round(run_threshold, 2) == 41.4
    assert round(stop_threshold, 2) == 48.6


def test_hysteresis_single_interval_does_not_flip():
    engine = SignalEngine(default_breakeven=45.0)

    # Initial state is STOP
    state = "STOP"

    # Price drops below 41.4 to 35, but only for 1 interval (no previous tick)
    tick1 = make_tick(35.0)
    state, flipped, signal = engine.evaluate_tick(state, tick1, previous_tick=None)
    assert state == "STOP"
    assert flipped is False
    assert signal is None


def test_hysteresis_two_consecutive_intervals_flips_to_run():
    engine = SignalEngine(default_breakeven=45.0)
    state = "STOP"

    tick1 = make_tick(35.0)
    tick2 = make_tick(38.0)

    # Second interval evaluates with tick1 as previous
    state, flipped, signal = engine.evaluate_tick(
        state, tick2, previous_tick=tick1
    )
    assert state == "RUN"
    assert flipped is True
    assert signal is not None
    assert signal.signal == "RUN"
    assert signal.price == 38.0


def test_hysteresis_hold_state_within_deadband():
    engine = SignalEngine(default_breakeven=45.0)
    state = "RUN"

    # Price is 46.0 (between 41.4 and 48.6) -> within deadband
    tick1 = make_tick(46.0)
    tick2 = make_tick(47.0)

    state, flipped, _ = engine.evaluate_tick(state, tick2, previous_tick=tick1)
    assert state == "RUN"
    assert flipped is False


def test_daily_edge_calculation_matches_brief():
    # Prices across 4 blocks (0.5 hours each): [20.0, 30.0, 60.0, 100.0]
    # Breakeven = 45.0, MW = 50
    # Blocks < 45: 20, 30 -> 2 blocks = 1.0 run_hour
    # Blocks >= 45: 60, 100 -> 2 blocks = 1.0 stop_hour
    # Daily edge = (60 - 45)*50*0.5 + (100 - 45)*50*0.5
    #            = 15 * 25 + 55 * 25 = 375 + 1375 = 1750.0

    prices = [20.0, 30.0, 60.0, 100.0]
    res = SignalEngine.calculate_daily_edge(
        prices, breakeven=45.0, mw=50.0, block_duration_hours=0.5
    )

    assert res["run_hours"] == 1.0
    assert res["stop_hours"] == 1.0
    assert res["daily_edge"] == 1750.0
