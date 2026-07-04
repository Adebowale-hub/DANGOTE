/**
 * DCP Factory Floor Simulator
 *
 * Connects to the in-process MQTT broker and publishes realistic
 * time-series data for 3 plants × 4 machines × 8 metrics.
 *
 * Simulates:
 *  - Normal operation (most of the time)
 *  - Random out-of-bounds spikes (VAL-01 test)
 *  - Stale sensors (VAL-02 test)
 *  - Conversion loss events (EX-01 test)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mqtt = require('mqtt');

const BROKER_URL = 'mqtt://localhost:1883';

const PLANTS = [
  {
    id: 'IBESE-01',
    machines: [
      { id: 'KILN-A', type: 'KILN' },
      { id: 'KILN-B', type: 'KILN' },
      { id: 'MILL-01', type: 'MILL' },
      { id: 'COOLER-A', type: 'COOLER' },
    ],
  },
  {
    id: 'OBAJANA-01',
    machines: [
      { id: 'KILN-A', type: 'KILN' },
      { id: 'KILN-B', type: 'KILN' },
      { id: 'MILL-02', type: 'MILL' },
      { id: 'COOLER-B', type: 'COOLER' },
    ],
  },
  {
    id: 'GBOKO-01',
    machines: [
      { id: 'KILN-A', type: 'KILN' },
      { id: 'MILL-03', type: 'MILL' },
      { id: 'COOLER-C', type: 'COOLER' },
    ],
  },
];

// Metric definitions per machine type
const MACHINE_METRICS = {
  KILN: {
    KILN_TEMP: { base: 1450, noise: 30, unit: '°C' },
    FEED_RATE: { base: 280, noise: 20, unit: 't/h' },
    FUEL_INPUT: { base: 85, noise: 8, unit: 'GJ/t' },
    CLINKER_OUTPUT: { base: 260, noise: 15, unit: 't/h' },
    POWER_DRAW: { base: 4200, noise: 300, unit: 'kW' },
  },
  MILL: {
    MILL_PRESSURE: { base: 320, noise: 25, unit: 'mbar' },
    POWER_DRAW: { base: 6500, noise: 500, unit: 'kW' },
    FEED_RATE: { base: 180, noise: 15, unit: 't/h' },
    FAN_SPEED: { base: 950, noise: 50, unit: 'RPM' },
  },
  COOLER: {
    COOLER_TEMP: { base: 900, noise: 80, unit: '°C' },
    FAN_SPEED: { base: 800, noise: 60, unit: 'RPM' },
    POWER_DRAW: { base: 2800, noise: 200, unit: 'kW' },
  },
};

// Simulation state per sensor
const sensorState = new Map();

function gaussian(mean, stdDev) {
  // Box-Muller transform
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stdDev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function getOrInitState(key, base) {
  if (!sensorState.has(key)) {
    sensorState.set(key, {
      value: base,
      staleUntil: 0,
      spikeAt: 0,
      conversionLowUntil: 0,
    });
  }
  return sensorState.get(key);
}

function nextValue(plantId, machineId, metric, def) {
  const key = `${plantId}::${machineId}::${metric}`;
  const state = getOrInitState(key, def.base);
  const now = Date.now();

  // 0.3% chance of going stale for 90 seconds
  if (Math.random() < 0.003 && now > state.staleUntil) {
    state.staleUntil = now + 90_000;
    console.log(`[SIM] Stale sensor triggered: ${key}`);
  }

  // 0.2% chance of out-of-bounds spike
  if (Math.random() < 0.002) {
    state.spikeAt = now;
    const spikeDir = Math.random() > 0.5 ? 1 : -1;
    const spikeValue =
      spikeDir > 0
        ? def.base * 2.5 + def.noise // way above max
        : -Math.abs(def.base) - 100; // below min
    console.log(`[SIM] Out-of-bounds spike: ${key} → ${spikeValue.toFixed(1)}`);
    return parseFloat(spikeValue.toFixed(2));
  }

  // Stale sensor — return unchanged value
  if (now < state.staleUntil) {
    return state.value;
  }

  // Normal Gaussian noise around base
  const newVal = gaussian(def.base, def.noise * 0.4);
  state.value = parseFloat(Math.max(0, newVal).toFixed(2));
  return state.value;
}

async function runSimulator() {
  console.log('\n🏭  DCP Factory Floor Simulator starting...');
  console.log(`📡  Connecting to MQTT broker at ${BROKER_URL}\n`);

  const client = mqtt.connect(BROKER_URL, {
    clientId: `dcp-simulator-${Date.now()}`,
    reconnectPeriod: 2000,
  });

  client.on('connect', () => {
    console.log('✅  Simulator connected to MQTT broker\n');
    startPublishing(client);
  });

  client.on('error', (err) => {
    console.error('[SIM] MQTT error:', err.message);
  });
}

function startPublishing(client) {
  // Publish each sensor every 2-4 seconds (randomized per sensor)
  PLANTS.forEach((plant) => {
    plant.machines.forEach((machine) => {
      const metrics = MACHINE_METRICS[machine.type] || {};

      Object.entries(metrics).forEach(([metric, def]) => {
        // Stagger initial intervals to avoid burst
        const initialDelay = Math.floor(Math.random() * 3000);
        const interval = 2000 + Math.floor(Math.random() * 2000);

        setTimeout(() => {
          setInterval(() => {
            const value = nextValue(plant.id, machine.id, metric, def);
            const topic = `dcp/${plant.id}/${machine.id}/${metric}`;
            const payload = JSON.stringify({
              value,
              timestamp: new Date().toISOString(),
            });

            client.publish(topic, payload, { qos: 0 }, (err) => {
              if (err) console.warn('[SIM] Publish error:', err.message);
            });
          }, interval);
        }, initialDelay);
      });
    });
  });

  console.log(
    `[SIM] Publishing data for ${PLANTS.length} plants, ` +
      `${PLANTS.reduce((s, p) => s + p.machines.length, 0)} machines\n`
  );
}

runSimulator().catch(console.error);
