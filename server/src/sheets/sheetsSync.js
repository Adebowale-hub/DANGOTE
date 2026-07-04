/**
 * DCP → Google Sheets Sync Service
 *
 * Reads validated KPI telemetry from MongoDB and writes it to two sheets:
 *   Sheet 1 "Telemetry Log"  — append-only time-series log of all readings
 *   Sheet 2 "Live Summary"   — overwritten each sync with the latest value per sensor
 *   Sheet 3 "Alerts Log"     — (future) alert history
 *
 * Auth: Google Service Account (no browser login needed)
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// ── Config ────────────────────────────────────────────────────
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const CREDENTIALS_PATH =
  process.env.GOOGLE_SERVICE_ACCOUNT_PATH ||
  path.join(__dirname, '../../google-credentials.json');

const SYNC_INTERVAL_MINUTES = parseInt(process.env.SHEETS_SYNC_INTERVAL_MINUTES) || 5;

// Metric → human-readable unit label
const METRIC_UNITS = {
  KILN_TEMP:      '°C',
  FEED_RATE:      't/h',
  CLINKER_OUTPUT: 't/h',
  FUEL_INPUT:     'GJ/t',
  POWER_DRAW:     'kW',
  COOLER_TEMP:    '°C',
  MILL_PRESSURE:  'mbar',
  FAN_SPEED:      'RPM',
};

// ── Google Sheets client ──────────────────────────────────────
function createSheetsClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Google credentials file not found at: ${CREDENTIALS_PATH}\n` +
        'Please follow the setup guide in README.md to create a Service Account.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// ── Ensure sheets exist with headers ─────────────────────────
async function ensureSheets(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existingSheets = meta.data.sheets.map((s) => s.properties.title);

  const required = [
    { title: 'Telemetry Log', headers: [
      ['Timestamp', 'Plant ID', 'Machine ID', 'Metric', 'Value', 'Unit', 'Quality Flag'],
    ]},
    { title: 'Live Summary', headers: [
      ['Last Updated', 'Plant ID', 'Machine ID', 'Metric', 'Latest Value', 'Unit', 'Quality Flag', 'Status'],
    ]},
    { title: 'Alerts Log', headers: [
      ['Timestamp', 'Plant ID', 'Machine ID', 'Alert Type', 'Severity', 'Efficiency %', 'Message', 'Status'],
    ]},
  ];

  const requests = [];
  for (const sheet of required) {
    if (!existingSheets.includes(sheet.title)) {
      requests.push({ addSheet: { properties: { title: sheet.title } } });
    }
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });
    console.log(`[Sheets] Created ${requests.length} new sheet(s)`);
  }

  // Write headers if sheets were just created (or always refresh row 1)
  for (const sheet of required) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheet.title}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: sheet.headers },
    });
  }

  // Style header rows bold + freeze them
  const updatedMeta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const styleRequests = [];

  for (const sheet of required) {
    const sheetObj = updatedMeta.data.sheets.find((s) => s.properties.title === sheet.title);
    if (!sheetObj) continue;
    const sheetId = sheetObj.properties.sheetId;

    styleRequests.push(
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true, fontSize: 10 },
              backgroundColor: { red: 0.05, green: 0.05, blue: 0.1 },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
        },
      },
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount',
        },
      }
    );
  }

  if (styleRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: styleRequests },
    });
  }

  console.log('[Sheets] Sheet structure verified ✓');
}

// ── Sync telemetry log (append new rows) ─────────────────────
async function syncTelemetryLog(sheets, KpiTelemetry, lastSyncTime) {
  const since = lastSyncTime || new Date(Date.now() - SYNC_INTERVAL_MINUTES * 60 * 1000);

  const records = await KpiTelemetry.find({
    timestamp: { $gte: since },
    qualityFlag: { $in: ['OK', 'STALE', 'OUT_OF_BOUNDS', 'INTERPOLATED'] },
  })
    .sort({ timestamp: 1 })
    .limit(5000); // safety cap per sync

  if (records.length === 0) {
    console.log('[Sheets] No new telemetry records to append');
    return;
  }

  const rows = records.map((r) => [
    new Date(r.timestamp).toISOString(),
    r.metadata.plantId,
    r.metadata.machineId,
    r.metadata.metric,
    r.value,
    METRIC_UNITS[r.metadata.metric] || '',
    r.qualityFlag,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "'Telemetry Log'!A2",
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`[Sheets] ✅ Appended ${rows.length} rows to "Telemetry Log"`);
}

// ── Sync live summary (overwrite all rows after header) ───────
async function syncLiveSummary(sheets, KpiTelemetry) {
  // Get the latest reading per unique plant+machine+metric combo
  const latest = await KpiTelemetry.aggregate([
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: {
          plantId: '$metadata.plantId',
          machineId: '$metadata.machineId',
          metric: '$metadata.metric',
        },
        latestTimestamp: { $first: '$timestamp' },
        latestValue: { $first: '$value' },
        qualityFlag: { $first: '$qualityFlag' },
      },
    },
    { $sort: { '_id.plantId': 1, '_id.machineId': 1, '_id.metric': 1 } },
  ]);

  if (latest.length === 0) {
    console.log('[Sheets] No data for Live Summary');
    return;
  }

  const now = new Date().toISOString();

  const rows = latest.map((r) => {
    const statusEmoji =
      r.qualityFlag === 'OK'
        ? '✅ Normal'
        : r.qualityFlag === 'STALE'
        ? '⚠️ Stale'
        : r.qualityFlag === 'OUT_OF_BOUNDS'
        ? '🔴 Out of Range'
        : r.qualityFlag === 'INTERPOLATED'
        ? '🔵 Interpolated'
        : r.qualityFlag;

    return [
      new Date(r.latestTimestamp).toISOString(),
      r._id.plantId,
      r._id.machineId,
      r._id.metric,
      r.latestValue,
      METRIC_UNITS[r._id.metric] || '',
      r.qualityFlag,
      statusEmoji,
    ];
  });

  // Clear old data (keep header row 1) then write fresh
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: "'Live Summary'!A2:Z10000",
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'Live Summary'!A2",
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });

  console.log(`[Sheets] ✅ Updated "Live Summary" with ${rows.length} sensors`);
}

// ── Color-code quality flag column in Telemetry Log ──────────
async function colorCodeQualityFlags(sheets) {
  // Get the current row count to know how far to apply conditional formatting
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const logSheet = meta.data.sheets.find((s) => s.properties.title === 'Telemetry Log');
  if (!logSheet) return;

  const sheetId = logSheet.properties.sheetId;
  const rowCount = logSheet.properties.gridProperties.rowCount || 1000;

  // Apply color-coded conditional formatting to the Quality Flag column (G = index 6)
  const rules = [
    {
      condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'OK' }] },
      format: { backgroundColor: { red: 0.13, green: 0.37, blue: 0.23 } },
    },
    {
      condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'STALE' }] },
      format: { backgroundColor: { red: 0.5, green: 0.37, blue: 0.0 } },
    },
    {
      condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'OUT_OF_BOUNDS' }] },
      format: { backgroundColor: { red: 0.55, green: 0.1, blue: 0.1 } },
    },
    {
      condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'INTERPOLATED' }] },
      format: { backgroundColor: { red: 0.1, green: 0.22, blue: 0.45 } },
    },
  ];

  const requests = rules.map((rule) => ({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 6, endColumnIndex: 7 }],
        booleanRule: rule,
      },
      index: 0,
    },
  }));

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });
  } catch {
    // Ignore if rules already exist
  }
}

// ── Main sync function ────────────────────────────────────────
let lastSyncTime = null;
let KpiTelemetry = null;

async function runSync() {
  if (!SPREADSHEET_ID) {
    console.error('[Sheets] ❌ GOOGLE_SHEETS_ID not set in .env — skipping sync');
    return;
  }

  const syncStart = new Date();
  console.log(`\n[Sheets] 🔄 Sync started at ${syncStart.toISOString()}`);

  try {
    const sheets = createSheetsClient();

    // Lazy-load the Mongoose model
    if (!KpiTelemetry) {
      KpiTelemetry = require('../db/kpiModel');
    }

    await ensureSheets(sheets);
    await syncTelemetryLog(sheets, KpiTelemetry, lastSyncTime);
    await syncLiveSummary(sheets, KpiTelemetry);
    await colorCodeQualityFlags(sheets);

    lastSyncTime = syncStart;
    console.log(`[Sheets] ✅ Sync complete in ${Date.now() - syncStart.getTime()}ms`);
  } catch (err) {
    console.error('[Sheets] ❌ Sync error:', err.message);
  }
}

module.exports = { runSync, SYNC_INTERVAL_MINUTES };
