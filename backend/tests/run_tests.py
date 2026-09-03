"""
Test runner for ÜberWatt backend using standard library unittest.
"""
import unittest
import sys
import os

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
tests_dir = os.path.dirname(__file__)

if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if tests_dir not in sys.path:
    sys.path.insert(0, tests_dir)

from test_signal_engine import (
    test_deadband_calculation,
    test_hysteresis_single_interval_does_not_flip,
    test_hysteresis_two_consecutive_intervals_flips_to_run,
    test_hysteresis_hold_state_within_deadband,
    test_daily_edge_calculation_matches_brief,
)
from test_solana_anchor import (
    test_canonical_json_sorting_and_formatting,
    test_digest_and_memo_prefix,
)
from test_ercot_poller import TestERCOTPoller
from test_api import TestFastAPIEndpoints
from test_scheduler_solana import TestSprint2SchedulerAndSolana
from test_sprint4 import TestSprint4Features
from test_sprint5 import TestSprint5StalenessAndProduction


class TestSignalEngine(unittest.TestCase):
    def test_deadband(self):
        test_deadband_calculation()

    def test_single_interval(self):
        test_hysteresis_single_interval_does_not_flip()

    def test_two_consecutive(self):
        test_hysteresis_two_consecutive_intervals_flips_to_run()

    def test_hold_state(self):
        test_hysteresis_hold_state_within_deadband()

    def test_daily_edge(self):
        test_daily_edge_calculation_matches_brief()


class TestSolanaAnchor(unittest.TestCase):
    def test_canonical_json(self):
        test_canonical_json_sorting_and_formatting()

    def test_digest(self):
        test_digest_and_memo_prefix()


if __name__ == "__main__":
    unittest.main()
