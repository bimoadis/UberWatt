# ÜberWatt — Developer Brief

**Version:** 1.0
**Status of the mockup:** `uberwatt-v2.html` is a design prototype. Every number in it is generated client-side by a simulation function. Nothing is connected to a real grid. Your job is to replace that simulation with real data without changing what the interface promises.

---

## 0. Read this first

The entire product rests on one claim: **the agent detected the signal before the outcome was known.** If that claim is not verifiable, this is just a chart with a token attached.

That is why the on-chain component (Section 5) is not decoration and is not optional. It is the only part of the system that cannot be faked after the fact. Build it in Milestone 1, not later.

Two things must never happen:
1. Publishing a signal timestamped earlier than it was actually computed.
2. Showing simulated numbers in any view that a user could mistake for live data.

If the data pipeline is down, the UI must say so explicitly. Never fall back to simulated values.

---

## 1. Scope

### Milestone 1 (ship this first, alone)
- ERCOT only, one settlement point to start (`HB_WEST` or `LZ_WEST`)
- Ingest real-time prices every 5 minutes
- Detect run/stop signal flips
- Write a hash of each signal to Solana at emission
- Public feed (web page + X account) posting each flip with price and source reference
- Public archive of every past signal with its on-chain transaction signature

**Do not start Milestone 2 until Milestone 1 has run unattended for 30 days with a published uptime figure.**

### Milestone 2
- CAISO integration
- Live dashboard replacing the mockup's simulation
- Historical archive API (open, unauthenticated, rate-limited)

### Milestone 3
- Webhook delivery with sub-60-second latency
- Wallet-based token gating for real-time tier
- Staking contract for grid-selection votes

### Milestone 4
- Community corrections with reputation scoring
- Additional grids per vote outcome

---

## 2. Architecture

```
┌─────────────────┐
│  Grid pollers   │  one worker per grid, 5-min tick
│  (ERCOT, CAISO) │
└────────┬────────┘
         │ normalized PriceTick
         ▼
┌─────────────────┐     ┌──────────────────┐
│  TimescaleDB    │◄────┤  Signal engine   │
│  (price_ticks,  │     │  hysteresis +    │
│   signals)      │     │  debounce        │
└────────┬────────┘     └────────┬─────────┘
         │                       │ on flip
         │                       ▼
         │              ┌──────────────────┐
         │              │  Anchor worker   │
         │              │  → Solana memo   │
         │              └────────┬─────────┘
         │                       │ tx signature
         │◄──────────────────────┘
         ▼
┌─────────────────┐     ┌──────────────────┐
│  REST API       │────►│  Frontend + feed │
│  (FastAPI/Nest) │     │  + webhooks + X  │
└─────────────────┘     └──────────────────┘
```

**Recommended stack:** Python (FastAPI + pandas) for ingestion and the signal engine — grid data arrives as CSV/XML and pandas handles it with far less code. Node/TypeScript is fine if the team prefers one language; the tradeoff is more parsing code.

**Database:** Postgres with TimescaleDB. Price data is a textbook hypertable. Do not use a document store.

**Cache:** Redis for current state per grid/node, so the dashboard never hits Postgres on page load.

**Hosting:** anything with reliable cron. The pollers must not miss intervals — a missed interval is a missed signal, and a missed signal is a broken accuracy record.

---

## 3. Data ingestion

### 3.1 ERCOT (Milestone 1)

Base URL: `https://api.ercot.com`

Authentication has two parts, both required on every request:
- `Authorization: Bearer <id_token>` — obtained via OAuth2 ROPC POST. **Tokens expire after one hour and cannot be refreshed.** Request a new one; do not build a refresh flow, it does not exist.
- `Ocp-Apim-Subscription-Key: <subscription_key>`

Register at `developer.ercot.com` (developer portal) and `apiexplorer.ercot.com` (endpoint specs, and where the subscription key comes from). Accept the Terms of Use — note that ERCOT imposes rate limits and reserves the right to tighten them.

**What to pull:**
- Real-time settlement point prices (SCED, 5-minute intervals) for the chosen settlement point
- Day-ahead prices for the forward view
- System-wide load and renewable output for the "grid load" chart view

