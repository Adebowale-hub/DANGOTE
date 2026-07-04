import { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const METRIC_COLORS = {
  KILN_TEMP:      '#E8C84A',
  FEED_RATE:      '#60A5FA',
  CLINKER_OUTPUT: '#34D399',
  FUEL_INPUT:     '#F97316',
  POWER_DRAW:     '#A78BFA',
  MILL_PRESSURE:  '#38BDF8',
  COOLER_TEMP:    '#FB7185',
  FAN_SPEED:      '#4ADE80',
};

const QUALITY_COLORS = {
  OK:            '#34D399',
  STALE:         '#FBBF24',
  OUT_OF_BOUNDS: '#F87171',
  INTERPOLATED:  '#60A5FA',
  NOISE:         '#A78BFA',
};

const METRICS_LIST = [
  'KILN_TEMP', 'FEED_RATE', 'CLINKER_OUTPUT',
  'FUEL_INPUT', 'POWER_DRAW', 'MILL_PRESSURE',
  'COOLER_TEMP', 'FAN_SPEED',
];

const MACHINES = {
  'IBESE-01':   ['KILN-A', 'KILN-B', 'MILL-01', 'COOLER-A'],
  'OBAJANA-01': ['KILN-A', 'KILN-B', 'MILL-02', 'COOLER-B'],
  'GBOKO-01':   ['KILN-A', 'MILL-03', 'COOLER-C'],
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-onyx border border-white/10 rounded-lg p-3 shadow-xl min-w-[120px]">
      <div className="text-xs font-mono text-muted mb-2">
        {label && new Date(label).toLocaleTimeString()}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs font-mono">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-white font-medium">{p.value?.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
};

export default function Analytics({ telemetry, selectedPlant }) {
  const [selectedMetric, setSelectedMetric] = useState('KILN_TEMP');
  const [selectedMachine, setSelectedMachine] = useState('');
  const [qualityData, setQualityData] = useState([]);

  const machines = MACHINES[selectedPlant] || [];

  // Default machine selection
  useEffect(() => {
    if (machines.length > 0 && !machines.includes(selectedMachine)) {
      setSelectedMachine(machines[0]);
    }
  }, [selectedPlant, machines]);

  // Build time-series chart data from live telemetry history
  const chartData = useMemo(() => {
    if (!selectedMachine || !selectedMetric) return [];
    const key = `${selectedPlant}::${selectedMachine}::${selectedMetric}`;
    const sensor = telemetry.get(key);
    if (!sensor?.history) return [];
    return sensor.history.map((h) => ({
      ts: h.ts,
      value: h.value,
    }));
  }, [telemetry, selectedPlant, selectedMachine, selectedMetric]);

  // Build quality breakdown pie data
  const qualityBreakdown = useMemo(() => {
    const counts = {};
    telemetry.forEach((v) => {
      if (v.plantId !== selectedPlant) return;
      counts[v.qualityFlag] = (counts[v.qualityFlag] || 0) + 1;
    });
    return Object.entries(counts).map(([flag, count]) => ({ flag, count }));
  }, [telemetry, selectedPlant]);

  // OEE data per machine
  const oeeData = useMemo(() => {
    return machines.map((machineId) => {
      let total = 0, ok = 0;
      telemetry.forEach((v) => {
        if (v.plantId !== selectedPlant || v.machineId !== machineId) return;
        total++;
        if (v.qualityFlag === 'OK') ok++;
      });
      const availability = total > 0 ? Math.round((ok / total) * 100) : 0;
      return { machineId, availability, total };
    });
  }, [telemetry, selectedPlant, machines]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-muted mt-1 font-mono">
          {selectedPlant} · Sensor time-series & quality analysis
        </p>
      </div>

      {/* Time-Series Chart */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h2 className="font-display text-base font-semibold text-white">
            Sensor Time-Series
          </h2>
          <div className="flex gap-2 flex-wrap">
            <select
              value={selectedMachine}
              onChange={(e) => setSelectedMachine(e.target.value)}
              className="bg-graphite border border-white/10 text-sm text-white font-mono rounded-lg px-3 py-2 focus:outline-none focus:border-gold/40"
            >
              {machines.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="bg-graphite border border-white/10 text-sm text-white font-mono rounded-lg px-3 py-2 focus:outline-none focus:border-gold/40"
            >
              {METRICS_LIST.map((m) => (
                <option key={m} value={m}>{m.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>

        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={METRIC_COLORS[selectedMetric] || '#C9A030'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={METRIC_COLORS[selectedMetric] || '#C9A030'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="ts"
                tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                tick={{ fill: '#3A3A5C', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#3A3A5C', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={METRIC_COLORS[selectedMetric] || '#C9A030'}
                strokeWidth={2}
                fill="url(#tsGrad)"
                dot={false}
                activeDot={{ r: 4, fill: METRIC_COLORS[selectedMetric], strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-muted font-mono text-sm">
            Waiting for live data stream...
          </div>
        )}
      </div>

      {/* Quality + OEE row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Quality Breakdown */}
        <div className="glass-card p-6">
          <h2 className="font-display text-base font-semibold text-white mb-6">
            Data Quality Breakdown
          </h2>
          {qualityBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={qualityBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="count"
                >
                  {qualityBreakdown.map((entry) => (
                    <Cell
                      key={entry.flag}
                      fill={QUALITY_COLORS[entry.flag] || '#888'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-onyx border border-white/10 rounded px-3 py-2 text-xs font-mono text-white">
                        <div>{d.flag}</div>
                        <div className="text-gold-300 font-bold">{d.count} readings</div>
                      </div>
                    );
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs font-mono text-muted">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-56 flex items-center justify-center text-muted font-mono text-sm">
              Waiting for data...
            </div>
          )}
        </div>

        {/* OEE per Machine */}
        <div className="glass-card p-6">
          <h2 className="font-display text-base font-semibold text-white mb-6">
            Availability by Machine
          </h2>
          <div className="space-y-4">
            {oeeData.map((item) => (
              <div key={item.machineId}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-mono text-muted">{item.machineId}</span>
                  <span
                    className={`text-sm font-mono font-semibold ${
                      item.availability >= 90
                        ? 'text-emerald-400'
                        : item.availability >= 70
                        ? 'text-amber-400'
                        : 'text-crimson-400'
                    }`}
                  >
                    {item.availability}%
                  </span>
                </div>
                <div className="h-2 bg-slate/50 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${item.availability}%`,
                      background:
                        item.availability >= 90
                          ? '#34D399'
                          : item.availability >= 70
                          ? '#FBBF24'
                          : '#F87171',
                    }}
                  />
                </div>
                <div className="text-xs font-mono text-muted/50 mt-1">
                  {item.total} readings
                </div>
              </div>
            ))}
            {oeeData.length === 0 && (
              <div className="text-center text-muted font-mono text-sm py-8">
                Waiting for live data...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
