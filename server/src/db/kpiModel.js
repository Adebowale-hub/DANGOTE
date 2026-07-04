const mongoose = require('mongoose');

const kpiTelemetrySchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      required: true,
    },
    metadata: {
      plantId: { type: String, required: true, index: true },
      machineId: { type: String, required: true, index: true },
      metric: { type: String, required: true, index: true },
    },
    value: {
      type: Number,
      required: true,
    },
    qualityFlag: {
      type: String,
      enum: ['OK', 'STALE', 'OUT_OF_BOUNDS', 'NOISE', 'INTERPOLATED'],
      default: 'OK',
    },
    rawValue: {
      type: Number, // original value before any interpolation
    },
  },
  {
    timeseries: {
      timeField: 'timestamp',
      metaField: 'metadata',
      granularity: 'seconds',
    },
    autoCreate: false, // we create the collection explicitly in connection.js
  }
);

const KpiTelemetry = mongoose.model('KpiTelemetry', kpiTelemetrySchema);
module.exports = KpiTelemetry;
