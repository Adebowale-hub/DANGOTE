import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart3,
  AlertTriangle,
  Factory,
  Wifi,
  WifiOff,
  Loader2,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Command Centre', icon: LayoutDashboard },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/alerts', label: 'Alerts', icon: AlertTriangle },
];

const PLANTS = [
  { id: 'IBESE-01', name: 'Ibese', state: 'Ogun' },
  { id: 'OBAJANA-01', name: 'Obajana', state: 'Kogi' },
  { id: 'GBOKO-01', name: 'Gboko', state: 'Benue' },
];

export default function Sidebar({
  wsStatus,
  criticalCount,
  selectedPlant,
  onPlantChange,
}) {
  const WsIcon =
    wsStatus === 'CONNECTED' ? Wifi : wsStatus === 'CONNECTING' ? Loader2 : WifiOff;
  const wsColor =
    wsStatus === 'CONNECTED'
      ? 'text-emerald-400'
      : wsStatus === 'CONNECTING'
      ? 'text-amber-400 animate-spin'
      : 'text-crimson-400';

  return (
    <aside className="w-64 flex-shrink-0 bg-obsidian border-r border-white/5 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gold-gradient flex items-center justify-center">
            <Factory className="w-5 h-5 text-void" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-display font-bold text-sm text-white tracking-tight">
              DCP KPI Centre
            </div>
            <div className="text-xs text-muted font-mono">Dangote Cement Plc</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <div className="text-xs font-mono uppercase tracking-widest text-muted/60 px-3 mb-3">
          Navigation
        </div>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              isActive ? 'nav-item-active' : 'nav-item-inactive'
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span>{label}</span>
            {label === 'Alerts' && criticalCount > 0 && (
              <span className="ml-auto bg-crimson-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-mono font-bold animate-pulse">
                {criticalCount}
              </span>
            )}
          </NavLink>
        ))}

        {/* Plant Selector */}
        <div className="pt-6">
          <div className="text-xs font-mono uppercase tracking-widest text-muted/60 px-3 mb-3">
            Plant Location
          </div>
          <div className="space-y-1">
            {PLANTS.map((plant) => (
              <button
                key={plant.id}
                onClick={() => onPlantChange(plant.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                  selectedPlant === plant.id
                    ? 'bg-gold/10 text-gold-300 border border-gold/20'
                    : 'text-muted hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{plant.name} Plant</div>
                    <div className="text-xs opacity-60 font-mono">{plant.id}</div>
                  </div>
                  {selectedPlant === plant.id && (
                    <div className="live-dot" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Connection Status */}
      <div className="p-4 border-t border-white/5">
        <div className="glass-card p-3 flex items-center gap-3">
          <WsIcon className={`w-4 h-4 flex-shrink-0 ${wsColor}`} />
          <div className="min-w-0">
            <div
              className={`text-xs font-mono font-medium ${
                wsStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-muted'
              }`}
            >
              {wsStatus === 'CONNECTED'
                ? 'Live Stream Active'
                : wsStatus === 'CONNECTING'
                ? 'Connecting...'
                : 'Stream Offline'}
            </div>
            <div className="text-xs text-muted/60 truncate">ws://localhost:4000</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
