// src/index.js
require('dotenv').config(); // <-- THIS MUST BE AT THE VERY TOP

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws'); // Ensure 'ws' is installed for connecting to aisstream
const app = express();
const PORT = 3000;

app.use(cors());

// Global state variables
let aisStreamSocket = null;
let latestVessels = []; // Holds your current in-memory cache of ships
let disconnectTimeout = null;

// Function to safely spin up the aisstream connection
function connectToAISStream() {
    if (aisStreamSocket && aisStreamSocket.readyState === WebSocket.OPEN) return;

    console.log("⚡ Frontend detected! Activating live aisstream.io connection...");
    
    aisStreamSocket = new WebSocket("wss://stream.aisstream.io/v0/stream");    
    
aisStreamSocket.onopen = function () {
        // DIAGNOSTIC LOG 1: Check what key is actually being sent
        console.log(`🔑 Sending API Key suffix: ...${String(process.env.AISSTREAM_API_KEY).slice(-4)}`);

        const subscriptionPayload = {
            APIKey: process.env.AISSTREAM_API_KEY, 
            BoundingBoxes: [[[-90, -180], [90, 180]]], 
            FilterMessageTypes: ["PositionReport"] 
        };
        aisStreamSocket.send(JSON.stringify(subscriptionPayload));
        console.log("📡 Subscription payload sent to stream endpoint.");
    };

    aisStreamSocket.onmessage = function (event) {
        // DIAGNOSTIC LOG 2: Confirm if ANY raw data is hitting your machine
        console.log("📥 Raw packet intercepted from aisstream.io!");

        try {
            const aisMessage = JSON.parse(event.data);
            
            if (aisMessage.MetaData && aisMessage.Message && aisMessage.Message.PositionReport) {
                const { MMSI, ShipName } = aisMessage.MetaData;
                const { Latitude, Longitude, TrueHeading, Sog } = aisMessage.Message.PositionReport;

                if (!Latitude || !Longitude) return;

                const updatedVessel = {
                    mmsi: MMSI,
                    name: ShipName ? ShipName.trim() : `MMSI: ${MMSI}`,
                    latitude: parseFloat(Latitude),
                    longitude: parseFloat(Longitude),
                    speed_knots: Sog || 0.0,
                    heading: TrueHeading || 0
                };

                const existingIndex = latestVessels.findIndex(v => v.mmsi === MMSI);
                if (existingIndex > -1) {
                    latestVessels[existingIndex] = updatedVessel;
                } else {
                    latestVessels.push(updatedVessel);
                }
                
                // DIAGNOSTIC LOG 3: Confirm successful tracking updates
                console.log(`🚢 Cache updated. Total fleet size: ${latestVessels.length}`);
            }
        } catch (err) {
            console.error("❌ Parser issue:", err.message);
        }
    };

    aisStreamSocket.onclose = function () {
        console.log("🛑 aisstream.io connection closed safely.");
    };

    aisStreamSocket.onerror = function (err) {
        console.error("AIS Stream error intercepted:", err);
    };
}

// Function to safely spin down the connection
function disconnectFromAISStream() {
    if (aisStreamSocket) {
        console.log("⏳ Idle timeout reached (No frontends active). Sleeping stream...");
        aisStreamSocket.close();
        aisStreamSocket = null;
    }
}

// THE HEARTBEAT ENDPOINT
app.get('/api/vessels', (req, res) => {
    // 1. Reset the inactivity timer every time the frontend requests data
    clearTimeout(disconnectTimeout);
    
    // 2. Ensure the upstream source is actively flowing
    connectToAISStream();

    // 3. Set a 35-second timer. If no new requests hit this endpoint, shut down the stream.
    disconnectTimeout = setTimeout(() => {
        disconnectFromAISStream();
    }, 35000); // 35 seconds gives a 2-cycle grace window for a 15s frontend poll

    // 4. Instantly hand back the currently cached records to the map
    res.json({ success: true, data: latestVessels });
});

app.listen(PORT, () => {
    console.log(`Backend cruise telemetry proxy running on port ${PORT}`);
});