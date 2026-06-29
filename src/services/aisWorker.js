// src/services/aisWorker.js
const WebSocket = require('ws');
const pool = require('../config/db');

const API_KEY = process.env.AISSTREAM_API_KEY;

function connectAISStream() {
    const url = "wss://stream.aisstream.io/v0/stream";
    console.log(`Attempting connection to ${url}...`);

    const ws = new WebSocket(url);

    ws.on('open', () => {
        console.log("WebSocket Handshake Success!");

        const subscriptionMessage = {
            APIKey: API_KEY,
            BoundingBoxes: [
                [[-90, -180], [90, 180]]
            ],
            FilterMessageTypes: ["PositionReport"]
        };

        ws.send(JSON.stringify(subscriptionMessage));
        console.log("Subscription registration payload transmitted.");
    });

    ws.on('message', async (data) => {
        try {
            const aisMessage = JSON.parse(data.toString());
            
            if (aisMessage.MessageType === "PositionReport") {
                const meta = aisMessage.MetaData;
                const report = aisMessage.Message.PositionReport;
                
                const mmsi = parseInt(meta.MMSI, 10);
                const shipName = meta.ShipName ? meta.ShipName.trim().replace(/@+/g, '') : 'Unknown';
                
                // Truncate lat/long coordinates to 6 decimals to match NUMERIC(9,6) perfectly
                const lat = parseFloat(parseFloat(report.Latitude).toFixed(6));
                const lon = parseFloat(parseFloat(report.Longitude).toFixed(6));
                
                const speed = report.Sog ? parseFloat(report.Sog) : 0.0;
                const heading = report.Cog ? parseInt(report.Cog, 10) : 0;
                // Fallback to current machine time if the stream payload leaves the timestamp blank
                const timestamp = meta.Timestamp || new Date().toISOString();

                console.log(`[INGESTING] ${shipName} (${mmsi}) | Lat: ${lat} | Lon: ${lon}`);

                // FIX: Instead of checking and dropping rows, we use an UPSERT.
                // We map imo_number to mmsi temporarily to meet the schema rules.
                const fallbackImo = mmsi;

                // Step A: Dynamically add or update the vessel registry profile
                await pool.query(
                    `INSERT INTO vessels (imo_number, mmsi, name, cruise_line)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (mmsi) DO UPDATE 
                     SET name = EXCLUDED.name, updated_at = NOW()`,
                    [fallbackImo, mmsi, shipName, 'Discovered Fleet']
                );

                // Step B: Record the coordinate telemetry log entries safely
                await pool.query(
                    `INSERT INTO vessel_positions (imo_number, latitude, longitude, speed_knots, heading, timestamp)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [fallbackImo, lat, lon, speed, heading, timestamp]
                );
            }
        } catch (err) {
            console.error("\n[!] Pipeline Ingestion Error Details:");
            console.error(`Message: ${err.message}`);
            console.error(`Stack: ${err.stack}\n`);
        }
    });
    
    ws.on('unexpected-response', (request, response) => {
        console.error(`Server rejected handshake. Status Code: ${response.statusCode}`);
    });

    ws.on('error', (error) => {
        console.error("WebSocket transport error:", error.message);
    });

    ws.on('close', (code, reason) => {
        console.log(`Connection dropped (${code}). Reconnecting in 5s...`);
        setTimeout(connectAISStream, 5000);
    });
}

module.exports = { connectAISStream };
