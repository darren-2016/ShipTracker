// src/controllers/vesselController.js
const pool = require('../config/db');

/**
 * GET /api/vessels
 * Fetches the current live fleet snapshot from our database view
 */
async function getLiveFleet(req, res) {
    try {
        // Query our ultra-fast DISTINCT ON database view
        const queryText = `
            SELECT name, mmsi, latitude, longitude, speed_knots, heading, last_updated 
            FROM current_fleet_positions
            ORDER BY last_updated DESC
        `;
        
        const { rows } = await pool.query(queryText);
        
        // Return a clean JSON response payload to the client
        return res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
        });
    } catch (err) {
        console.error("API Server Internal Error:", err.message);
        return res.status(500).json({
            success: false,
            error: "Failed to retrieve tracking data telemetry snapshot."
        });
    }
}

module.exports = { getLiveFleet };