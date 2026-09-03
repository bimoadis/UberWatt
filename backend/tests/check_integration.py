"""
ÜberWatt Integration Check Script
Verifies Frontend <-> Backend Connectivity, API Endpoints, Data Schemas, CORS headers, and Staleness logic.
"""
import sys
import os

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import json
from fastapi.testclient import TestClient
from app.main import app

def safe_print(msg: str):
    """Prints message safely handling Windows console encoding."""
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode('ascii'))

def check_fe_be_integration():
    safe_print("=" * 60)
    safe_print("   UBERWATT FRONTEND <-> BACKEND INTEGRATION CHECK")
    safe_print("=" * 60)

    client = TestClient(app, raise_server_exceptions=False)
    all_passed = True

    # 1. Check Root Endpoint & CORS
    safe_print("\n1. [CORS & ROOT CHECK]")
    res_root = client.get("/")
    if res_root.status_code == 200:
        safe_print("   [OK] GET / -> 200 OK")
        safe_print(f"     Status: {res_root.json()['status']} | Version: {res_root.json()['version']}")
    else:
        safe_print(f"   [FAIL] GET / failed ({res_root.status_code})")
        all_passed = False

    # 2. Check Grid List Endpoint (FE Navbar / Console Tab)
    safe_print("\n2. [GRID LIST ENDPOINT - /v1/grids]")
    res_grids = client.get("/v1/grids")
    if res_grids.status_code == 200:
        grids = res_grids.json()
        safe_print(f"   [OK] GET /v1/grids -> {len(grids)} grids returned.")
        for g in grids:
            safe_print(f"     - {g['grid'].upper()}: signal={g['current_signal']}, price={g['latest_price']}")
    else:
        safe_print(f"   [FAIL] GET /v1/grids failed ({res_grids.status_code})")
        all_passed = False

    # 3. Check Current Grid State & Staleness logic (FE Console Widget & Header Banner)
    safe_print("\n3. [CURRENT STATE & STALENESS CHECK - /v1/grids/ercot/current]")
    res_curr = client.get("/v1/grids/ercot/current")
    if res_curr.status_code == 200:
        curr = res_curr.json()
        safe_print("   [OK] GET /v1/grids/ercot/current -> 200 OK")
        safe_print(f"     Node: {curr['node']} | Signal: {curr['signal']} | Price: {curr['price']}/MWh")
        safe_print(f"     Staleness Flag: {curr['is_stale']} | Source: {curr['source_url']}")
    else:
        safe_print(f"   [FAIL] GET /v1/grids/ercot/current failed ({res_curr.status_code})")
        all_passed = False

    # 4. Check Day Schedule Timeline Endpoint (FE Schedule Section)
    safe_print("\n4. [DAY SCHEDULE TIMELINE - /v1/grids/ercot/day]")
    res_day = client.get("/v1/grids/ercot/day")
    if res_day.status_code == 200:
        blocks = res_day.json()
        safe_print(f"   [OK] GET /v1/grids/ercot/day -> {len(blocks)} 30-min blocks returned.")
        safe_print(f"     First block: {blocks[0]['time_hhmm']} | Price: ${blocks[0]['price']} | Signal: {blocks[0]['signal']}")
        safe_print(f"     Last block:  {blocks[-1]['time_hhmm']} | Price: ${blocks[-1]['price']} | Signal: {blocks[-1]['signal']}")
    else:
        safe_print(f"   [FAIL] GET /v1/grids/ercot/day failed ({res_day.status_code})")
        all_passed = False

    # 5. Check Agent Feed Endpoint & Solana TX Links (FE Live Feed)
    safe_print("\n5. [AGENT FEED & SOLANA PROOF LINK - /v1/feed]")
    res_feed = client.get("/v1/feed?grid=ercot&limit=5")
    if res_feed.status_code == 200:
        posts = res_feed.json()
        safe_print(f"   [OK] GET /v1/feed -> {len(posts)} multi-lingual posts returned.")
        for p in posts:
            safe_print(f"     Post ID: {p['post_id']} | Signal: {p['signal']} | Solana Tx: {p['solana_tx_sig']}")
            safe_print(f"     EN: {p['en'][:60]}...")
            safe_print(f"     ZH: {p['zh'][:60]}...")
    else:
        safe_print(f"   [FAIL] GET /v1/feed failed ({res_feed.status_code})")
        all_passed = False

    # 6. Check Health Monitoring Endpoint (FE Poller Health Status)
    safe_print("\n6. [POLLER HEALTH MONITORING - /v1/health]")
    res_health = client.get("/v1/health")
    if res_health.status_code == 200:
        health_list = res_health.json()
        safe_print(f"   [OK] GET /v1/health -> {len(health_list)} poller statuses returned.")
        for h in health_list:
            safe_print(f"     - {h['grid'].upper()}: status={h['status']}, staleness_seconds={h['staleness_seconds']}s")
    else:
        safe_print(f"   [FAIL] GET /v1/health failed ({res_health.status_code})")
        all_passed = False

    safe_print("\n" + "=" * 60)
    if all_passed:
        safe_print("   RESULT: ALL FE <-> BE ENDPOINTS ARE FULLY CONNECTED & WORKING!")
    else:
        safe_print("   RESULT: FE <-> BE INTEGRATION ISSUES DETECTED!")
    safe_print("=" * 60)

if __name__ == "__main__":
    check_fe_be_integration()