**Important:** the earliest data available through the API is Dec 11, 2023. Anything older must come from the Data Access Portal (`data.ercot.com`) as manual file downloads. If the historical archive needs to go back further, plan a one-time bulk backfill through the portal.

Also note ERCOT's own disclaimer: the public API is explicitly not warranted for forecasting or scheduling purposes. This does not block us — but it does mean our terms of service must not promise accuracy we cannot control. Legal will need to mirror that language.

### 3.2 CAISO (Milestone 2)

Base URL: `https://oasis.caiso.com/oasisapi/SingleZip`

No authentication. Returns a **ZIP archive** containing CSV or XML — you must unzip in memory before parsing.

Example (real-time interval LMP):
```
https://oasis.caiso.com/oasisapi/SingleZip
  ?queryname=PRC_INTVL_LMP
  &startdatetime=20260401T07:00-0000
  &enddatetime=20260402T07:00-0000
  &version=2
  &market_run_id=RTM
  &resultformat=6
  &node=DLAP_PGAE-APND
```

- `resultformat=6` returns CSV; omit it for XML
- Timestamps are GMT with an explicit offset — get this wrong and everything shifts
- Only one trading day per request
- Use `node=` for specific nodes or `grp_type=` for groups, not both

CAISO is aggressive about throttling. Space requests out and cache hard.

### 3.3 Other grids (later milestones)
- **ENTSO-E Transparency Platform** — REST API, requires a free security token via account request
- **AEMO** — NEMWeb publishes static CSV files on a fixed schedule; no API key, but you scrape a directory listing
- **Northwest China** — **flag this to the founder.** There is no equivalent public real-time API. Data comes from periodic regional grid disclosures, not a live feed. Do not commit to a China integration on the same terms as ERCOT/CAISO. The mockup shows it; the roadmap should not promise it until someone has confirmed a data path.

### 3.4 Normalization

Every poller emits the same shape:

```python
PriceTick = {
  "grid": "ercot",
  "node": "HB_WEST",
  "interval_start": "2026-09-01T14:05:00Z",  # UTC, always
  "interval_minutes": 5,
  "price": 23.41,          # per MWh, in the grid's native currency
  "currency": "USD",
  "source_url": "https://api.ercot.com/...",  # exact call that produced this
  "fetched_at": "2026-09-01T14:06:12Z"
}
```

Store `source_url` and `fetched_at` on every row. They are what make the archive auditable, and `fetched_at` minus `interval_start` is our real detection latency — publish it.

---

## 4. Signal engine

### 4.1 The core rule

A signal is a **state**, not an event. State is `RUN` or `STOP`, per grid/node, relative to a breakeven price.

```
RUN   := price < breakeven
STOP  := price >= breakeven
```

The public feed uses a **reference breakeven** (start with $45/MWh for ERCOT — a plausible mid-range miner all-in cost). Authenticated users get signals computed against their own configured breakeven.

### 4.2 Hysteresis and debounce — do not skip this

Raw 5-minute prices oscillate around any threshold. Without smoothing the agent will post twenty flips an hour and destroy its own credibility.

```
band = 0.08 * breakeven          # 8% deadband

enter RUN  when price < (breakeven - band) for 2 consecutive intervals
enter STOP when price > (breakeven + band) for 2 consecutive intervals
otherwise: hold current state
```

This means a real flip is confirmed within ~10 minutes. State that latency honestly in the UI; do not claim instant detection.

Log every *candidate* flip that failed to confirm. If the deadband is tuned wrong you will only find out from those logs.

### 4.3 Economics shown to the user

These formulas must match the mockup exactly. The mockup had a double-counting bug that was fixed — **do not reintroduce it.**

```python
run_hours  = 0.5 * count(blocks where price < breakeven)
stop_hours = 0.5 * count(blocks where price >= breakeven)

# Edge vs running 24/7 = ONLY the losses avoided by shutting down.
# Running 24/7 also captures the cheap hours, so cheap-hour gains
# must NOT be added here.
daily_edge = sum(
    (price - breakeven) * mw * 0.5
    for blocks where price >= breakeven
)
```

`mw` is the user's flexible load. Label the output as an estimate before fees, ramp losses, and any demand-response contract the user already has. It is a decision aid, not a settlement statement.

