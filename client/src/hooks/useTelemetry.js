import { useState, useEffect, useCallback, useRef } from 'react';

const MAX_HISTORY = 120; // Keep last 120 readings per sensor for sparklines

export function useTelemetry(wsSubscribe, selectedPlant) {
  // Map<sensorKey, { value, qualityFlag, timestamp, history: [] }>
  const [telemetry, setTelemetry] = useState(new Map());
  const [alerts, setAlerts] = useState([]);
  const alertIdRef = useRef(0);

  const handleMessage = useCallback(
    (data) => {
      if (data.type === 'TELEMETRY_UPDATE') {
        // Filter by selected plant if applicable
        if (selectedPlant && data.metadata?.plantId !== selectedPlant) return;

        setTelemetry((prev) => {
          const next = new Map(prev);
          const { plantId, machineId, metric } = data.metadata;
          const key = `${plantId}::${machineId}::${metric}`;
          const existing = prev.get(key) || { history: [] };

          const newHistory = [
            ...existing.history,
            { ts: data.timestamp, value: data.value },
          ].slice(-MAX_HISTORY);

          next.set(key, {
            plantId,
            machineId,
            metric,
            value: data.value,
            qualityFlag: data.qualityFlag,
            timestamp: data.timestamp,
            history: newHistory,
          });

          return next;
        });
      } else if (data.type === 'ALERT_FIRED') {
        setAlerts((prev) => [
          {
            id: ++alertIdRef.current,
            ...data,
            timestamp: new Date(data.timestamp),
            acknowledged: false,
          },
          ...prev.slice(0, 99), // Keep max 100 alerts
        ]);
      } else if (data.type === 'ALERT_CLEARED') {
        setAlerts((prev) =>
          prev.map((a) =>
            a.alertType === data.alertType &&
            a.plantId === data.plantId &&
            a.machineId === data.machineId
              ? { ...a, cleared: true, clearedAt: new Date(data.timestamp) }
              : a
          )
        );
      }
    },
    [selectedPlant]
  );

  useEffect(() => {
    return wsSubscribe(handleMessage);
  }, [wsSubscribe, handleMessage]);

  const acknowledgeAlert = useCallback((id) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
    );
  }, []);

  const activeAlerts = alerts.filter((a) => !a.cleared && !a.acknowledged);
  const criticalCount = activeAlerts.filter((a) => a.severity === 'CRITICAL').length;

  // Get flat list for a specific plant+machine combination
  const getMetrics = useCallback(
    (plantId, machineId) => {
      const result = {};
      telemetry.forEach((v, k) => {
        if (v.plantId === plantId && v.machineId === machineId) {
          result[v.metric] = v;
        }
      });
      return result;
    },
    [telemetry]
  );

  // Get all data for a given plant
  const getPlantData = useCallback(
    (plantId) => {
      const result = new Map();
      telemetry.forEach((v, k) => {
        if (v.plantId === plantId) result.set(k, v);
      });
      return result;
    },
    [telemetry]
  );

  return {
    telemetry,
    alerts,
    activeAlerts,
    criticalCount,
    acknowledgeAlert,
    getMetrics,
    getPlantData,
  };
}
