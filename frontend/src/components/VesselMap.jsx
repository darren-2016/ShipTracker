// frontend/src/components/VesselMap.jsx
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Ship, RefreshCw, Sun, Moon } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

export default function VesselMap() {
    const mapRef = useRef(null);
    const [vessels, setVessels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isMapReady, setIsMapReady] = useState(false);
    
    // Track map theme: 'dark' or 'satellite' (normal earth colors)
    const [mapTheme, setMapTheme] = useState('dark'); 

    const mapStyles = {
        dark: 'mapbox://styles/mapbox/dark-v11',
        satellite: 'mapbox://styles/mapbox/satellite-streets-v12' // High-res globe with normal colors & labels
    };

    // Helper: Format coordinates into GeoJSON
    const convertToGeoJSON = (vesselData) => {
        const features = vesselData.map((vessel) => {
            const lat = parseFloat(vessel.latitude);
            const lon = parseFloat(vessel.longitude);
            if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

            return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [lon, lat] },
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

    // Helper function to inject layers safely (used on initial init AND style switches)
    const setupMapLayers = (map) => {
        if (map.getSource('vessels-source')) return; // Already exists

        map.addSource('vessels-source', {
            type: 'geojson',
            data: convertToGeoJSON(vessels) // Seed immediately with whatever data we have cached
        });

        map.addLayer({
            id: 'vessels-layer',
            type: 'circle',
            source: 'vessels-source',
            paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2, 6, 6, 12, 12],
                // Change point color based on style theme for better contrast visibility
                'circle-color': mapTheme === 'dark' ? '#38bdf8' : '#ef4444', 
                'circle-stroke-width': 1,
                'circle-stroke-color': '#0f172a'
            }
        });

        // Tooltip logic
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
    };

    // 1. Initial Data Loop
    useEffect(() => {
        fetchVesselData();
        const interval = setInterval(fetchVesselData, 15000);
        return () => clearInterval(interval);
    }, []);

// 2. Map Canvas Mount (Runs EXACTLY ONCE on component startup)
    useEffect(() => {
        const containerCheck = document.getElementById('mapbox-canvas-viewport');
        if (mapRef.current || !containerCheck) return;

        console.log("Mounting core map canvas viewport...");
        mapRef.current = new mapboxgl.Map({
            container: 'mapbox-canvas-viewport',
            style: mapStyles[mapTheme], 
            center: [153.02, -27.47], 
            zoom: 2
        });

        const map = mapRef.current;
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');

        map.on('load', () => {
            setupMapLayers(map);
            setIsMapReady(true);
        });

        map.on('style.load', () => {
            setupMapLayers(map);
            // Dynamic check using a functional closure trick to get current data state safely
            const currentMap = mapRef.current;
            if (currentMap) {
                const source = currentMap.getSource('vessels-source');
                if (source) source.setData(convertToGeoJSON(vessels));
            }
        });

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []); // <-- FIX: Must be completely empty so it never re-initializes!

    // 3. Dynamic Theme Change Trigger
    useEffect(() => {
        if (!mapRef.current || !isMapReady) return;
        
        console.log(`Switching skin environment to: ${mapTheme}`);
        
        // FIX: Passing diff: false forces Mapbox to do a clean wipe and rebuild,
        // which guarantees the 'style.load' listener fires accurately every single time.
        mapRef.current.setStyle(mapStyles[mapTheme], { diff: false });
    }, [mapTheme]);

// 4. Vector Upload Synced to state
    useEffect(() => {
        if (!mapRef.current || !isMapReady || vessels.length === 0) return;

        const map = mapRef.current;
        
        // If the style is currently loading, it will be handled by the 'style.load' listener.
        // Otherwise, inject the fresh tracking updates seamlessly right here!
        if (map.isStyleLoaded()) {
            const source = map.getSource('vessels-source');
            if (source) {
                source.setData(convertToGeoJSON(vessels));
            }
        }
    }, [vessels, isMapReady, mapTheme]); // Keeps tracking updates independent of map instances
    
    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#0f172a', margin: 0, padding: 0 }}>
            
            {/* Control HUD Widget */}
            <div style={{
                position: 'absolute', top: '20px', left: '20px', zIndex: 10,
                backgroundColor: 'rgba(15, 23, 42, 0.95)', padding: '16px', borderRadius: '8px',
                color: '#f8fafc', fontFamily: 'sans-serif', border: '1px solid #334155', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <Ship style={{ color: mapTheme === 'dark' ? '#38bdf8' : '#ef4444' }} size={18} />
                    <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Discovered Fleet</h1>
                </div>
                
                {loading ? (
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0' }}>Syncing telemetry...</p>
                ) : (
                    <div>
                        <p style={{ fontSize: '12px', margin: '4px 0 8px 0', color: '#cbd5e1' }}>
                            Tracking <span style={{ color: mapTheme === 'dark' ? '#38bdf8' : '#ef4444', fontWeight: 'bold' }}>{vessels.length}</span> live vessels
                        </p>
                        
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={fetchVesselData} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '6px 10px', borderRadius: '4px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#fff' }}>
                                <RefreshCw size={10} /> Sync Telemetry
                            </button>

                            {/* THE THEME SWITCH TOGGLE BUTTON */}
                            <button 
                                onClick={() => setMapTheme(prev => prev === 'dark' ? 'satellite' : 'dark')}
                                style={{
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', 
                                    padding: '6px 10px', borderRadius: '4px', border: '1px solid #475569',
                                    backgroundColor: mapTheme === 'dark' ? '#0f172a' : '#f8fafc', 
                                    color: mapTheme === 'dark' ? '#f8fafc' : '#0f172a',
                                    fontWeight: '500', transition: 'all 0.2s ease'
                                }}
                            >
                                {mapTheme === 'dark' ? (
                                    <>
                                        <Sun size={12} style={{ color: '#eab308' }} /> Bright Globe
                                    </>
                                ) : (
                                    <>
                                        <Moon size={12} style={{ color: '#3b82f6' }} /> Dark Radar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
                {error && <p style={{ fontSize: '12px', color: '#f87171', marginTop: '6px' }}>{error}</p>}
            </div>

            {/* Core Viewport Frame */}
            <div id="mapbox-canvas-viewport" style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 1 }} />
        </div>
    );
}