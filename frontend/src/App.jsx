import React from 'react';
import VoiceOrderComponent from './VoiceOrderComponent.jsx'; // Adjust path if needed

function App() {
  return (
    <div style={{ backgroundColor: '#f9f9f9', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      {/* This mounts your new voice tool right in the center of the page */}
      <VoiceOrderComponent />
    </div>
  );
}

export default App;
