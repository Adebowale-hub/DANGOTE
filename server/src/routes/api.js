const express = require('express');
const KpiTelemetry = require('../db/kpiModel');
const { broadcast, getConnectedCount } = require('../websocket/broadcaster');

const router = express.Router();

// ─── GET /api/plants ────────────────────────────────────────────
// Returns list of known plants with their machine IDs
router.get('/plants', (req, res) => {
  res.json({
    plants: [
      {
        id: 'IBESE-01',
        name: 'Ibese Plant',
        location: 'Ogun State, Nigeria',
        machines: ['KILN-A', 'KILN-B', 'MILL-01', 'COOLER-A'],
      },
      {
        id: 'OBAJANA-01',
        name: 'Obajana Plant',
        location: 'Kogi State, Nigeria',
        machines: ['KILN-A', 'KILN-B', 'MILL-02', 'COOLER-B'],
      },
      {
        id: 'GBOKO-01',
        name: 'Gboko Plant',
        location: 'Benue State, Nigeria',
        machines: ['KILN-A', 'MILL-03', 'COOLER-C'],
      },
    ],
  });
});

// ─── GET /api/telemetry ─────────────────────────────────────────
// Returns latest N readings per plant, optionally filtered
// Query params: plantId, machineId, metric, limit (default 100)
router.get('/telemetry', async (req, res) => {
  try {
    const { plantId, machineId, metric, limit = 100 } = req.query;

    const filter = {};
    if (plantId) filter['metadata.plantId'] = plantId;
    if (machineId) filter['metadata.machineId'] = machineId;
    if (metric) filter['metadata.metric'] = metric;

    const data = await KpiTelemetry.find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json({ count: data.length, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/telemetry/latest ──────────────────────────────────
// Returns the single latest value for each metric per machine
router.get('/telemetry/latest', async (req, res) => {
  try {
    const { plantId } = req.query;

    const matchStage = plantId
      ? { $match: { 'metadata.plantId': plantId } }
      : { $match: {} };

    const latest = await KpiTelemetry.aggregate([
      matchStage,
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: {
            plantId: '$metadata.plantId',
            machineId: '$metadata.machineId',
            metric: '$metadata.metric',
          },
          latestValue: { $first: '$value' },
          latestTimestamp: { $first: '$timestamp' },
          qualityFlag: { $first: '$qualityFlag' },
        },
      },
    ]);

    res.json({ data: latest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/telemetry/timeseries ─────────────────────────────
// Returns time-bucketed data for a specific metric (for charts)
// Query params: plantId, machineId, metric, hours (default 24)
router.get('/telemetry/timeseries', async (req, res) => {
  try {
    const { plantId, machineId, metric, hours = 24 } = req.query;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const filter = {
      timestamp: { $gte: since },
      qualityFlag: { $in: ['OK', 'INTERPOLATED'] },
    };
    if (plantId) filter['metadata.plantId'] = plantId;
    if (machineId) filter['metadata.machineId'] = machineId;
    if (metric) filter['metadata.metric'] = metric;

    const data = await KpiTelemetry.find(filter)
      .sort({ timestamp: 1 })
      .select('timestamp value qualityFlag -_id');

    res.json({ metric, plantId, machineId, count: data.length, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/quality ───────────────────────────────────────────
// Returns data quality breakdown for a plant
router.get('/quality', async (req, res) => {
  try {
    const { plantId, hours = 24 } = req.query;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const filter = { timestamp: { $gte: since } };
    if (plantId) filter['metadata.plantId'] = plantId;

    const breakdown = await KpiTelemetry.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$qualityFlag',
          count: { $sum: 1 },
        },
      },
    ]);

    const total = breakdown.reduce((s, b) => s + b.count, 0);
    const result = breakdown.map((b) => ({
      flag: b._id,
      count: b.count,
      percentage: total > 0 ? parseFloat(((b.count / total) * 100).toFixed(1)) : 0,
    }));

    res.json({ total, breakdown: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/oee ───────────────────────────────────────────────
// Overall Equipment Effectiveness per machine (simplified)
router.get('/oee', async (req, res) => {
  try {
    const { plantId, hours = 24 } = req.query;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const filter = { timestamp: { $gte: since } };
    if (plantId) filter['metadata.plantId'] = plantId;

    const oeeData = await KpiTelemetry.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { machineId: '$metadata.machineId' },
          totalReadings: { $sum: 1 },
          okReadings: {
            $sum: { $cond: [{ $eq: ['$qualityFlag', 'OK'] }, 1, 0] },
          },
          avgValue: { $avg: '$value' },
          staleCount: {
            $sum: { $cond: [{ $eq: ['$qualityFlag', 'STALE'] }, 1, 0] },
          },
          outOfBoundsCount: {
            $sum: { $cond: [{ $eq: ['$qualityFlag', 'OUT_OF_BOUNDS'] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          machineId: '$_id.machineId',
          availability: {
            $multiply: [
              { $divide: ['$okReadings', '$totalReadings'] },
              100,
            ],
          },
          totalReadings: 1,
          avgValue: 1,
          staleCount: 1,
          outOfBoundsCount: 1,
        },
      },
    ]);

    res.json({ data: oeeData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/status ────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({
    status: 'operational',
    wsClients: getConnectedCount(),
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// ─── POST /api/simulate/alert ────────────────────────────────────
// Injects a synthetic ALERT_FIRED event for demo / testing purposes.
// Body: { severity, alertType, plantId, machineId, message, efficiency, threshold }
router.post('/simulate/alert', (req, res) => {
  const {
    severity = 'WARNING',
    alertType = 'MANUAL_TEST',
    plantId = 'IBESE-01',
    machineId = 'KILN-A',
    message = 'Simulated alert',
    efficiency = null,
    threshold = null,
  } = req.body;

  const payload = {
    type: 'ALERT_FIRED',
    severity,
    alertType,
    plantId,
    machineId,
    message,
    timestamp: new Date().toISOString(),
    ...(efficiency !== null && { efficiency }),
    ...(threshold !== null && { threshold }),
  };

  broadcast(payload);
  console.log(`🧪  Simulated alert broadcast: [${severity}] ${alertType} @ ${plantId}/${machineId}`);
  res.json({ ok: true, broadcast: payload });
});

// ─── POST /api/simulate/clear-alert ──────────────────────────────
// Clears a previously simulated alert by type + machine.
router.post('/simulate/clear-alert', (req, res) => {
  const {
    alertType = 'MANUAL_TEST',
    plantId = 'IBESE-01',
    machineId = 'KILN-A',
  } = req.body;

  const payload = {
    type: 'ALERT_CLEARED',
    alertType,
    plantId,
    machineId,
    timestamp: new Date().toISOString(),
  };

  broadcast(payload);
  res.json({ ok: true, broadcast: payload });
});

module.exports = router;
