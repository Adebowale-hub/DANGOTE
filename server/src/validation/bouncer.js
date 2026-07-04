/**
 * THE BOUNCER — DCP Data Quality Validation Engine
 *
 * Responsibilities:
 *  VAL-01: Absolute range checks (physically impossible values)
 *  VAL-02: Stale data detection (frozen sensors)
 *  VAL-03: Linear interpolation for short gaps (<5 min)
 *  EX-01:  Conversion loss trigger (fuel vs clinker ratio <85% for >60 min)
 */

const { broadcast } = require('../websocket/broadcaster');
const KpiTelemetry = require('../db/kpiModel');
const EventEmitter = require('events');

// ─────────────────────────────────────────────
// VAL-01: Absolute range limits per metric type
// ─────────────────────────────────────────────
const METRIC_RANGES = {
  KILN_TEMP: { min: 800, max: 2500, unit: '°C' },
  FEED_RATE: { min: 0, max: 600, unit: 't/h' },
  CLINKER_OUTPUT: { min: 0, max: 500, unit: 't/h' },
  FUEL_INPUT: { min: 0, max: 200, unit: 'GJ/t' },
  POWER_DRAW: { min: 0, max: 15000, unit: 'kW' },
  COOLER_TEMP: { min: 50, max: 1500, unit: '°C' },
  MILL_PRESSURE: { min: 0, max: 800, unit: 'mbar' },
  FAN_SPEED: { min: 0, max: 1500, unit: 'RPM' },
};

// VAL-02: Stale sensor detection window (ms)
const STALE_THRESHOLD_MS = 60 * 1000; // 60 seconds

// VAL-03: Max gap for interpolation (ms)
const INTERPOLATION_MAX_GAP_MS = 5 * 60 * 1000; // 5 minutes

// EX-01: Conversion loss thresholds
const CONVERSION_EFFICIENCY_THRESHOLD = 0.85; // 85%
const CONVERSION_ALERT_DURATION_MS = 60 * 60 * 1000; // 60 minutes

// ─────────────────────────────────────────────
// In-memory state stores
// ─────────────────────────────────────────────

// Map<sensorKey, { lastValue, lastChangeTime, lastSeenTime }>
const sensorStateMap = new Map();

// Map<plantId, { fuelInput[], clinkerOutput[], lowSince: Date|null }>
const conversionWindowMap = new Map();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function sensorKey(plantId, machineId, metric) {
  return `${plantId}::${machineId}::${metric}`;
}

function lerp(v0, v1, t) {
  return v0 + t * (v1 - v0);
}

// ─────────────────────────────────────────────
// Main validation function
// ─────────────────────────────────────────────
async function validate(payload) {
  const { plantId, machineId, metric, value, timestamp } = payload;
  const ts = timestamp ? new Date(timestamp) : new Date();
  const key = sensorKey(plantId, machineId, metric);
  const range = METRIC_RANGES[metric];

  const result = {
    timestamp: ts,
    metadata: { plantId, machineId, metric },
    value,
    rawValue: value,
    qualityFlag: 'OK',
  };

  // ── VAL-01: Range Check ──────────────────────────────
  if (range) {
    if (value < range.min || value > range.max) {
      result.qualityFlag = 'OUT_OF_BOUNDS';
      console.warn(
        `[BOUNCER] OUT_OF_BOUNDS | ${key} | value=${value} range=[${range.min},${range.max}]`
      );
      await persist(result);
      broadcastTelemetry(result);
      return result;
    }
  }

  // ── VAL-02: Stale Data Detection ─────────────────────
  const now = Date.now();
  const prevState = sensorStateMap.get(key);

  if (prevState) {
    const unchanged = value === prevState.lastValue;
    const timeSinceChange = now - prevState.lastChangeTime;

    if (unchanged && timeSinceChange > STALE_THRESHOLD_MS) {
      result.qualityFlag = 'STALE';
      console.warn(
        `[BOUNCER] STALE | ${key} | unchanged for ${Math.round(timeSinceChange / 1000)}s`
      );
    }

    // ── VAL-03: Gap detection + interpolation ──────────
    const timeSinceLastSeen = now - prevState.lastSeenTime;
    if (
      timeSinceLastSeen > 0 &&
      timeSinceLastSeen < INTERPOLATION_MAX_GAP_MS &&
      result.qualityFlag === 'OK'
    ) {
      // Sensor was offline briefly — emit interpolated bridging point
      const bridgeTs = new Date(prevState.lastSeenTime + timeSinceLastSeen / 2);
      const bridgeValue = lerp(prevState.lastValue, value, 0.5);

      const bridgeRecord = {
        timestamp: bridgeTs,
        metadata: { plantId, machineId, metric },
        value: parseFloat(bridgeValue.toFixed(2)),
        rawValue: null,
        qualityFlag: 'INTERPOLATED',
      };

      await persist(bridgeRecord);
    }
  }

  // Update state
  sensorStateMap.set(key, {
    lastValue: value,
    lastChangeTime:
      prevState && value === prevState.lastValue
        ? prevState.lastChangeTime
        : now,
    lastSeenTime: now,
  });

  // ── EX-01: Conversion Loss Check ──────────────────────
  if (metric === 'FUEL_INPUT' || metric === 'CLINKER_OUTPUT') {
    await checkConversionLoss(plantId, machineId, metric, value, ts);
  }

  await persist(result);
  broadcastTelemetry(result);
  return result;
}

