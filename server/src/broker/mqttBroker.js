const aedes = require('aedes');
const net = require('net');
const { validate } = require('../validation/bouncer');

const MQTT_PORT = parseInt(process.env.MQTT_PORT) || 1883;

function startMqttBroker() {
  return new Promise((resolve, reject) => {
    const broker = aedes();

    broker.on('client', (client) => {
      console.log(`📡  MQTT client connected: ${client.id}`);
    });

    broker.on('clientDisconnect', (client) => {
      console.log(`📴  MQTT client disconnected: ${client.id}`);
    });

    broker.on('publish', async (packet, client) => {
      // Ignore system topics and messages from the broker itself
      if (!client || packet.topic.startsWith('$')) return;

      try {
        const raw = packet.payload.toString();
        const payload = JSON.parse(raw);

        // Expected topic: dcp/<plantId>/<machineId>/<metric>
        const parts = packet.topic.split('/');
        if (parts.length < 4 || parts[0] !== 'dcp') return;

        const [, plantId, machineId, metric] = parts;
        await validate({ plantId, machineId, metric, ...payload });
      } catch (err) {
        console.warn('[MQTT] Failed to process message:', err.message);
      }
    });

    broker.on('error', (err) => {
      console.error('[MQTT] Broker error:', err);
    });

    const tcpServer = net.createServer(broker.handle);
    tcpServer.listen(MQTT_PORT, () => {
      console.log(`📡  MQTT Broker listening on tcp://localhost:${MQTT_PORT}`);
      resolve(broker);
    });

    tcpServer.on('error', reject);
  });
}

module.exports = { startMqttBroker };
