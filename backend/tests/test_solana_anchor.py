"""
Unit tests for Solana Anchor Proof Layer (Canonical JSON & SHA-256 Digest)
"""
from app.solana.anchor import (
    compute_signal_digest,
    create_memo_instruction_string,
    generate_canonical_json,
)


def test_canonical_json_sorting_and_formatting():
    # Unsorted keys with arbitrary order
    payload = {
        "signal": "RUN",
        "grid": "ercot",
        "price": 23.41,
        "v": 1,
        "node": "HB_WEST",
        "currency": "USD",
        "breakeven": 45.0,
        "interval_start": "2026-09-01T14:05:00Z",
        "detected_at": "2026-09-01T14:11:03Z",
    }

    canonical_bytes = generate_canonical_json(payload)
    canonical_str = canonical_bytes.decode("utf-8")

    # Expected: sorted keys, no whitespace after colons or commas
    expected_str = '{"breakeven":45.0,"currency":"USD","detected_at":"2026-09-01T14:11:03Z","grid":"ercot","interval_start":"2026-09-01T14:05:00Z","node":"HB_WEST","price":23.41,"signal":"RUN","v":1}'
    assert canonical_str == expected_str


def test_digest_and_memo_prefix():
    payload = {
        "v": 1,
        "grid": "ercot",
        "node": "HB_WEST",
        "interval_start": "2026-09-01T14:05:00Z",
        "price": 23.41,
        "currency": "USD",
        "breakeven": 45.0,
        "signal": "RUN",
        "detected_at": "2026-09-01T14:11:03Z",
    }

    digest = compute_signal_digest(payload)
    memo = create_memo_instruction_string(digest)

    assert len(digest) == 64  # SHA-256 hex string is 64 chars
    assert memo.startswith("UW1:")
    assert memo == f"UW1:{digest}"
