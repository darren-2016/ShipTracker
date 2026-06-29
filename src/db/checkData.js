// src/db/checkData.js
require('dotenv').config();
const pool = require('../config/db');

async function sanityCheck() {
    try {
        console.log("=== CONNECTING TO DATABASE ===");
        
        // 1. Check total rows in the ledger
        const countRes = await pool.query('SELECT COUNT(*) FROM vessel_positions');
        console.log(`Total tracking pings logged: ${countRes.rows[0].count}`);

        // 2. Query our unified view to see the latest position of each distinct ship
        console.log("\n=== LATEST CAPTURED FLEET POSITIONS ===");
        const fleetRes = await pool.query(`
            SELECT name, mmsi, latitude, longitude, speed_knots, last_updated 
            FROM current_fleet_positions 
            LIMIT 10
        `);

        if (fleetRes.rows.length === 0) {
            console.log("No vessels captured yet. Make sure your `node src/index.js` script runs for a few seconds first!");
        } else {
            console.table(fleetRes.rows);
        }

    } catch (err) {
        console.error("Database read error:", err.message);
    } finally {
        // Cleanly close the pool connection so the script exits back to the terminal
        await pool.end();
        console.log("\n=== CHECK COMPLETE ===");
    }
}

sanityCheck();
