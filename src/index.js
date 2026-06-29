// src/index.js

// 1. THIS MUST BE LINE 1. It loads your .env variables before anything else runs!
require('dotenv').config(); 

// 2. Now import your modules safely
const { connectAISStream } = require('./services/aisWorker');

console.log("Initializing Cruise Ship Tracking Architecture...");

// 3. Fire up your live WebSocket stream
connectAISStream();
