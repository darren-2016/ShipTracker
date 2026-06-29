const WebSocket = require('ws');
const pool = require('../config/db'); // Import the database engine

// 1. DECLARE THE VARIABLE HERE (At file scope level)
const API_KEY = process.env.AISSTREAM_API_KEY;

function connectAISStream() {
    // ... your existing WebSocket setup ...
    
    // Inside ws.on('message'):
    // Look up the IMO using the incoming MMSI, then:
    // await pool.query('INSERT INTO vessel_positions ...');


        // The explicit v0 URL route
        const url = "wss://stream.aisstream.io/v0/stream";
        console.log(`Attempting connection to ${url}...`);
    
        const ws = new WebSocket(url);
    
        ws.on('open', () => {
            console.log("WebSocket Handshake Success!");
    
            // AISStream demands this EXACT naming/casing style for keys
            const subscriptionMessage = {
                APIKey: API_KEY,
                BoundingBoxes: [
                    [[-90, -180], [90, 180]] // Global bounding box
                ],
                FilterMessageTypes: ["PositionReport"] // Request position data frames
            };
    
            // Send immediately on connection open
            ws.send(JSON.stringify(subscriptionMessage));
            console.log("Subscription registration payload transmitted.");
        });
    
        ws.on('message', (data) => {
            try {
                // AISStream sends message strings that can be parsed directly to JSON
                const aisMessage = JSON.parse(data.toString());
                
                if (aisMessage.MessageType === "PositionReport") {
                    const meta = aisMessage.MetaData;
                    const report = aisMessage.Message.PositionReport;
    
                    // Simple check to focus on Passenger / Cruise ships (MMSI Ship Type codes 60-69)
                    // Often passed down in static reports, but let's check name presence
                    console.log(`[LIVE] ${meta.ShipName.trim()} (${meta.MMSI}) | Lat: ${report.Latitude} | Lon: ${report.Longitude}`);
                }
            } catch (err) {
                console.error("Data frame parse error:", err.message);
            }
        });
    
        ws.on('unexpected-response', (request, response) => {
            console.error(`Server rejected handshake. Status Code: ${response.statusCode}`);
            console.error(`Headers received:`, response.headers);
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
