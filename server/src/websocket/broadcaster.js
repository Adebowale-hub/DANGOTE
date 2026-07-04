const { WebSocketServer } = require('ws');

let wss = null;

function initWebSocket(httpServer) {
  wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`🔌  WebSocket client connected from ${clientIp}`);

    ws.send(
      JSON.stringify({
        type: 'CONNECTED',
        message: 'DCP KPI Pipeline — WebSocket stream active',
        timestamp: new Date().toISOString(),
      })
    );

    ws.on('error', (err) => {
      console.warn('[WS] Client error:', err.message);
    });

    ws.on('close', () => {
      console.log(`🔌  WebSocket client disconnected from ${clientIp}`);
    });
  });

  console.log('🔌  WebSocket server initialized');
}

function broadcast(data) {
  if (!wss) return;

  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      // OPEN
      client.send(message);
    }
  });
}

function getConnectedCount() {
  return wss ? wss.clients.size : 0;
}

module.exports = { initWebSocket, broadcast, getConnectedCount };
