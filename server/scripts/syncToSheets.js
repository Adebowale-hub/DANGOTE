/**
 * Standalone Google Sheets Sync Runner
 *
 * Run with: npm run sync:sheets
 *
 * Connects to MongoDB, then syncs to Google Sheets on a recurring schedule.
 * Can also be run once with: node syncToSheets.js --once
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const cron = require('node-cron');
const { connectDB } = require('../src/db/connection');
const { runSync, SYNC_INTERVAL_MINUTES } = require('../src/sheets/sheetsSync');

const RUN_ONCE = process.argv.includes('--once');

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   DCP KPI → Google Sheets Sync Service       ║');
  console.log('║   Dangote Cement Plc — Challenge 4           ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // Validate config before connecting
  if (!process.env.GOOGLE_SHEETS_ID) {
    console.error('❌  GOOGLE_SHEETS_ID is not set in server/.env');
    console.error('    Please follow the setup guide in README.md\n');
    process.exit(1);
  }

  const credPath =
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH ||
    require('path').join(__dirname, '../google-credentials.json');

  if (!require('fs').existsSync(credPath)) {
    console.error(`❌  Google credentials file not found at: ${credPath}`);
    console.error('    Please follow the setup guide in README.md\n');
    process.exit(1);
  }

  // Connect to MongoDB
  await connectDB();

  if (RUN_ONCE) {
    console.log('📋  Running one-time sync...\n');
    await runSync();
    console.log('\n✅  One-time sync complete. Exiting.');
    process.exit(0);
  }

  // Initial sync immediately on startup
  await runSync();

  // Then schedule recurring sync
  const cronExpression = `*/${SYNC_INTERVAL_MINUTES} * * * *`;
  console.log(`\n⏱️   Scheduled sync every ${SYNC_INTERVAL_MINUTES} minutes`);
  console.log(`📊  Google Sheet: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEETS_ID}\n`);

  cron.schedule(cronExpression, async () => {
    await runSync();
  });

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n[Sheets] Sync service stopped.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('❌  Fatal error:', err.message);
  process.exit(1);
});
