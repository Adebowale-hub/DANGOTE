require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./db/connection');
const { startMqttBroker } = require('./broker/mqttBroker');
const { initWebSocket } = require('./websocket/broadcaster');
const apiRouter = require('./routes/api');

const PORT = process.env.PORT || 4000;

async function bootstrap() {
  // 1. Set up Express
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', apiRouter);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 2. Create HTTP server and attach WebSocket
  const server = http.createServer(app);
  initWebSocket(server);

  // 3. Start server immediately — don't wait for DB
  server.listen(PORT, () => {
    console.log(`\n🏭  DCP KPI Server running on http://localhost:${PORT}`);
    console.log(`📡  WebSocket available on ws://localhost:${PORT}`);
  });

  // 4. Start in-process MQTT broker
  await startMqttBroker();

  // 5. Connect to MongoDB in background with retries (non-blocking)
  connectWithRetry();
}

async function connectWithRetry(attempt = 1) {
  const MAX_ATTEMPTS = 10;
  const RETRY_DELAY_MS = 5000;

  try {
    await connectDB();
    console.log('✅  Database layer ready — telemetry persistence active');
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      console.log(`⏳  MongoDB retry ${attempt}/${MAX_ATTEMPTS} in ${RETRY_DELAY_MS / 1000}s...`);
      setTimeout(() => connectWithRetry(attempt + 1), RETRY_DELAY_MS);
    } else {
      console.error('❌  MongoDB unavailable after max retries — running in memory-only mode');
      console.error('    Dashboard and WebSocket are still fully operational');
    }
  }
}
bootstrap().catch((err) => {
  console.error('❌  Bootstrap failed:', err);
  process.exit(1);
});
