# DCP KPI Validation & Dashboard Pipeline

**Dangote Cement Plc — Challenge 4 | Hackathon Submission**

> Real-time industrial KPI monitoring with automated data quality validation, WebSocket streaming, and a premium dark luxury dashboard.

---

## 🏭 Architecture

```
Factory Floor (MQTT)
        ↓
  [Aedes Broker] ← in-process, port 1883
        ↓
  [The Bouncer] — VAL-01 Range, VAL-02 Stale, VAL-03 Interpolate, EX-01 Conversion Loss
        ↓
  [MongoDB Time Series] — 30-day hot retention
        ↓
  [WebSocket Broadcaster] ← ws://localhost:4000
        ↓
  [React Dashboard] — Dark Luxury Interface
```

---

## ⚡ Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (see requirements below)

### 1. Backend
```bash
cd server
npm install
cp .env.example .env
# Edit .env — add your MONGODB_URI
npm run dev
```

### 2. Simulator (separate terminal)
```bash
cd server
npm run simulate
```

### 3. Frontend (separate terminal)
```bash
cd client
npm install
npm run dev
```

Open **http://localhost:5173**

---

## 🗄️ MongoDB Requirements

You need **one** of the following:

### Option A — MongoDB Atlas (Recommended, Free Tier)
1. Go to https://cloud.mongodb.com and create a free account
2. Create a free M0 cluster
3. In "Database Access", create a user with readWrite permissions
4. In "Network Access", add `0.0.0.0/0` (or your IP)
5. Click "Connect" → "Drivers" → copy your connection string
6. Paste into `server/.env` as `MONGODB_URI=mongodb+srv://...`

### Option B — Local MongoDB
```bash
# Windows: download from https://www.mongodb.com/try/download/community
# After install, MongoDB runs on localhost:27017 by default
# No changes needed to .env
```

---

## 🌐 Plants Monitored
| Plant ID | Location | Machines |
|----------|----------|----------|
| IBESE-01 | Ogun State | KILN-A, KILN-B, MILL-01, COOLER-A |
| OBAJANA-01 | Kogi State | KILN-A, KILN-B, MILL-02, COOLER-B |
| GBOKO-01 | Benue State | KILN-A, MILL-03, COOLER-C |

---

## 🔍 Validation Engine (The Bouncer)

| Rule | Description |
|------|-------------|
| VAL-01 | Rejects readings outside physical limits (e.g., Kiln Temp > 2500°C) |
| VAL-02 | Flags sensors that return the same value for >60 seconds |
| VAL-03 | Linearly interpolates gaps shorter than 5 minutes |
| EX-01 | Fires CONVERSION_LOSS alert when fuel/clinker ratio <85% for >60 min |

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plants` | List all plants & machines |
| GET | `/api/telemetry` | Historical readings |
| GET | `/api/telemetry/latest` | Latest value per sensor |
| GET | `/api/telemetry/timeseries` | Chart data |
| GET | `/api/quality` | Data quality breakdown |
| GET | `/api/oee` | Machine availability |
| GET | `/api/status` | Server health |

---

## 📊 Data Schema (MongoDB Time Series)

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
