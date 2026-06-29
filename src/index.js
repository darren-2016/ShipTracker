// src/index.js
require('dotenv').config(); 
const express = require('express');
const { connectAISStream } = require('./services/aisWorker');
const { getLiveFleet } = require('./controllers/vesselController');

const app = express();
const PORT = process.env.PORT || 3000;

// Regular body parsing middleware 
app.use(express.json());

// ------------------------------------------------------------------
// 1. HTTP API ENDPOINTS (Phase 3 Backend)
// ------------------------------------------------------------------
app.get('/api/vessels', getLiveFleet);

// Simple health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: "UP", service: "Cruise Ship Tracking Engine" });
});

// ------------------------------------------------------------------
// 2. KICKSTART SERVER AND INGESTION AGENTS
// ------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 API Gateway active on: http://localhost:${PORT}`);
    console.log(`====================================================`);
    
    // Fire up your background WebSocket listener stream simultaneously
    console.log("Initializing Background Live Ingestion Engine...");
    connectAISStream();
});