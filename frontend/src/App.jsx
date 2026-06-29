// frontend/src/App.jsx
import React from 'react';
import VesselMap from './components/VesselMap';

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      <VesselMap />
    </div>
  );
}