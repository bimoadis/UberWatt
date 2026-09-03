-- 001_initial_schema.sql
-- ÜberWatt Database Initialization Script (PostgreSQL 16 + TimescaleDB)

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 1. Table: price_ticks (Hypertable for 5-minute grid settlement prices)
CREATE TABLE IF NOT EXISTS price_ticks (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    grid VARCHAR(20) NOT NULL,            -- 'ercot', 'caiso', etc.
    node VARCHAR(50) NOT NULL,            -- 'HB_WEST', 'LZ_WEST', etc.
    interval_start TIMESTAMPTZ NOT NULL,  -- UTC start of interval
    interval_minutes INT NOT NULL DEFAULT 5,
    price NUMERIC(12, 4) NOT NULL,        -- Settlement price in native currency
    currency VARCHAR(3) NOT NULL,         -- USD, EUR, AUD, CNY
    demand_mw NUMERIC(12, 2),             -- System-wide demand MW (if available)
    renewable_mw NUMERIC(12, 2),          -- Renewable generation MW (if available)
    curtailed_mw NUMERIC(12, 2),          -- Curtailed generation MW (if available)
    source_url TEXT NOT NULL,             -- Source API endpoint for auditability
    fetched_at TIMESTAMPTZ NOT NULL,      -- Exact timestamp data was fetched (latency tracking)
    PRIMARY KEY (id, interval_start)
);

-- Hypertable creation
SELECT create_hypertable('price_ticks', 'interval_start', if_not_exists => TRUE);

-- Indexing for fast queries
CREATE INDEX IF NOT EXISTS idx_price_ticks_grid_node_time ON price_ticks (grid, node, interval_start DESC);
CREATE INDEX IF NOT EXISTS idx_price_ticks_fetched_at ON price_ticks (fetched_at DESC);

-- 2. Table: candidate_signals (Tracks deadband candidate flips before 2-interval confirmation)
CREATE TABLE IF NOT EXISTS candidate_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grid VARCHAR(20) NOT NULL,
    node VARCHAR(50) NOT NULL,
    interval_start TIMESTAMPTZ NOT NULL,
    price NUMERIC(12, 4) NOT NULL,
    breakeven NUMERIC(12, 4) NOT NULL,
    candidate_state VARCHAR(4) NOT NULL CHECK (candidate_state IN ('RUN', 'STOP')),
    consecutive_count INT NOT NULL DEFAULT 1,
    confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_signals_lookup ON candidate_signals (grid, node, created_at DESC);

-- 3. Table: signals (Confirmed Signal Flips & Solana On-Chain Anchors)
CREATE TABLE IF NOT EXISTS signals (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    grid VARCHAR(20) NOT NULL,
    node VARCHAR(50) NOT NULL,
    interval_start TIMESTAMPTZ NOT NULL,
    price NUMERIC(12, 4) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    breakeven NUMERIC(12, 4) NOT NULL,     -- Reference breakeven price (e.g. 45.00)
    signal VARCHAR(4) NOT NULL CHECK (signal IN ('RUN', 'STOP')),
    detected_at TIMESTAMPTZ NOT NULL,      -- Latency tracking
    solana_tx_sig VARCHAR(88),             -- Base58 Solana transaction signature
    solana_digest VARCHAR(64) NOT NULL,    -- SHA-256 Hex Digest of canonical JSON
    anchor_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (anchor_status IN ('ANCHORED', 'PENDING', 'FAILED')),
    anchored_at TIMESTAMPTZ,
    is_backfill BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id, interval_start)
);

SELECT create_hypertable('signals', 'interval_start', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_signals_grid_node_detected ON signals (grid, node, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_tx_sig ON signals (solana_tx_sig) WHERE solana_tx_sig IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signals_digest ON signals (solana_digest);

-- 4. Table: poller_health (Poller operational health state per grid)
CREATE TABLE IF NOT EXISTS poller_health (
    grid VARCHAR(20) PRIMARY KEY,
    last_success_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    consecutive_failures INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'HEALTHY' CHECK (status IN ('HEALTHY', 'DEGRADED', 'DOWN')),
    error_message TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Table: accuracy_scores (Rolling accuracy scoreboard per grid)
CREATE TABLE IF NOT EXISTS accuracy_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grid VARCHAR(20) NOT NULL,
    window_days INT NOT NULL CHECK (window_days IN (7, 30, 90)),
    total_signals INT NOT NULL,
    correct_signals INT NOT NULL,
    accuracy_percentage NUMERIC(5, 2) NOT NULL,
    median_latency_seconds INT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_grid_window UNIQUE (grid, window_days)
);

-- Initial seed for poller health
INSERT INTO poller_health (grid, status) VALUES
    ('ercot', 'HEALTHY'),
    ('caiso', 'HEALTHY'),
    ('cnnw', 'DEGRADED'),
    ('entsoe', 'HEALTHY'),
    ('aemo', 'HEALTHY')
ON CONFLICT (grid) DO NOTHING;
