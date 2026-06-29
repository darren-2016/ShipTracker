// backend/src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
app.use(cors());

let latestVessels = [];
let connectionStatus = 'offline'; // Track connection state: 'offline', 'connecting', 'online'
let reconnectDelay = 2000; // Base delay of 2 seconds
let aisStreamSocket = null;

// backend/src/index.js
// ... keep your initial Express setups, imports, and variables exactly as they are

function connectToAISStream() {
    if (aisStreamSocket) {
        aisStreamSocket.terminate();
    }

    console.log("📡 Attempting connection to aisstream.io...");
    connectionStatus = 'connecting';
    
    aisStreamSocket = new WebSocket("wss://stream.aisstream.io/v0/stream");

    let heartbeatInterval = null;
    let isAlive = true; // Track if the connection is ACTUALLY transmitting data

    aisStreamSocket.onopen = function () {
        console.log("📡 WebSocket channel established.");
        
        const subscriptionPayload = {
            APIKey: process.env.AISSTREAM_API_KEY, 
            BoundingBoxes: [[[-90, -180], [90, 180]]], 
            FilterMessageTypes: ["PositionReport"] 
        };
        
        aisStreamSocket.send(JSON.stringify(subscriptionPayload));
        connectionStatus = 'online';
        isAlive = true; // Reset life sign flag
        reconnectDelay = 2000;

        // Active Heartbeat Guard: Runs every 5 seconds
        heartbeatInterval = setInterval(() => {
            if (isAlive === false) {
                console.log("❌ Heartbeat missed! Remote stream is unresponsive. Terminating socket...");
                connectionStatus = 'offline';
                clearInterval(heartbeatInterval);
                return aisStreamSocket.terminate(); // Hard terminates the socket, triggering 'onclose' instantly
            }

            // Flag connection as unverified until the next pong arrives
            isAlive = false; 
            
            if (aisStreamSocket.readyState === WebSocket.OPEN) {
                aisStreamSocket.ping(); // Issue a low-level WebSocket ping challenge
            }
        }, 5000); // 5-second check window for snappy testing feedback
    };

    // Listen for the low-level PONG reply back from the aisstream server
    aisStreamSocket.on('pong', () => {
        isAlive = true; // Connection verified alive!
    });

    aisStreamSocket.onmessage = function (event) {
        // Mark as alive whenever fresh ship vectors are actively pouring in
        isAlive = true; 
        
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
            }
        } catch (err) {
            // Swallow bad parsing frames
        }
    };

    aisStreamSocket.onclose = function (e) {
        connectionStatus = 'offline';
        clearInterval(heartbeatInterval); // Clean up background interval timers
        
        console.log(`⚠️ Connection broken. Retrying in ${reconnectDelay / 1000}s...`);
        
        setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, 30000); 
            connectToAISStream();
        }, reconnectDelay);
    };

    aisStreamSocket.onerror = function (err) {
        console.error("❌ Stream socket error caught:", err.message);
        aisStreamSocket.close();
    };

// ... rest of your server setup remains exactly the same

    aisStreamSocket.onmessage = function (event) {
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
            }
        } catch (err) {
            // Safely swallow malformed individual frames
        }
    };

    // THE RECONNECTION LOOP CORE
    aisStreamSocket.onclose = function (e) {
        connectionStatus = 'offline';
        console.log(`⚠️ Connection to aisstream.io closed. Retrying in ${reconnectDelay / 1000}s... (Reason: ${e.reason || 'None'})`);
        
        setTimeout(() => {
            // Exponential backoff capped at 30 seconds max per retry
            reconnectDelay = Math.min(reconnectDelay * 2, 30000); 
            connectToAISStream();
        }, reconnectDelay);
    };

    aisStreamSocket.onerror = function (err) {
        console.error("❌ Stream socket error caught:", err.message);
        // let onclose handle the recovery cycle
        aisStreamSocket.close();
    };
}

// REST API Endpoints
app.get('/api/vessels', (req, res) => {
    // Send back both the telemetry array and the live engine health status status
    res.json({
        success: true,
        status: connectionStatus,
        data: latestVessels
    });
});

// Kick off the stream engine loop immediately on startup
connectToAISStream();

app.listen(3000, () => {
    console.log("🚀 Proxy API service running on port 3000");
});