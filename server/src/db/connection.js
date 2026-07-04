const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dcp_kpi';

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000, // wait 30s for Atlas to respond
      connectTimeoutMS: 30000,
    });
    isConnected = true;
    console.log(`✅  MongoDB connected: ${uri.split('@').pop()}`);

    // Ensure Time Series collection exists
    await ensureTimeSeriesCollection();
  } catch (err) {
    console.error('❌  MongoDB connection error:', err.message);
    throw err;
  }
}

async function ensureTimeSeriesCollection() {
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: 'kpitelemetries' }).toArray();

  if (collections.length === 0) {
    try {
      await db.createCollection('kpitelemetries', {
        timeseries: {
          timeField: 'timestamp',
          metaField: 'metadata',
          granularity: 'seconds',
        },
        expireAfterSeconds: 60 * 60 * 24 * 30, // 30-day hot retention
      });
      console.log('📊  MongoDB Time Series collection created: kpitelemetries');
    } catch (err) {
      if (err.code === 48) {
        // NamespaceExists — collection was created in a prior run, that's fine
        console.log('📊  MongoDB Time Series collection already exists: kpitelemetries');
      } else {
        throw err;
      }
    }
  } else {
    console.log('📊  MongoDB Time Series collection ready: kpitelemetries');
  }
}

module.exports = { connectDB };
