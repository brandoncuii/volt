import type { Supercharger } from '@volt/shared';

function App() {
  const sample: Supercharger = {
    id: 'sc-001',
    name: 'Hawthorne Supercharger',
    location: { lat: 33.9207, lng: -118.3304 },
    address: '1 Rocket Rd, Hawthorne, CA',
    stallCount: 12,
    powerKW: 250,
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">⚡ Volt</h1>
        <p className="text-gray-600">EV route planner</p>
        <p className="mt-4 text-sm text-gray-500">
          Loaded sample charger: {sample.name}
        </p>
      </div>
    </div>
  );
}

export default App;