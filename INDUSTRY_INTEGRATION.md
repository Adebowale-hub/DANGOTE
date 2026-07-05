# Industry Integration Guide

## Connecting Factory Machines to the DCP KPI Command Centre

**Document Version:** 1.0  
**Applies To:** All Dangote Cement Plants — Ibese, Obajana, Gboko

---

## Table of Contents

1. [What This Platform Does](#1-what-this-platform-does)
2. [How the Data Pipeline Works](#2-how-the-data-pipeline-works)
3. [Industrial Communication Protocols](#3-industrial-communication-protocols)
4. [The Edge Gateway](#4-the-edge-gateway)
5. [MQTT — The Messaging Backbone](#5-mqtt--the-messaging-backbone)
6. [Step-by-Step: Connecting a Machine](#6-step-by-step-connecting-a-machine)
7. [Node-RED Integration (Recommended)](#7-node-red-integration-recommended)
8. [Python Bridge (Alternative)](#8-python-bridge-alternative)
9. [Network and Security Architecture](#9-network-and-security-architecture)
10. [Dangote-Specific Recommendations](#10-dangote-specific-recommendations)
11. [Troubleshooting](#11-troubleshooting)
12. [Glossary](#12-glossary)

---

## 1. What This Platform Does

The DCP KPI Command Centre is a real-time industrial monitoring system. Its job is to:

- **Collect** sensor readings from kilns, mills, and coolers across all plants
- **Validate** those readings against physical rules (temperature limits, stale data, outliers)
- **Store** clean data in a time-series database (MongoDB Atlas) with 30-day retention
- **Stream** live data and alerts to the command dashboard via WebSocket
- **Sync** KPI summaries to Google Sheets for management reporting

The platform does NOT reach down into machines itself. Instead, machines — or a small gateway device installed near them — **push** data up to the platform using the MQTT protocol. Any machine, from any manufacturer, that can publish an MQTT message can feed into this dashboard.

---

## 2. How the Data Pipeline Works

```
STEP 1 — Machine produces data
  A kiln PLC measures temperature, a mill sensor tracks throughput,
  a cooler monitors airflow. This data exists locally in the machine's
  control system (PLC, DCS, or SCADA).

STEP 2 — Edge Gateway reads the data
  A small industrial PC or IoT gateway installed near the machine
  reads the data using the machine's native protocol:
  OPC-UA, Modbus TCP, Modbus RTU, or 4-20mA via an I/O module.

STEP 3 — Gateway normalises and publishes
  The gateway converts the raw reading into a standard JSON message
  and publishes it to the DCP MQTT broker over the plant network.

  Topic format:  dcp/{plantId}/{machineId}/{metric}
  Example:       dcp/IBESE-01/KILN-A/KILN_TEMP

  Payload:
  {
    "value": 1452.3,
    "unit": "celsius",
    "timestamp": "2026-07-05T14:00:00.000Z"
  }

STEP 4 — Server receives and validates
  The DCP server subscribes to all dcp/# topics. Every message
  passes through the Validation Engine (The Bouncer):

    VAL-01: Is the value within physical limits?
    VAL-02: Has this sensor been stuck on the same value > 60s?
    VAL-03: Is there a gap shorter than 5 min that needs filling?
    EX-01:  Is the fuel/clinker conversion ratio below threshold?

STEP 5 — Data is stored and broadcast
  Clean readings are saved to MongoDB Atlas (time-series collection).
  The WebSocket broadcaster pushes events to all connected dashboards
  in under 100ms.

STEP 6 — Dashboard displays and alerts
  The React dashboard shows live KPI tiles, sparklines, and fires
  CRITICAL / WARNING / INFO alerts to operators instantly.
```

---

## 3. Industrial Communication Protocols

Different machines speak different languages. Here is what each protocol is and where you will find it in a cement plant.

### OPC-UA (Open Platform Communications Unified Architecture)

- **What it is:** The modern gold standard for industrial data exchange. Secure, structured, and completely vendor-neutral.
- **Found on:** Siemens S7-1200 / S7-1500 PLCs, Siemens WinCC SCADA, Rockwell ControlLogix, Beckhoff TwinCAT
- **How it works:** The PLC runs an OPC-UA server. The gateway runs an OPC-UA client and reads named node values such as `ns=2;s=Kiln_A.Temperature`.
- **Relevance to Dangote:** Highly likely at plants running Siemens automation. WinCC exposes all tags via an OPC-UA server with no changes to the PLC required.

### Modbus TCP / Modbus RTU

- **What it is:** A 40-year-old protocol still found everywhere in industrial environments.
- **Modbus TCP:** Runs over Ethernet on port 502.
- **Modbus RTU:** Runs over serial cable (RS-232 or RS-485).
- **Found on:** Energy meters, flow meters, temperature transmitters, older PLCs, variable frequency drives (VFDs), weigh feeders.
- **How it works:** The gateway sends a read request specifying a register address. The device responds with the current integer value. A scale factor converts the integer to a real-world unit.

### PROFIBUS / PROFINET

- **What it is:** Siemens-family fieldbus protocols. PROFIBUS is the older serial version, PROFINET is the modern Ethernet version.
- **Found on:** Siemens S7-300 / S7-400 systems, distributed I/O modules (ET 200 series), motor drives (SINAMICS), instrument transmitters.
- **How it works:** Best accessed via the SCADA layer. WinCC already reads PROFINET data from the PLC and can re-expose it via OPC-UA — no additional hardware required.

### 4–20 mA Analog Sensors

- **What it is:** The most basic industrial sensor signal. A current loop where 4 mA represents the minimum measurement and 20 mA represents the maximum.
- **Found on:** Temperature probes (thermocouples, RTDs), pressure sensors, level sensors, flow meters, gas analysers.
- **How it works:** Requires a hardware I/O module (e.g. Advantech ADAM-6117, Wago 750-457) to convert the analog current signal into a digital value readable over Ethernet using Modbus TCP.

### Protocol Comparison

| Protocol | Physical Connection | Speed | Common Gateway Tool |
|---|---|---|---|
| OPC-UA | Ethernet | Fast | node-red-contrib-opcua, node-opcua |
| Modbus TCP | Ethernet (port 502) | Fast | node-red-contrib-modbus, pymodbus |
| Modbus RTU | RS-485 serial cable | Moderate | node-red-contrib-modbus, pymodbus |
| PROFINET | Ethernet | Fast | Via WinCC OPC-UA bridge |
| 4–20 mA | Analog wire + I/O module | Moderate | Read via Modbus from I/O module |

---

## 4. The Edge Gateway

The edge gateway is a small computing device installed inside or near the electrical control panel of each machine. It runs continuously and translates between the machine's native protocol and the DCP MQTT broker.

### Recommended Hardware

| Device | Best For | Notes |
|---|---|---|
| Siemens SIMATIC IPC227G | Production deployment in Siemens environments | Industrial certified, wide temperature range |
| Advantech UNO-2372G | Rugged DIN-rail mounting | Fanless, IP30, -20 to 60 °C |
| Moxa UC-8100 | ARM-based, certified for harsh conditions | Good for remote plants with limited space |
| Raspberry Pi 4 + industrial enclosure | Pilot / proof of concept | Low cost, proven Node-RED support |

### What the Gateway Runs

The gateway runs a **bridge program** — a lightweight script that:

1. Connects to the machine using its native protocol (OPC-UA client, Modbus client, etc.)
2. Reads sensor values on a fixed schedule (every 5 seconds by default)
3. Packages the value as a JSON message
4. Publishes the message to the MQTT broker

One gateway can serve multiple machines on the same plant network segment.

---

## 5. MQTT — The Messaging Backbone

MQTT (Message Queuing Telemetry Transport) is a lightweight publish/subscribe protocol designed for IoT and industrial systems. It uses very little bandwidth, tolerates unreliable networks, and supports guaranteed delivery (QoS levels 0, 1, 2).

### Publish / Subscribe Model

```
Edge Gateway (Publisher)          DCP Broker :1883          DCP Server (Subscriber)
        |                               |                           |
        |-- PUBLISH topic, payload ---->|                           |
        |                               |---- forward message ----->|
        |                               |                           |
                                                            validate + store + broadcast
```

### Topic Structure

```
dcp / {plantId} / {machineId} / {metric}

Examples:
  dcp/IBESE-01/KILN-A/KILN_TEMP          Kiln A temperature
  dcp/IBESE-01/KILN-A/KILN_EFFICIENCY    Kiln A efficiency %
  dcp/IBESE-01/MILL-01/THROUGHPUT        Mill 01 throughput (t/h)
  dcp/IBESE-01/COOLER-A/AIRFLOW          Cooler A airflow (m3/h)
  dcp/OBAJANA-01/KILN-B/CLINKER_RATIO   Clinker ratio %
  dcp/GBOKO-01/MILL-03/VIBRATION         Mill vibration (mm/s)
```

### Agreed Metric Names

| Metric Key | Unit | Machine Types |
|---|---|---|
| KILN_TEMP | Celsius | KILN |
| KILN_EFFICIENCY | Percentage (0–100) | KILN |
| THROUGHPUT | Tonnes per hour | MILL, KILN |
| POWER_DRAW | kWh | MILL, COOLER |
| AIRFLOW | m3 per hour | COOLER |
| CLINKER_RATIO | Percentage | KILN |
| VIBRATION | mm/s | MILL |
| FUEL_RATE | kg per hour | KILN |

### Message Payload Format

```json
{
  "value": 1452.3,
  "unit": "celsius",
  "timestamp": "2026-07-05T14:00:00.000Z",
  "sensorId": "TIC-101"
}
```

**Rules:**
- `value` must be a number (integer or float)
- `timestamp` must be ISO 8601 format in UTC
- `sensorId` is optional but recommended for maintenance traceability
- `unit` is informational — the server uses the metric name for validation thresholds

---

## 6. Step-by-Step: Connecting a Machine

The following procedure applies to onboarding any single machine. Use it as a checklist for each KILN, MILL, and COOLER at each plant.

### Step 1 — Identify the Control System

Physically visit the machine's control panel and record:

- PLC brand and model (e.g. Siemens S7-1500, Allen Bradley CompactLogix)
- Communication interface available (Ethernet RJ45, RS-485 serial)
- Protocol supported (OPC-UA, Modbus TCP, Modbus RTU, PROFINET)
- IP address of the PLC or SCADA system on the plant LAN
- Available sensor tags / register addresses and their engineering units

### Step 2 — Install the Edge Gateway

- Mount the gateway (DIN-rail PC or Raspberry Pi in IP65 enclosure) near the control panel
- Connect to the plant LAN via Ethernet — assign a **static IP** on the plant network
- Test internet or VPN connectivity to the DCP server from the gateway

### Step 3 — Verify Protocol Connectivity

From a laptop on the same plant network:

```bash
# OPC-UA: Use UaExpert (free, Windows/Linux) to browse the PLC address space
# Connect to: opc.tcp://192.168.1.10:4840
# Browse to find: Kiln_A.Temperature, Kiln_A.Efficiency, etc.

# Modbus TCP: Use modpoll command-line tool
modpoll -m tcp -t 4 -r 0 -c 4 192.168.1.10
# Reads 4 holding registers starting at address 0
# Output shows raw integer values — apply scale factor to get engineering units
```

### Step 4 — Map Tags to DCP Metrics

Create a register/tag map for the machine:

| PLC Tag or Register | DCP Metric Key | Unit | Scale Factor |
|---|---|---|---|
| `ns=2;s=Kiln_A.Temperature` (OPC-UA) | KILN_TEMP | celsius | x1.0 |
| `ns=2;s=Kiln_A.Efficiency` (OPC-UA) | KILN_EFFICIENCY | percent | x1.0 |
| Holding Register 0 (Modbus) | THROUGHPUT | t/h | x0.1 |
| Holding Register 1 (Modbus) | POWER_DRAW | kWh | x1.0 |
| Holding Register 2 (Modbus) | VIBRATION | mm/s | x0.01 |

### Step 5 — Install and Configure the Bridge

Install Node-RED or the Python bridge on the gateway (see Sections 7 and 8).

### Step 6 — Verify MQTT Messages Arrive at the Server

On the DCP server machine, run:

```bash
mosquitto_sub -h localhost -p 1883 -t "dcp/IBESE-01/KILN-A/#" -v
```

You should immediately see messages like:

```
dcp/IBESE-01/KILN-A/KILN_TEMP {"value":1452.3,"unit":"celsius","timestamp":"2026-07-05T14:00:01.000Z"}
dcp/IBESE-01/KILN-A/THROUGHPUT {"value":87.5,"unit":"t/h","timestamp":"2026-07-05T14:00:01.000Z"}
```

### Step 7 — Confirm on the Dashboard

Open `http://localhost:5173`, select the correct plant in the sidebar, and verify the KPI tiles are updating in real time. A new reading should arrive every 5 seconds.

---

## 7. Node-RED Integration (Recommended)

Node-RED is a browser-based visual flow editor ideal for building MQTT bridges without extensive coding. It is the recommended integration tool for Dangote's operations teams.

### Installation on the Gateway

```bash
# Install Node.js first (18+), then:
npm install -g --unsafe-perm node-red
npm install -g node-red-contrib-opcua
npm install -g node-red-contrib-modbus

# Start Node-RED
node-red

# Open the editor in a browser at:
# http://<gateway-ip>:1880
```

### Flow 1: OPC-UA to MQTT

Connect three nodes in sequence:

```
[OPC-UA Client]  -->  [Function: Format Payload]  -->  [MQTT Out]
```

**OPC-UA Client node settings:**
- Endpoint URL: `opc.tcp://192.168.1.10:4840`
- Node ID: `ns=2;s=Kiln_A.Temperature`
- Polling interval: 5000 ms

**Function node code:**
```javascript
const value = msg.payload.value.value;

msg.topic = "dcp/IBESE-01/KILN-A/KILN_TEMP";
msg.payload = JSON.stringify({
    value: parseFloat(value.toFixed(2)),
    unit: "celsius",
    timestamp: new Date().toISOString(),
    sensorId: "TIC-101"
});

return msg;
```

**MQTT Out node settings:**
- Server: `<dcp-server-ip>:1883`
- Topic: leave blank (set dynamically by the function node via `msg.topic`)
- QoS: 1

Duplicate this flow for each metric on the machine — KILN_EFFICIENCY, THROUGHPUT, etc.

### Flow 2: Modbus TCP to MQTT

```
[Modbus Read]  -->  [Function: Scale and Format]  -->  [MQTT Out]
```

**Modbus Read node settings:**
- FC: FC4 Read Input Registers (or FC3 for holding registers)
- Server: `192.168.1.10:502`
- Starting address: 0
- Quantity: 4
- Poll rate: 5000 ms

**Function node code (reads all registers in one pass):**
```javascript
const registers = msg.payload;
const plant = "IBESE-01";
const machine = "MILL-01";
const ts = new Date().toISOString();

const metrics = [
    { topic: `dcp/${plant}/${machine}/THROUGHPUT`, value: registers[0] * 0.1,  unit: "t/h"     },
    { topic: `dcp/${plant}/${machine}/POWER_DRAW`, value: registers[1] * 1.0,  unit: "kWh"     },
    { topic: `dcp/${plant}/${machine}/VIBRATION`,  value: registers[2] * 0.01, unit: "mm/s"    },
    { topic: `dcp/${plant}/${machine}/AIRFLOW`,    value: registers[3] * 1.0,  unit: "m3/h"    },
];

return metrics.map(m => ({
    topic: m.topic,
    payload: JSON.stringify({ value: parseFloat(m.value.toFixed(3)), unit: m.unit, timestamp: ts })
}));
```

---

## 8. Python Bridge (Alternative)

For teams who prefer scripted deployments, here are complete Python bridge scripts.

### Modbus TCP to MQTT Bridge

```python
"""
DCP KPI Bridge — Modbus TCP to MQTT
Runs on the edge gateway. One process per machine.

Dependencies:
    pip install pymodbus paho-mqtt

Usage:
    python bridge_modbus.py
"""

import time, json, logging
from datetime import datetime, timezone
from pymodbus.client import ModbusTcpClient
import paho.mqtt.client as mqtt

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("dcp-bridge")

# ── Configuration ──────────────────────────────────────────────────────────────
PLC_HOST       = "192.168.1.10"   # PLC IP on the plant LAN
PLC_PORT       = 502              # Modbus TCP default port
MQTT_HOST      = "10.0.0.5"      # DCP server IP or hostname
MQTT_PORT      = 1883
PLANT_ID       = "IBESE-01"
MACHINE_ID     = "KILN-A"
POLL_SECONDS   = 5

# (start_register, metric_name, unit, scale_factor)
REGISTER_MAP = [
    (0, "KILN_TEMP",       "celsius",  1.0),
    (1, "KILN_EFFICIENCY", "percent",  0.01),
    (2, "THROUGHPUT",      "t/h",      0.1),
    (3, "POWER_DRAW",      "kWh",      1.0),
]

# ── MQTT client setup ──────────────────────────────────────────────────────────
mq = mqtt.Client(client_id=f"dcp-{PLANT_ID}-{MACHINE_ID}")
mq.on_connect    = lambda c, u, f, rc: log.info(f"MQTT connected rc={rc}")
mq.on_disconnect = lambda c, u, rc:    log.warning(f"MQTT disconnected rc={rc}")
mq.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
mq.loop_start()

# ── Modbus client setup ────────────────────────────────────────────────────────
plc = ModbusTcpClient(PLC_HOST, port=PLC_PORT)

def publish(metric, value, unit):
    topic   = f"dcp/{PLANT_ID}/{MACHINE_ID}/{metric}"
    payload = json.dumps({
        "value":     round(value, 3),
        "unit":      unit,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    result = mq.publish(topic, payload, qos=1)
    log.info(f"PUB {topic} = {value} {unit}")

# ── Main polling loop ──────────────────────────────────────────────────────────
log.info(f"Bridge started: {PLANT_ID}/{MACHINE_ID}, polling every {POLL_SECONDS}s")

while True:
    try:
        if not plc.is_socket_open():
            plc.connect()

        response = plc.read_holding_registers(0, count=len(REGISTER_MAP))

        if response.isError():
            log.error(f"Modbus read error: {response}")
        else:
            for i, (_, metric, unit, scale) in enumerate(REGISTER_MAP):
                publish(metric, response.registers[i] * scale, unit)

    except Exception as exc:
        log.error(f"Bridge error: {exc}")

    time.sleep(POLL_SECONDS)
```

### OPC-UA to MQTT Bridge

```python
"""
DCP KPI Bridge — OPC-UA to MQTT
Suitable for Siemens S7-1500 PLCs and WinCC SCADA systems.

Dependencies:
    pip install opcua paho-mqtt

Usage:
    python bridge_opcua.py
"""

import time, json, logging
from datetime import datetime, timezone
from opcua import Client as OpcClient
import paho.mqtt.client as mqtt

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("dcp-opcua-bridge")

OPCUA_ENDPOINT = "opc.tcp://192.168.1.10:4840"
MQTT_HOST      = "10.0.0.5"
PLANT_ID       = "IBESE-01"
MACHINE_ID     = "KILN-A"
POLL_SECONDS   = 5

# OPC-UA Node ID  ->  (metric_name, unit)
NODE_MAP = {
    "ns=2;s=Kiln_A.Temperature":  ("KILN_TEMP",       "celsius"),
    "ns=2;s=Kiln_A.Efficiency":   ("KILN_EFFICIENCY",  "percent"),
    "ns=2;s=Kiln_A.Throughput":   ("THROUGHPUT",       "t/h"),
    "ns=2;s=Kiln_A.PowerDraw":    ("POWER_DRAW",       "kWh"),
}

mq = mqtt.Client(client_id=f"dcp-opcua-{PLANT_ID}-{MACHINE_ID}")
mq.connect(MQTT_HOST, 1883)
mq.loop_start()

opc = OpcClient(OPCUA_ENDPOINT)
opc.connect()
log.info(f"OPC-UA connected to {OPCUA_ENDPOINT}")

while True:
    try:
        ts = datetime.now(timezone.utc).isoformat()
        for node_id, (metric, unit) in NODE_MAP.items():
            node  = opc.get_node(node_id)
            value = float(node.get_value())
            topic = f"dcp/{PLANT_ID}/{MACHINE_ID}/{metric}"
            mq.publish(topic, json.dumps({
                "value":     round(value, 3),
                "unit":      unit,
                "timestamp": ts
            }), qos=1)
            log.info(f"PUB {topic} = {value} {unit}")
    except Exception as exc:
        log.error(f"Read error: {exc}")

    time.sleep(POLL_SECONDS)
```

---

## 9. Network and Security Architecture

### Recommended Network Topology

```
Plant Floor Network (192.168.10.x) — VLAN A (OT network)
  |
  |--- KILN-A PLC    192.168.10.10
  |--- MILL-01 PLC   192.168.10.11
  |--- COOLER-A I/O  192.168.10.12
  |
  |--- Edge Gateway   192.168.10.50  (reads PLCs via OPC-UA / Modbus)
         |
         | MQTT  port 1883  (over plant LAN or VPN)
         |
Plant Office Network (10.0.0.x) — VLAN B (IT network)
  |
  |--- DCP Server    10.0.0.5   port 4000 (Express + WebSocket + MQTT Broker)
  |--- MongoDB Atlas             (cloud, accessed via server only)
         |
         | HTTPS / WSS
         |
Operator Workstations / Browsers
  http://10.0.0.5:5173   (dashboard)
```

### Security Checklist

| Item | Recommendation |
|---|---|
| MQTT Authentication | Enable username and password authentication on the Aedes broker. Assign unique credentials per gateway. |
| MQTT TLS | In production, use port 8883 with TLS certificates. Terminate TLS at the broker. |
| Network Isolation | Place PLCs on a dedicated OT VLAN. The edge gateway bridges the OT VLAN to the IT network. No direct PLC-to-internet access. |
| VPN | If the DCP server is off-site or cloud-hosted, use WireGuard or OpenVPN between each gateway and the server. |
| Gateway Hardening | Disable SSH password login (use key-only). Disable unused services. Consider a read-only OS such as Ubuntu Core. |
| MongoDB Atlas | Use the IP allowlist feature. Restrict access to the DCP server IP only. Never leave 0.0.0.0/0 open in production. |
| Dashboard HTTPS | Serve the React dashboard behind Nginx with a TLS certificate (Let's Encrypt or corporate CA). |
| Firewall Rules | Only allow inbound port 1883 (MQTT) from known gateway IP ranges. Block all other inbound. |

---

## 10. Dangote-Specific Recommendations

Based on the typical Siemens automation infrastructure found at large-scale cement plants in Nigeria:

### Expected Control System Stack

| Layer | Typical Equipment |
|---|---|
| Field instruments | Endress+Hauser, Vega, Krohne sensors with 4-20 mA or HART output |
| PLCs | Siemens S7-300, S7-400, or S7-1500 |
| Drives | Siemens SINAMICS G120 / G150 (kiln motors, mill motors) |
| Remote I/O | Siemens ET 200M / ET 200SP on PROFINET |
| SCADA / HMI | Siemens WinCC V7 or PCS 7 |
| Plant network | PROFINET (shop floor) + Industrial Ethernet (office) |

### Recommended Rollout Phases

**Phase 1 — Pilot via WinCC OPC-UA (no PLC changes required)**

This is the fastest and least risky starting point. WinCC already aggregates all PLC tags:

1. Enable the OPC-UA server in WinCC Runtime settings (no licence cost for Siemens OPC-UA server)
2. Install Node-RED on a PC connected to the same LAN as the WinCC server
3. Use `node-red-contrib-opcua` to subscribe to KPI tags (temperature, efficiency, throughput)
4. Publish normalised values to the DCP MQTT broker
5. Validate readings appear on the dashboard

**Phase 2 — Direct S7-1500 OPC-UA Integration**

Siemens S7-1500 PLCs have a built-in OPC-UA server that is disabled by default:

1. Open TIA Portal and navigate to the PLC's Properties > General > OPC UA
2. Enable the OPC-UA server and set the port (default 4840)
3. Create an OPC-UA interface block in the PLC program exposing the required data blocks
4. Update the Node-RED bridge to point to the PLC endpoint directly instead of WinCC
5. This removes WinCC as a dependency and reduces latency

**Phase 3 — Plant-Wide Deployment**

For all three plants (Ibese, Obajana, Gboko):

- Deploy one edge gateway per production line (one kiln, one mill, one cooler per gateway)
- Use Siemens SIMATIC IPC227G hardware for industrial certification and vendor alignment
- Configure a centralised MQTT broker with TLS and per-gateway credentials
- Point all gateways to the same DCP server — the dashboard supports all three plants simultaneously

### WinCC Tag Naming Convention

WinCC OPC-UA node IDs typically follow this pattern:

```
ns=2;s=Simatic.S7-1500.Kiln_A.Temperature
ns=2;s=Simatic.S7-1500.Kiln_A.Efficiency
ns=2;s=Simatic.S7-1500.Mill_01.Throughput
```

The exact namespace and path depend on the WinCC project configuration. Use UaExpert to browse and find the correct node IDs before configuring the bridge.

---

## 11. Troubleshooting

### Dashboard shows no live data

1. Confirm the server is running: `curl http://localhost:4000/health`
2. Confirm MQTT messages are arriving at the broker: `mosquitto_sub -h localhost -p 1883 -t "dcp/#" -v`
3. Open the browser developer console (F12) and check for WebSocket connection errors
4. Confirm the `plantId` in MQTT messages exactly matches the plant selected in the dashboard sidebar (`IBESE-01`, `OBAJANA-01`, or `GBOKO-01`)

### Gateway cannot reach the PLC

1. Ping the PLC from the gateway: `ping 192.168.1.10`
2. For Modbus TCP: confirm port 502 is enabled on the PLC. Some PLCs require Modbus TCP to be explicitly activated in configuration. Use `nmap -p 502 192.168.1.10` to check.
3. For OPC-UA: confirm port 4840 is accessible. Use UaExpert from the gateway machine to verify connection before writing bridge code.
4. Check that the gateway and PLC are on the same VLAN or that routing between VLANs is configured.

### MQTT published but not appearing in dashboard

1. Check the topic exactly matches the pattern: `dcp/{plantId}/{machineId}/{metric}`
2. Confirm `value` in the payload is a number, not a string. Use `parseFloat()` in JavaScript or `float()` in Python.
3. Check the server log for validation rejections. The VAL-01 rule rejects values outside physical limits.
4. Use the Simulate Alerts panel in the dashboard (Alerts page) to confirm that the WebSocket connection is working end-to-end.

### Stale data alerts firing for a machine that is running

The VAL-02 rule fires when a sensor returns the same value for more than 60 consecutive seconds. Common causes:

- PLC in STOP or SAFE mode, clamping output registers to a fixed value
- Modbus read always returning register 0 due to wrong address configuration
- Network fault causing the gateway to replay a cached reading
- Sensor in test mode with a fixed test signal

Check the raw register values at the gateway using modpoll or the OPC-UA browser to confirm whether the physical sensor is actually changing.

### MongoDB connection fails on server startup

1. Check the `MONGODB_URI` value in `server/.env` — confirm the password does not contain characters that need URL encoding
2. In MongoDB Atlas, verify the IP of the server machine is in the Network Access allowlist
3. The server retries the connection up to 10 times with a 5-second delay. Check the server log for retry messages.
4. Temporarily add `0.0.0.0/0` to the Atlas allowlist to confirm it is a network issue rather than an authentication issue.

---

## 12. Glossary

| Term | Definition |
|---|---|
| PLC | Programmable Logic Controller. The embedded computer inside industrial machines that reads sensors, runs control logic, and drives actuators. |
| SCADA | Supervisory Control and Data Acquisition. The software layer that collects data from multiple PLCs, displays it to operators, and enables remote control. Siemens WinCC is an example. |
| DCS | Distributed Control System. Similar to SCADA but designed for continuous process control (e.g. cement kiln combustion). |
| OPC-UA | Open Platform Communications Unified Architecture. The modern, secure, vendor-neutral standard for reading data from industrial control systems over Ethernet. |
| Modbus | A serial/Ethernet communication protocol originating in 1979. Still widely used in sensors, meters, and legacy PLCs. Simple and reliable. |
| PROFINET | Siemens' industrial Ethernet protocol for real-time communication between PLCs and field devices. Successor to PROFIBUS. |
| MQTT | Message Queuing Telemetry Transport. A lightweight publish/subscribe messaging protocol used in IoT and industrial systems. |
| Edge Gateway | A computing device located near machinery on the plant floor that reads sensor data using industrial protocols and forwards it to a central server via MQTT. |
| Node-RED | A browser-based, low-code visual programming tool for wiring together hardware, APIs, and data streams. Popular for building MQTT bridges. |
| Time Series Database | A database optimised for storing and querying measurements indexed by time. MongoDB's native time-series collection is used in this platform. |
| OEE | Overall Equipment Effectiveness. A KPI combining Availability, Performance, and Quality into a single 0–100% score for a machine. |
| TTL | Time To Live. A database mechanism that automatically deletes records after a set age. This platform uses a 30-day TTL. |
| VFD | Variable Frequency Drive. An electronic device that controls the speed of an AC motor. Used extensively in cement mills and kilns. Also called an inverter or variable speed drive. |
| WinCC | Siemens' SCADA software. Widely deployed at cement plants. Exposes all PLC data via an OPC-UA server, making it a convenient integration point. |
| TIA Portal | Totally Integrated Automation Portal. Siemens' engineering software for programming S7 PLCs, configuring HMIs, and setting up drives. |
| QoS | Quality of Service. In MQTT, QoS 0 = fire-and-forget, QoS 1 = at-least-once delivery, QoS 2 = exactly-once delivery. This platform uses QoS 1. |
| VLAN | Virtual Local Area Network. A way to logically separate network traffic. Used to isolate OT (operational technology) plant networks from IT office networks. |
