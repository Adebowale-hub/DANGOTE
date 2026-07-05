import { useState, useCallback } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Zap,
  ChevronDown,
  FlaskConical,
} from 'lucide-react';

const API = 'http://localhost:4000/api';

const SCENARIOS = [
  {
    label: 'Critical Kiln',
    severity: 'CRITICAL',
    alertType: 'EFFICIENCY_CRITICAL',
    plantId: 'IBESE-01',
    machineId: 'KILN-A',
    message: 'Kiln-A efficiency has dropped below critical threshold — immediate inspection required.',
    efficiency: 58,
    threshold: 65,
    color: 'text-crimson-400',
    bg: 'bg-crimson-900/20 hover:bg-crimson-900/35 border-crimson-500/30',
  },
  {
    label: 'Warning Mill',
    severity: 'WARNING',
    alertType: 'EFFICIENCY_WARNING',
    plantId: 'IBESE-01',
    machineId: 'MILL-01',
    message: 'Mill-01 output trending below acceptable range — schedule maintenance review.',
    efficiency: 72,
    threshold: 78,
    color: 'text-amber-400',
    bg: 'bg-amber-900/20 hover:bg-amber-900/35 border-amber-500/30',
  },
  {
    label: 'Stale Sensor',
    severity: 'WARNING',
    alertType: 'STALE_DATA',
    plantId: 'OBAJANA-01',
    machineId: 'COOLER-B',
    message: 'Cooler-B telemetry stream has stopped. Sensor may be offline.',
    color: 'text-amber-400',
    bg: 'bg-amber-900/20 hover:bg-amber-900/35 border-amber-500/30',
  },
  {
    label: 'Out of Bounds',
    severity: 'CRITICAL',
    alertType: 'OUT_OF_BOUNDS',
    plantId: 'GBOKO-01',
    machineId: 'KILN-A',
    message: 'Temperature reading 1,420 °C exceeds safe operating limit of 1,380 °C.',
    color: 'text-crimson-400',
    bg: 'bg-crimson-900/20 hover:bg-crimson-900/35 border-crimson-500/30',
  },
  {
    label: 'Info: Shift Change',
    severity: 'INFO',
    alertType: 'SHIFT_CHANGE',
    plantId: 'OBAJANA-01',
    machineId: 'MILL-02',
    message: 'Scheduled shift handover at 15:00 — daily calibration check initiated.',
    color: 'text-sapphire-400',
    bg: 'bg-sapphire-900/20 hover:bg-sapphire-900/35 border-sapphire-500/30',
  },
];


const SEVERITY_CONFIG = {
  CRITICAL: {
    icon: AlertOctagon,
    cls: 'border-crimson-500/30 bg-crimson-900/15',
    badge: 'bg-crimson-900/60 text-crimson-400 border-crimson-500/30',
    iconCls: 'text-crimson-400',
  },
  WARNING: {
    icon: AlertTriangle,
    cls: 'border-amber-500/30 bg-amber-900/15',
    badge: 'bg-amber-900/60 text-amber-400 border-amber-500/30',
    iconCls: 'text-amber-400',
  },
  INFO: {
    icon: AlertTriangle,
    cls: 'border-sapphire-500/30 bg-sapphire-900/15',
    badge: 'bg-sapphire-900/60 text-sapphire-400 border-sapphire-500/30',
    iconCls: 'text-sapphire-400',
  },
};

