// frontend/src/components/VesselMap.jsx
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Ship, RefreshCw } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

export default function VesselMap() {
    const mapRef = useRef(null);
    const [vessels, setVessels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isMapReady, setIsMapReady] = useState(false);

    // Helper: Safely format database coordinates into GeoJSON
    const convertToGeoJSON = (vesselData) => {
        const features = vesselData.map((vessel) => {
            const lat = parseFloat(vessel.latitude);
            const lon = parseFloat(vessel.longitude);
            
            if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                return null;
            }

            return {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [lon, lat]
                },
                properties: {
                    mmsi: vessel.mmsi,
                    name: vessel.name || 'Unknown Vessel',
                    speed: vessel.speed_knots || '0.0',
                    heading: vessel.heading || 0
                }
            };
        }).filter(Boolean);

        return { type: 'FeatureCollection', features };
    };

    const fetchVesselData = async () => {
        try {
            const response = await fetch('http://localhost:3000/api/vessels');
            if (!response.ok) throw new Error('API line disconnected.');
            const result = await response.json();
            
            const dataArray = (result && result.success && Array.isArray(result.data)) ? result.data : (Array.isArray(result) ? result : []);
            setVessels(dataArray);
            setError(null);
        } catch (err) {
            console.error("Telemetry fetch error:", err);
            setError("Stream syncing paused.");
        } finally {
            setLoading(false);
        }
    };

    // 1. Initial Mount: Trigger data fetch immediately
    useEffect(() => {
        fetchVesselData();
        const interval = setInterval(fetchVesselData, 15000);
        return () => clearInterval(interval);
    }, []);

    // 2. Map Initialization: Waits until the container div is strictly rendered on screen
    useEffect(() => {
        const containerCheck = document.getElementById('mapbox-canvas-viewport');
        if (mapRef.current || !containerCheck) return;

        console.log("DOM Anchor ready. Initializing Mapbox graphics context...");
        
        mapRef.current = new mapboxgl.Map({
            container: 'mapbox-canvas-viewport', // Mount directly to string ID to bypass ref drops
            style: 'mapbox://styles/mapbox/dark-v11', 
            center: [153.02, -27.47], 
            zoom: 2
        });

        const map = mapRef.current;
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');

        map.on('load', () => {
            console.log("Mapbox fully loaded style sheets.");
            
            map.addSource('vessels-source', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            map.addLayer({
                id: 'vessels-layer',
                type: 'circle',
                source: 'vessels-source',
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2, 6, 6, 12, 12],
                    'circle-color': '#38bdf8',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#0f172a'
                }
            });

            // Tooltip popup handling
            const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });

            map.on('mouseenter', 'vessels-layer', (e) => {
                map.getCanvas().style.cursor = 'pointer';
                const coordinates = e.features[0].geometry.coordinates.slice();
                const { name, mmsi, speed, heading } = e.features[0].properties;

                popup.setLngLat(coordinates).setHTML(`
                    <div style="font-family: sans-serif; padding: 4px; color: #1e293b; line-height: 1.4;">
                        <h3 style="margin: 0 0 4px 0; font-size: 13px; color: #0284c7; font-weight: bold;">${name}</h3>
                        <p style="margin: 0; font-size: 11px;"><b>MMSI:</b> ${mmsi}</p>
                        <p style="margin: 0; font-size: 11px;"><b>Speed:</b> ${speed} kts</p>
                        <p style="margin: 0; font-size: 11px;"><b>Heading:</b> ${heading}°</p>
                    </div>
                `).addTo(map);
            });

            map.on('mouseleave', 'vessels-layer', () => {
                map.getCanvas().style.cursor = '';
                popup.remove();
            });

            setIsMapReady(true);
        });

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []); // Run once on startup

    // 3. Vector Upload Handler: Fires dynamically when data is fresh AND map canvas is verified
    useEffect(() => {
        if (!mapRef.current || !isMapReady || vessels.length === 0) return;

        const map = mapRef.current;
        if (!map.isStyleLoaded()) return;

        const source = map.getSource('vessels-source');
        if (source) {
            console.log(`Uploading ${vessels.length} vessel arrays to GPU vector engine...`);
            source.setData(convertToGeoJSON(vessels));
        }
    }, [vessels, isMapReady]);

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#0f172a', margin: 0, padding: 0 }}>
            
            {/* Control HUD Widget */}
            <div style={{
                position: 'absolute', top: '20px', left: '20px', zIndex: 10,
                backgroundColor: 'rgba(15, 23, 42, 0.95)', padding: '16px', borderRadius: '8px',
                color: '#f8fafc', fontFamily: 'sans-serif', border: '1px solid #334155', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <Ship style={{ color: '#38bdf8' }} size={18} />
                    <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Discovered Fleet</h1>
                </div>
                
                {loading ? (
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0' }}>Syncing telemetry...</p>
                ) : (
                    <div>
                        <p style={{ fontSize: '12px', margin: '4px 0 8px 0', color: '#cbd5e1' }}>
                            Tracking <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{vessels.length}</span> live passenger vessels
                        </p>
                        <button onClick={fetchVesselData} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '5px 10px', borderRadius: '4px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#fff' }}>
                            <RefreshCw size={10} /> Sync Telemetry
                        </button>
                    </div>
                )}
                {error && <p style={{ fontSize: '12px', color: '#f87171', marginTop: '6px' }}>{error}</p>}
            </div>

            {/* Core Static ID Viewport Frame */}
            <div 
                id="mapbox-canvas-viewport" 
                style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 1 }} 
            />
        </div>
    );
}