### 4.4 Curtailment (grid-load view)

The mockup derives curtailment synthetically. **Do not do this in production.** Use the operator's published curtailment/redispatch figures where they exist (CAISO publishes curtailment reports; ERCOT publishes constraint and redispatch data). If a grid does not publish it, show "not published" rather than a computed guess.

---

## 5. On-chain proof layer

### 5.1 What and why

At the moment a signal flip is confirmed, hash it and write the hash to Solana. This produces a public, timestamped, tamper-evident record that the call existed *before* the outcome was known. Everything else about the project's credibility derives from this.

### 5.2 Implementation

Use the **SPL Memo program**. No custom program needed for MVP. Cost is a few lamports per transaction — negligible even at hundreds of signals per day.

```python
payload = {
  "v": 1,
  "grid": "ercot",
  "node": "HB_WEST",
  "interval_start": "2026-09-01T14:05:00Z",
  "price": 23.41,
  "currency": "USD",
  "breakeven": 45.0,
  "signal": "RUN",
  "detected_at": "2026-09-01T14:11:03Z"
}

# canonical JSON: sorted keys, no whitespace, UTF-8
digest = sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode())
memo   = "UW1:" + digest.hexdigest()
```

Submit the memo, store the returned transaction signature on the `signals` row, and expose both the full payload and the signature through the API. Anyone can then recompute the hash from the payload and confirm it matches what was written on-chain, at the block time shown.

**Rules:**
- Write the anchor **before** publishing the signal anywhere else. If the anchor fails, retry; if it keeps failing, publish the signal marked `anchor_pending` and backfill — never silently publish unanchored.
- Never re-anchor a payload. If a payload was wrong, publish a correction as a new anchored record referencing the original digest. The archive is append-only.
- Keep the anchoring keypair in a KMS/secret manager, not in the repo or in env vars committed anywhere.

### 5.3 Batching (Milestone 3+)

If volume grows past a few thousand signals a day, switch to a Merkle root anchored every N minutes, with inclusion proofs served by the API. Do not build this until per-signal cost is actually a problem — it complicates verification for users, which is the whole point of the feature.

### 5.4 Accuracy scoreboard

Derived directly from the anchored record. For each past signal, compare against what the price actually did:

```
correct := (signal == RUN  and realized_price < breakeven)
        or (signal == STOP and realized_price >= breakeven)
```

Publish rolling 7/30/90-day accuracy per grid, plus median detection latency. Publish it even when it is bad — a project that shows its misses is doing something no other token in this category does, and that is the differentiator.

---

## 6. Backend API

Public and unauthenticated (rate-limited):

```
GET /v1/grids                          → list of grids, status, last tick time
GET /v1/grids/{grid}/current           → latest price, current signal state
GET /v1/grids/{grid}/day?date=         → 48 half-hour blocks for the schedule table
GET /v1/signals?grid=&from=&to=        → anchored signal history + tx signatures
GET /v1/accuracy?grid=&window=         → scoreboard
GET /v1/health                         → per-poller last success, staleness
```

Authenticated (token-gated, Milestone 3):

```
POST /v1/alerts                        → create webhook/telegram subscription
GET  /v1/stream                        → SSE of live flips
GET  /v1/archive/export?               → bulk historical download
```

### 6.1 Token gating via wallet signature

Do not build a subscription database keyed on emails.

1. `GET /v1/auth/nonce?wallet=<pubkey>` → returns a random nonce, valid 5 minutes
2. Client signs the nonce with the wallet
3. `POST /v1/auth/verify` with `{wallet, nonce, signature}` → server verifies the ed25519 signature
4. Server queries the wallet's $WATT balance via RPC `getTokenAccountsByOwner`
5. If balance >= threshold, issue a short-lived JWT (1 hour)
6. **Re-check the balance on every token refresh**, not just at first login

Cache balance lookups for ~5 minutes to avoid hammering the RPC. Use a paid RPC provider — public endpoints will rate-limit you at exactly the wrong moment.

---

## 7. Frontend

`uberwatt-v2.html` is a single self-contained file. Treat it as a **visual and interaction spec**, not as production code to extend. Rebuild it properly (Next.js or similar) with the same layout, palette, and copy.