function formatDuration(from, to) {
  const ms = (to ? new Date(to) : new Date()) - new Date(from);
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export default function Alerts({ alerts, acknowledgeAlert }) {
  const [filter, setFilter] = useState('ALL'); // ALL | ACTIVE | CLEARED | ACKNOWLEDGED
  const [simOpen, setSimOpen] = useState(false);
  const [firing, setFiring] = useState(null); // scenario label currently being fired

  const fireScenario = useCallback(async (scenario) => {
    setFiring(scenario.label);
    try {
      await fetch(`${API}/simulate/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scenario),
      });
    } catch (e) {
      console.error('Simulate alert failed:', e);
    } finally {
      setTimeout(() => setFiring(null), 600);
    }
  }, []);

  const clearAll = useCallback(async () => {
    for (const s of SCENARIOS) {
      try {
        await fetch(`${API}/simulate/clear-alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alertType: s.alertType, plantId: s.plantId, machineId: s.machineId }),
        });
      } catch (_) {}
    }
  }, []);

  const filtered = alerts.filter((a) => {
    if (filter === 'ACTIVE') return !a.cleared && !a.acknowledged;
    if (filter === 'CLEARED') return a.cleared;
    if (filter === 'ACKNOWLEDGED') return a.acknowledged;
    return true;
  });

  const counts = {
    active: alerts.filter((a) => !a.cleared && !a.acknowledged).length,
    cleared: alerts.filter((a) => a.cleared).length,
    acknowledged: alerts.filter((a) => a.acknowledged).length,
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Alerts</h1>
          <p className="text-sm text-muted mt-1 font-mono">
            Exception log · All plants
          </p>
        </div>
        {counts.active > 0 && (
          <div className="flex items-center gap-2 bg-crimson-900/30 border border-crimson-500/30 rounded-full px-4 py-2 animate-pulse">
            <AlertOctagon className="w-4 h-4 text-crimson-400" />
            <span className="text-sm font-mono font-medium text-crimson-400">
              {counts.active} active alert{counts.active !== 1 ? 's' : ''} require attention
            </span>
          </div>
        )}
      </div>

      {/* ── Simulate Alerts Panel ───────────────────────────────── */}
      <div className="glass-card border border-dashed border-white/10 overflow-hidden">
        <button
          onClick={() => setSimOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors"
        >
          <div className="flex items-center gap-3">
            <FlaskConical className="w-4 h-4 text-gold-300" />
            <span className="text-sm font-mono font-medium text-gold-300 uppercase tracking-wider">
              Simulate Alerts
            </span>
            <span className="text-xs font-mono text-muted">
              — fire synthetic events for testing
            </span>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-muted transition-transform duration-200 ${simOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {simOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">
            <p className="text-xs font-mono text-muted">
              Click a scenario to broadcast it via WebSocket — it appears instantly in the feed below.
            </p>
            <div className="flex flex-wrap gap-3">
              {SCENARIOS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => fireScenario(s)}
                  disabled={firing === s.label}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-mono font-medium transition-all duration-200 ${s.bg} ${s.color} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Zap className={`w-3.5 h-3.5 ${firing === s.label ? 'animate-pulse' : ''}`} />
                  {firing === s.label ? 'Firing…' : s.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 pt-1 border-t border-white/5">
              <button
                onClick={clearAll}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-xs font-mono text-muted hover:text-white hover:border-white/20 transition-all duration-200"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Clear All Simulated
              </button>
              <span className="text-xs font-mono text-muted">
                Sends ALERT_CLEARED for each scenario
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active', value: counts.active, color: '#F87171', icon: AlertOctagon },
          { label: 'Cleared', value: counts.cleared, color: '#34D399', icon: CheckCircle2 },
          { label: 'Acknowledged', value: counts.acknowledged, color: '#60A5FA', icon: XCircle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="glass-card p-4 flex items-center gap-3">
            <Icon className="w-5 h-5 flex-shrink-0" style={{ color }} />
            <div>
              <div className="font-display text-2xl font-bold text-white">{value}</div>
              <div className="text-xs font-mono text-muted">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 glass-card p-1 w-fit">
        {['ALL', 'ACTIVE', 'CLEARED', 'ACKNOWLEDGED'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-wider transition-all duration-200 ${
              filter === f
                ? 'bg-gold/15 text-gold-300 border border-gold/20'
                : 'text-muted hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Alert List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <p className="text-muted font-mono text-sm">
              {filter === 'ALL' ? 'No alerts recorded yet.' : `No ${filter.toLowerCase()} alerts.`}
            </p>
          </div>
        ) : (
          filtered.map((alert) => {
            const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.WARNING;
            const Icon = cfg.icon;
            return (
              <div
                key={alert.id}
                className={`glass-card border p-5 flex items-start gap-4 transition-all duration-300 animate-slide-in ${cfg.cls}`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${cfg.iconCls}`} />

                <div className="flex-1 min-w-0 space-y-2">
                  {/* Title row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`status-badge border ${cfg.badge}`}>
                      {alert.severity}
                    </span>
                    <span className="text-sm font-medium text-white">
                      {alert.alertType?.replace('_', ' ')}
                    </span>
                    {alert.cleared && (
                      <span className="status-ok">Cleared</span>
                    )}
                    {alert.acknowledged && !alert.cleared && (
                      <span className="status-interpolated">ACK'd</span>
                    )}
                  </div>

                  {/* Message */}
                  <p className="text-sm text-white/80">{alert.message}</p>

                  {/* Meta */}
                  <div className="flex items-center gap-4 flex-wrap text-xs font-mono text-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {alert.timestamp?.toLocaleTimeString()}
                    </span>
                    <span>{alert.plantId}</span>
                    <span>{alert.machineId}</span>
                    {alert.efficiency && (
                      <span className="text-crimson-400">
                        Efficiency: {alert.efficiency}% (threshold: {alert.threshold}%)
                      </span>
                    )}
                    {!alert.cleared && (
                      <span>
                        Duration: {formatDuration(alert.timestamp, alert.clearedAt)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {!alert.acknowledged && !alert.cleared && (
                  <button
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="flex-shrink-0 text-xs font-mono px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-muted hover:text-white border border-white/10 transition-all duration-200"
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
