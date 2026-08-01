-- High-Performance Time-Series Analytics API Database Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Raw Events Table
CREATE TABLE IF NOT EXISTS raw_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_raw_events_timestamp ON raw_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_raw_events_type ON raw_events (event_type);

-- Hourly Aggregated Stats Table
CREATE TABLE IF NOT EXISTS hourly_stats (
    id BIGSERIAL PRIMARY KEY,
    bucket_time TIMESTAMPTZ NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_count BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_hourly_bucket_type UNIQUE (bucket_time, event_type)
);

CREATE INDEX IF NOT EXISTS idx_hourly_stats_bucket ON hourly_stats (bucket_time, event_type);

-- Daily Aggregated Stats Table
CREATE TABLE IF NOT EXISTS daily_stats (
    id BIGSERIAL PRIMARY KEY,
    bucket_time TIMESTAMPTZ NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_count BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_daily_bucket_type UNIQUE (bucket_time, event_type)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_bucket ON daily_stats (bucket_time, event_type);