### What is currently simulated and must be replaced

| In the mockup | Replace with |
|---|---|
| `build()` — the whole price/load model | `GET /v1/grids/{grid}/day` |
| `POSTS` — hardcoded agent messages | Generated from real signal flips, templated per language |
| `count('s1', 6120)` etc. — headline stats | Aggregates computed from the archive |
| Burn countdown | Real next-burn timestamp; link the previous burn's tx hash |
| Allocation percentages | Actual on-chain supply figures, linked to the mint address |

### Keep these as-is
- The breakeven and load sliders — client-side computation against fetched data is correct
- Chart rendering, responsive `metrics()` sizing, the price/load view toggle
- The three-language i18n structure (`T` object, `data-i` attributes)
- The demo-data warning banner — **repurpose it as a data-staleness banner**, do not delete it

### Non-negotiable UI states
- **Stale data:** if the last tick is older than 15 minutes, show a visible banner and grey the readouts. Do not extrapolate.
- **Poller down:** show which grid is down and when it was last healthy.
- **Anchor pending:** mark signals whose on-chain write has not confirmed.

### Accessibility (already handled in the mockup — keep it)
Contrast ratios meet AA, `prefers-reduced-motion` is respected, all controls are keyboard reachable with visible focus rings, and the chart carries an `aria-label`. Do not regress these during the rebuild.

---

## 8. The agent's public feed

Posts are generated from confirmed flips, not written by hand. Template per language (EN/DE/ZH), each carrying:
- the price and the breakeven it was measured against
- the grid and node
- a link to the archive entry with its Solana transaction signature

The voice is terse and data-first — number, then reading. Keep the German and Chinese versions as first-class, not machine-translated at request time; the phrasings in the mockup were written deliberately (note `弃风弃光` is the actual Chinese industry term and should be used).

**Rate limit the agent.** With hysteresis it should post roughly 2–6 times a day per grid. If it posts more, something is wrong with the deadband — alert on it.

---

## 9. Deployment and operations

- One worker per grid, each with independent health reporting
- Alert on: missed poll interval, anchor failure, >15 min data staleness, flip rate above threshold
- Publish uptime and median latency on the public page — these are the product's proof, not internal metrics
- Backfill job for gaps, clearly marked as backfilled in the archive (backfilled rows must **never** be anchored with a detection time they did not have)
- Structured logs with the source URL of every fetch

---

## 10. Explicitly out of scope

These were considered and deliberately rejected. Do not add them without a legal review first.

| Not building | Why |
|---|---|
| Revenue share / dividends to holders | Clearest securities-classification trigger in most jurisdictions. The weekly burn achieves value accrual without it. |
| Tokenized RECs or energy certificates | Heavily regulated. Requires real legal infrastructure and registry relationships. |
| NFT tiers | Complexity with no function the token threshold does not already serve. |
| Automated trading or load control on the user's behalf | Turns an information product into a regulated one, and puts us on the hook for their equipment. Signals out; the customer's controller acts. |
| Price prediction / forecasting claims | ERCOT's own terms disclaim fitness for forecasting. We report detected state, we do not forecast. |

---

## 11. Definition of done — Milestone 1

- [ ] ERCOT poller runs 30 days with <1% missed intervals, publicly reported
- [ ] Every signal flip has a Solana transaction signature, retrievable via API
- [ ] A third party can independently recompute any signal's hash from the published payload and verify it against the chain
- [ ] Public archive shows every signal ever emitted, including wrong ones
- [ ] Accuracy scoreboard is live and updates automatically
- [ ] Median detection latency published and under 10 minutes
- [ ] Dashboard shows a staleness banner when data is late, verified by deliberately stopping the poller
- [ ] No simulated value is reachable from any production view

---

## 12. Open questions for the founder

1. Which ERCOT settlement point is primary? Hub vs load zone changes who the product is for.
2. What is the reference breakeven for the public feed, and who signs off on changing it?
3. Is there a data path for Northwest China, or does that grid move to "exploratory" on the public roadmap?
4. Token launch sequencing — is the mint live before or after Milestone 1 ships? The brief assumes signals exist before gating does.
5. Who owns the legal review of the staking and burn mechanics, and in which jurisdiction?
