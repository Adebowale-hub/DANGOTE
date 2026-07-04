import { X, AlertOctagon, Clock } from 'lucide-react';

export default function AlertBanner({ alerts, onDismiss }) {
  const critical = alerts.filter((a) => a.severity === 'CRITICAL' && !a.cleared);

  if (critical.length === 0) return null;

  return (
    <div className="alert-critical border-b border-crimson-500/40 bg-crimson-900/30 backdrop-blur-sm">
      {critical.map((alert) => (
        <div
          key={alert.id}
          className="flex items-center gap-4 px-6 py-3 animate-slide-in"
        >
          <AlertOctagon className="w-5 h-5 text-crimson-400 flex-shrink-0 animate-pulse" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-crimson-400 font-mono text-xs font-bold uppercase tracking-widest">
                ⚠ Critical Alert
              </span>
              <span className="text-white/90 text-sm font-medium truncate">
                {alert.message}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs font-mono text-crimson-400/70">
                {alert.plantId} · {alert.machineId}
              </span>
              <span className="flex items-center gap-1 text-xs text-crimson-400/50 font-mono">
                <Clock className="w-3 h-3" />
                {new Date(alert.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-mono text-crimson-400 bg-crimson-900/60 border border-crimson-500/30 px-2 py-1 rounded">
              {alert.efficiency}% efficiency
            </span>
            <button
              onClick={() => onDismiss(alert.id)}
              className="text-crimson-400/60 hover:text-crimson-300 transition-colors p-1 rounded hover:bg-crimson-500/10"
              title="Acknowledge"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
