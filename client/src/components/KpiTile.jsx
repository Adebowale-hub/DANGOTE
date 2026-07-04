import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { SparklineChart } from './SparklineChart';

const METRIC_META = {
  KILN_TEMP:      { label: 'Kiln Temperature', unit: '°C',   color: '#E8C84A', icon: '🔥' },
  FEED_RATE:      { label: 'Feed Rate',         unit: 't/h',  color: '#60A5FA', icon: '⚙️' },
  CLINKER_OUTPUT: { label: 'Clinker Output',    unit: 't/h',  color: '#34D399', icon: '📦' },
  FUEL_INPUT:     { label: 'Fuel Input',        unit: 'GJ/t', color: '#F97316', icon: '⛽' },
  POWER_DRAW:     { label: 'Power Draw',        unit: 'kW',   color: '#A78BFA', icon: '⚡' },
  MILL_PRESSURE:  { label: 'Mill Pressure',     unit: 'mbar', color: '#38BDF8', icon: '🌡️' },
  COOLER_TEMP:    { label: 'Cooler Temperature',unit: '°C',   color: '#FB7185', icon: '❄️' },
  FAN_SPEED:      { label: 'Fan Speed',         unit: 'RPM',  color: '#4ADE80', icon: '💨' },
};

const FLAG_CONFIG = {
  OK:           { label: 'OK',           cls: 'status-ok' },
  STALE:        { label: 'STALE',        cls: 'status-stale' },
  OUT_OF_BOUNDS:{ label: 'OUT OF RANGE', cls: 'status-oob' },
  INTERPOLATED: { label: 'INTERPOLATED', cls: 'status-interpolated' },
  NOISE:        { label: 'NOISE',        cls: 'status-stale' },
};

function formatValue(value, unit) {
  if (value === null || value === undefined) return '—';
  if (unit === '°C' || unit === 'kW' || unit === 'RPM') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function getTrend(history) {
  if (!history || history.length < 4) return 'flat';
  const recent = history.slice(-4).map((h) => h.value);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const delta = ((last - first) / Math.abs(first || 1)) * 100;
  if (delta > 1.5) return 'up';
  if (delta < -1.5) return 'down';
  return 'flat';
}

export default function KpiTile({ metric, data, loading }) {
  const meta = METRIC_META[metric] || { label: metric, unit: '', color: '#C9A030', icon: '📊' };
  const flag = data?.qualityFlag || 'OK';
  const flagCfg = FLAG_CONFIG[flag] || FLAG_CONFIG.OK;
  const trend = data ? getTrend(data.history) : 'flat';
  const isAnomaly = flag === 'OUT_OF_BOUNDS' || flag === 'STALE';

  return (
    <div
      className={`glass-card p-5 relative overflow-hidden transition-all duration-300 hover:border-gold/20 ${
        isAnomaly ? 'border-crimson-500/30 shadow-critical' : ''
      }`}
    >
      {/* Background accent */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at top right, ${meta.color} 0%, transparent 70%)`,
        }}
      />

      {/* Anomaly indicator strip */}
      {isAnomaly && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-crimson-500 animate-pulse" />
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-muted mb-1">
              {meta.label}
            </div>
            <span className={flagCfg.cls}>{flagCfg.label}</span>
          </div>
          <span className="text-lg">{meta.icon}</span>
        </div>

        {/* Value */}
        <div className="flex items-end gap-2 mb-3">
          {loading ? (
            <div className="shimmer h-9 w-24 rounded" />
          ) : (
            <>
              <span
                className="metric-value text-3xl"
                style={{ color: isAnomaly ? '#F87171' : '#FFFFFF' }}
              >
                {formatValue(data?.value, meta.unit)}
              </span>
              <span className="text-sm text-muted pb-1 font-mono">{meta.unit}</span>
              <span className="pb-1 ml-1">
                {trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-400" />}
                {trend === 'down' && <TrendingDown className="w-4 h-4 text-crimson-400" />}
                {trend === 'flat' && <Minus className="w-4 h-4 text-muted" />}
              </span>
            </>
          )}
        </div>

        {/* Sparkline */}
        <div className="h-14">
          {data?.history?.length > 1 ? (
            <SparklineChart data={data.history} color={isAnomaly ? '#F87171' : meta.color} />
          ) : (
            <div className="shimmer h-full rounded" />
          )}
        </div>

        {/* Timestamp */}
        {data?.timestamp && (
          <div className="mt-2 text-xs font-mono text-muted/50 text-right">
            {new Date(data.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