// ─────────────────────────────────────────────
// EX-01: Conversion Loss Trigger
// ─────────────────────────────────────────────
async function checkConversionLoss(plantId, machineId, metric, value, ts) {
  const plantKey = `${plantId}::${machineId}`;
  if (!conversionWindowMap.has(plantKey)) {
    conversionWindowMap.set(plantKey, {
      fuelInput: [],
      clinkerOutput: [],
      lowSince: null,
      alertActive: false,
    });
  }

  const state = conversionWindowMap.get(plantKey);
  const WINDOW_MS = CONVERSION_ALERT_DURATION_MS;

  // Push new reading
  if (metric === 'FUEL_INPUT') state.fuelInput.push({ ts, value });
  if (metric === 'CLINKER_OUTPUT') state.clinkerOutput.push({ ts, value });

  // Prune entries older than the window
  const cutoff = Date.now() - WINDOW_MS;
  state.fuelInput = state.fuelInput.filter((r) => r.ts.getTime() > cutoff);
  state.clinkerOutput = state.clinkerOutput.filter((r) => r.ts.getTime() > cutoff);

  // Need readings from both metrics to evaluate
  if (state.fuelInput.length === 0 || state.clinkerOutput.length === 0) return;

  const avgFuel =
    state.fuelInput.reduce((s, r) => s + r.value, 0) / state.fuelInput.length;
  const avgClinker =
    state.clinkerOutput.reduce((s, r) => s + r.value, 0) /
    state.clinkerOutput.length;

  // Efficiency = clinker output / fuel input (normalized to expected ratio)
  // We model efficiency as: clinkerOutput / (fuelInput * EXPECTED_YIELD)
  const EXPECTED_YIELD = 3.0; // Expected clinker t/h per GJ/t fuel
  const efficiency = avgFuel > 0 ? avgClinker / (avgFuel * EXPECTED_YIELD) : 1;

  if (efficiency < CONVERSION_EFFICIENCY_THRESHOLD) {
    if (!state.lowSince) {
      state.lowSince = new Date();
    }

    const lowDuration = Date.now() - state.lowSince.getTime();

    if (lowDuration >= CONVERSION_ALERT_DURATION_MS && !state.alertActive) {
      state.alertActive = true;
      const alert = {
        type: 'ALERT_FIRED',
        alertType: 'CONVERSION_LOSS',
        plantId,
        machineId,
        efficiency: parseFloat((efficiency * 100).toFixed(1)),
        threshold: CONVERSION_EFFICIENCY_THRESHOLD * 100,
        lowSince: state.lowSince.toISOString(),
        timestamp: new Date().toISOString(),
        severity: 'CRITICAL',
        message: `Conversion efficiency at ${(efficiency * 100).toFixed(1)}% — below 85% threshold for >1 hour`,
      };
      console.error(`[BOUNCER] 🔴 CONVERSION_LOSS ALERT | ${plantKey} | eff=${(efficiency * 100).toFixed(1)}%`);
      broadcast(alert);
    }
  } else {
    // Efficiency recovered
    if (state.alertActive) {
      state.alertActive = false;
      broadcast({
        type: 'ALERT_CLEARED',
        alertType: 'CONVERSION_LOSS',
        plantId,
        machineId,
        timestamp: new Date().toISOString(),
      });
    }
    state.lowSince = null;
  }
}

// ─────────────────────────────────────────────
// Persist to MongoDB
// ─────────────────────────────────────────────
async function persist(record) {
  try {
    await KpiTelemetry.create(record);
  } catch (err) {
    // Don't crash the pipeline on DB errors
    console.error('[BOUNCER] DB persist error:', err.message);
  }
}

// ─────────────────────────────────────────────
// Broadcast validated telemetry via WebSocket
// ─────────────────────────────────────────────
function broadcastTelemetry(record) {
  broadcast({
    type: 'TELEMETRY_UPDATE',
    ...record,
    timestamp: record.timestamp.toISOString(),
  });
}

module.exports = { validate };
