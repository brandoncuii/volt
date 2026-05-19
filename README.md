# Volt

EV trip planner that computes optimal charging-stop routes across the US Tesla Supercharger network.

Enter a start and destination, adjust your vehicle range and battery levels, and Volt finds the fastest route — minimizing total trip time (driving + charging) using an A\* graph search over 2,700+ US Supercharger stations.

## Architecture

```
volt/
├── client/          React 19 + Vite + Tailwind v4 frontend
│   └── src/
│       ├── components/   RouteForm, MapView, ResultsPanel, PlacesAutocomplete
│       └── lib/          API client, Google Maps hook, unit conversions
├── server/          Express 5 + TypeScript backend
│   └── src/
│       ├── algo/         A* route planner + MinHeap
│       ├── data/         Supercharger JSON dataset + loader
│       ├── graph/        Edge weights (haversine or Google Distance Matrix)
│       └── routes/       /api/route endpoint with validation
└── shared/          Shared TypeScript types (@volt/shared)
```

**How routing works:** The server models each Supercharger as a graph node. Edge weights are driving time + any required charging time at the departure station. A\* search with a haversine-based heuristic finds the path that minimizes total trip time. Battery constraints (start charge, min arrival charge, vehicle range) are enforced at every edge.

## Getting Started

### Prerequisites

- Node.js 20+
- A [Google Maps API key](https://console.cloud.google.com/apis/credentials) with the Maps JavaScript API and Places API enabled

### Setup

```bash
# Install all workspace dependencies
npm install

# Configure environment variables
cp client/.env.example client/.env
cp server/.env.example server/.env
# Add your Google Maps API key to client/.env (VITE_GOOGLE_MAPS_API_KEY)
```

### Development

```bash
# Start the backend (port 3001)
npm run dev:server

# Start the frontend (port 5173, proxies /api to the backend)
npm run dev:client
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Testing

```bash
npm test --workspace=server
```

### Building

```bash
npm run build
```

## API

### `POST /api/route`

Plans an optimal charging route.

**Request body:**

```json
{
  "start": { "lat": 34.05, "lng": -118.24 },
  "end": { "lat": 37.77, "lng": -122.42 },
  "vehicleRangeKm": 400,
  "startBatteryPct": 90,
  "minArrivalBatteryPct": 10
}
```

**Response:** Array of charging stops with arrival/departure battery levels, charging times, and trip totals.

### `GET /api/health`

Returns server status.

## Configuration

| Variable | Location | Description |
|---|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | `client/.env` | Google Maps JS API key (shipped to browser) |
| `GOOGLE_MAPS_API_KEY` | `server/.env` | Google Distance Matrix key (optional) |
| `USE_HAVERSINE_EDGES` | `server/.env` | `true` (default) uses haversine approximation; `false` uses real Distance Matrix API |
| `PORT` | `server/.env` | Server port (default: 3001) |

## License

MIT
