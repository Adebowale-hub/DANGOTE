# DCP KPI Validation & Dashboard Pipeline

**Dangote Cement Plc — Real-Time Industrial KPI Monitoring System**

> Automated data quality validation, MQTT telemetry ingestion, MongoDB time-series persistence, WebSocket streaming, and a premium dark-mode React dashboard — all in one self-contained stack.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Quick Start](#quick-start)
- [MongoDB Setup](#mongodb-requirements)
- [Plants & Machines](#plants-monitored)
- [Validation Engine](#validation-engine-the-bouncer)
- [API Reference](#api-endpoints)
- [Simulation Tools](#simulation--testing-tools)
- [WebSocket Events](#websocket-events)
- [Data Schema](#data-schema-mongodb-time-series)
- [Industry Integration](#industry-integration)
- [Google Sheets Sync](#google-sheets-sync)
- [Project Structure](#project-structure)

---

## Overview

The **DCP KPI Command Centre** is a full-stack industrial IoT monitoring platform built for Dangote Cement Plc. It ingests real-time telemetry from factory machines, validates data quality against configurable rules, persists readings in a MongoDB time-series collection, and streams live updates to a browser-based command dashboard.

The system is designed to be **protocol-agnostic at the edge** — any machine or gateway that can publish to an MQTT broker can feed data into the pipeline. See the [Industry Integration Guide](./INDUSTRY_INTEGRATION.md) for a full walkthrough of connecting physical machines.

---

## Architecture

```
+------------------------------------------------------------------+
|                        FACTORY FLOOR                             |
|  [KILN PLC]   [MILL SENSOR]   [COOLER I/O]   [SCADA/OPC-UA]    |
+------------------------------+-----------------------------------+
                               |  MQTT publish (via edge gateway)
                               v
+------------------------------------------------------------------+
|                   SERVER  (Node.js / Express)                    |
|                                                                  |
|  [ Aedes MQTT Broker :1883 ] --> [ Validation Engine          ]  |
|                                    VAL-01 Range                  |
|                                    VAL-02 Stale Detection        |
|                                    VAL-03 Interpolation          |
|                                    EX-01 Conversion Loss         |
|                                          |                       |
|                                          v                       |
|                               [ MongoDB Atlas Time Series ]      |
|                                  30-day hot retention            |
|                                          |                       |
|                                          v                       |
|                               [ WebSocket Broadcaster :4000 ]    |
|                                          |                       |
|                               [ REST API  /api/* ]               |
+------------------------------------------------------------------+
                               |  ws://localhost:4000
                               v
+------------------------------------------------------------------+
|               REACT DASHBOARD  (Vite)  :5173                     |
|    Dashboard  |  Analytics  |  Alerts  |  Simulate               |
+------------------------------------------------------------------+
```

---

## Features

| Feature | Description |
|---|---|
| **Live Telemetry** | WebSocket stream pushes sensor readings to the dashboard in real time |
| **Validation Engine** | 4-rule bouncer rejects out-of-range, stale, and anomalous data |
| **Interpolation** | Gaps under 5 minutes are filled automatically to maintain continuity |
| **Alert System** | CRITICAL / WARNING / INFO alerts with acknowledge & clear workflow |
| **Simulate Alerts** | One-click test panel fires synthetic alerts via WebSocket |
| **MongoDB Atlas** | Time-series collection with 30-day hot retention and TTL expiry |
| **OEE Metrics** | Overall Equipment Effectiveness calculated per machine |
| **Google Sheets Sync** | KPI data pushed to a live Google Sheet on a configurable interval |
| **Dark Dashboard** | Premium dark-mode React UI with sparklines, charts, and animations |
| **Multi-plant** | Monitors Ibese, Obajana, and Gboko plants simultaneously |

---

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free tier) or local MongoDB

### 1. Clone & Install

```bash
git clone <repo-url>
cd dangote
cd server && npm install
cd ../client && npm install
```

### 2. Configure Environment

```bash
cd server
cp .env.example .env
# Edit .env — fill in MONGODB_URI and Google Sheets credentials
```

### 3. Start the Backend

```bash
cd server
node src/index.js
# Server  -> http://localhost:4000
# MQTT    -> tcp://localhost:1883
# WS      -> ws://localhost:4000
```

### 4. Start the Simulator (optional)

```bash
cd server
npm run simulate
```

### 5. Start the Frontend

```bash
cd client
npm run dev
# Dashboard -> http://localhost:5173
```

---

## MongoDB Requirements

### Option A — MongoDB Atlas (Recommended)

1. Go to https://cloud.mongodb.com and create a free account
2. Create a free **M0 cluster**
3. In **Database Access** — create a user with readWrite permissions
4. In **Network Access** — add `0.0.0.0/0` (or your server IP)
5. Click **Connect -> Drivers** — copy your connection string
6. Paste into `server/.env`:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/dcp_kpi?retryWrites=true&w=majority
```

### Option B — Local MongoDB

```bash
# Download from https://www.mongodb.com/try/download/community
# MongoDB runs on localhost:27017 by default
# Leave MONGODB_URI commented out in .env
```

> The server creates the `kpitelemetries` time-series collection automatically on first connect.

---

## Plants Monitored

| Plant ID | Name | Location | Machines |
|---|---|---|---|
| IBESE-01 | Ibese Plant | Ogun State, Nigeria | KILN-A, KILN-B, MILL-01, COOLER-A |
| OBAJANA-01 | Obajana Plant | Kogi State, Nigeria | KILN-A, KILN-B, MILL-02, COOLER-B |
| GBOKO-01 | Gboko Plant | Benue State, Nigeria | KILN-A, MILL-03, COOLER-C |

---

## Validation Engine (The Bouncer)

Every incoming MQTT reading passes through a 4-rule pipeline before being stored:

| Rule | ID | Description |
|---|---|---|
| Range Check | VAL-01 | Rejects readings outside physical limits (e.g. Kiln Temp > 2,500 C) |
| Stale Detection | VAL-02 | Flags sensors returning the same value for > 60 seconds |
| Interpolation | VAL-03 | Linearly fills gaps shorter than 5 minutes |
| Conversion Loss | EX-01 | Fires alert when fuel/clinker ratio < 85% for > 60 min |

**Quality Flags:**

| Flag | Meaning |
|---|---|
| OK | Reading passed all validation rules |
| STALE | Sensor has not changed in > 60 s |
| INTERPOLATED | Gap filled by linear interpolation |
| OUT_OF_BOUNDS | Value outside physical operating limits |

---

## API Endpoints

### Telemetry

| Method | Endpoint | Query Params | Description |
|---|---|---|---|
| GET | `/api/telemetry` | plantId, machineId, metric, limit | Historical readings |
| GET | `/api/telemetry/latest` | plantId | Latest value per sensor |
| GET | `/api/telemetry/timeseries` | plantId, machineId, metric, hours | Chart-ready data |

### Analytics

| Method | Endpoint | Query Params | Description |
|---|---|---|---|
| GET | `/api/quality` | plantId, hours | Data quality breakdown |
| GET | `/api/oee` | plantId, hours | OEE per machine |
| GET | `/api/plants` | — | All plants and machine IDs |
| GET | `/api/status` | — | Server health + WS client count |

### Simulation (Testing)

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/simulate/alert` | { severity, alertType, plantId, machineId, message } | Fire a synthetic alert |
| POST | `/api/simulate/clear-alert` | { alertType, plantId, machineId } | Clear a simulated alert |

---

## Simulation & Testing Tools

### Built-in Alert Simulator (Dashboard)

Navigate to **Alerts -> Simulate Alerts panel** in the dashboard:

| Scenario | Severity | Plant | Machine |
|---|---|---|---|
| Critical Kiln | CRITICAL | IBESE-01 | KILN-A |
| Warning Mill | WARNING | IBESE-01 | MILL-01 |
| Stale Sensor | WARNING | OBAJANA-01 | COOLER-B |
| Out of Bounds | CRITICAL | GBOKO-01 | KILN-A |
| Info: Shift Change | INFO | OBAJANA-01 | MILL-02 |

### cURL Examples

```bash
# Fire a critical alert
curl -X POST http://localhost:4000/api/simulate/alert \
  -H "Content-Type: application/json" \
  -d '{"severity":"CRITICAL","alertType":"EFFICIENCY_CRITICAL","plantId":"IBESE-01","machineId":"KILN-A","message":"Kiln efficiency dropped to 58%","efficiency":58,"threshold":65}'

# Clear it
curl -X POST http://localhost:4000/api/simulate/clear-alert \
  -H "Content-Type: application/json" \
  -d '{"alertType":"EFFICIENCY_CRITICAL","plantId":"IBESE-01","machineId":"KILN-A"}'
```

---

## WebSocket Events

Connect to `ws://localhost:4000`:

| Event Type | Description |
|---|---|
| CONNECTED | Sent on connection |
| TELEMETRY_UPDATE | Live sensor reading with value, qualityFlag, metadata |
| ALERT_FIRED | Alert triggered with severity, message, plant, machine |
| ALERT_CLEARED | Alert condition resolved |

---

## Data Schema (MongoDB Time Series)

```json
{
  "timestamp": "2026-07-04T14:00:00.000Z",
  "metadata": {
    "plantId": "IBESE-01",
    "machineId": "KILN-A",
    "metric": "KILN_TEMP"
  },
  "value": 1452.3,
  "qualityFlag": "OK"
}
```

- `timeField: "timestamp"` — native MongoDB time-bucketing
- `metaField: "metadata"` — indexed for fast queries
- `expireAfterSeconds: 2592000` — automatic 30-day TTL

---

## Industry Integration

See the full guide: **[INDUSTRY_INTEGRATION.md](./INDUSTRY_INTEGRATION.md)**

Explains how physical factory machines (PLCs, SCADA, analog sensors) connect to this platform using OPC-UA, Modbus, Node-RED, and VPN. Includes Dangote-specific integration steps.

---

## Google Sheets Sync

```env
GOOGLE_SHEETS_ID=your_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_PATH=./google-credentials.json
SHEETS_SYNC_INTERVAL_MINUTES=5
```

1. Create a Google Cloud project and enable the Sheets API
2. Create a Service Account and download the JSON key
3. Share your Google Sheet with the service account email
4. Set the variables above in `server/.env`

---

## Project Structure

```
dangote/
+-- client/
|   +-- public/
|   |   +-- favicon.svg          # Metrics-themed SVG favicon
|   |   +-- favicon-192.png      # PNG fallback
|   +-- src/
|       +-- components/
|       |   +-- AlertBanner.jsx  # Critical alert top bar
|       |   +-- KpiTile.jsx      # Metric card with sparkline
|       |   +-- Sidebar.jsx      # Navigation sidebar
|       +-- hooks/
|       |   +-- useWebSocket.js  # WS connection manager
|       |   +-- useTelemetry.js  # Alert + telemetry state
|       +-- pages/
|           +-- Dashboard.jsx    # Live KPI overview
|           +-- Analytics.jsx    # Charts & OEE
|           +-- Alerts.jsx       # Alert log + simulator
+-- server/
    +-- src/
        +-- broker/
        |   +-- mqttBroker.js    # Aedes in-process MQTT broker
        +-- db/
        |   +-- connection.js    # MongoDB Atlas connection
        |   +-- kpiModel.js      # Mongoose time-series model
        +-- routes/
        |   +-- api.js           # REST + simulation endpoints
        +-- sheets/              # Google Sheets integration
        +-- validation/          # VAL-01 ... EX-01 rules
        +-- websocket/
        |   +-- broadcaster.js   # WS broadcast to all clients
        +-- index.js             # Bootstrap & server entry
```

---

## License

MIT — Dangote Cement Plc Hackathon Submission
