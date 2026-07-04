import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = `ws://${window.location.hostname}:4000`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // exponential backoff

export function useWebSocket() {
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const listenersRef = useRef(new Set());

  const [status, setStatus] = useState('CONNECTING'); // CONNECTING | CONNECTED | DISCONNECTED | ERROR

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('CONNECTING');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      setStatus('CONNECTED');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        listenersRef.current.forEach((cb) => cb(data));
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setStatus('DISCONNECTED');
      scheduleReconnect();
    };

    ws.onerror = () => {
      setStatus('ERROR');
      ws.close();
    };
  }, []);

  const scheduleReconnect = useCallback(() => {
    const attempt = reconnectAttemptRef.current;
    const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
    reconnectAttemptRef.current = attempt + 1;

    reconnectTimerRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  const subscribe = useCallback((callback) => {
    listenersRef.current.add(callback);
    return () => listenersRef.current.delete(callback);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, subscribe };
}
