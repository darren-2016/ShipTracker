-- src/db/schema.sql

------------------------------------------------------------------
-- 1. VESSELS TABLE (The Core Registry)
------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vessels (
    imo_number      INT PRIMARY KEY,
    mmsi            INT UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    cruise_line     VARCHAR(100),
    gross_tonnage   INT,
    year_built      INT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

------------------------------------------------------------------
-- 2. VESSEL_POSITIONS TABLE (The Time-Series Telemetry Ledger)
------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vessel_positions (
    id              BIGSERIAL PRIMARY KEY,
    imo_number      INT NOT NULL,
    latitude        NUMERIC(9, 6) NOT NULL,
    longitude       NUMERIC(9, 6) NOT NULL,
    speed_knots     NUMERIC(4, 1),
    heading         INT,
    timestamp       TIMESTAMPTZ NOT NULL,
    received_at     TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT fk_vessel
        FOREIGN KEY(imo_number) 
        REFERENCES vessels(imo_number)
        ON DELETE CASCADE
);

------------------------------------------------------------------
-- 3. OPTIMIZATION INDEXES
------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_positions_imo_timestamp ON vessel_positions(imo_number, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_positions_timestamp ON vessel_positions(timestamp DESC);

------------------------------------------------------------------
-- 4. CURRENT FLEET POSITION VIEW (For the Map Frontend Later)
------------------------------------------------------------------
CREATE OR REPLACE VIEW current_fleet_positions AS
SELECT DISTINCT ON (v.imo_number)
    v.imo_number,
    v.mmsi,
    v.name,
    v.cruise_line,
    p.latitude,
    p.longitude,
    p.speed_knots,
    p.heading,
    p.timestamp AS last_updated
FROM vessels v
JOIN vessel_positions p ON v.imo_number = p.imo_number
ORDER BY v.imo_number, p.timestamp DESC;