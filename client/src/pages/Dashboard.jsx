import { useMemo } from 'react';
import KpiTile from '../components/KpiTile';
import { Activity, Cpu, Flame, Package } from 'lucide-react';

const PLANT_MACHINES = {
  'IBESE-01':   ['KILN-A', 'KILN-B', 'MILL-01', 'COOLER-A'],
  'OBAJANA-01': ['KILN-A', 'KILN-B', 'MILL-02', 'COOLER-B'],
  'GBOKO-01':   ['KILN-A', 'MILL-03', 'COOLER-C'],
};

const MACHINE_METRICS = {
  'KILN':   ['KILN_TEMP', 'FEED_RATE', 'FUEL_INPUT', 'CLINKER_OUTPUT', 'POWER_DRAW'],
  'MILL':   ['MILL_PRESSURE', 'POWER_DRAW', 'FEED_RATE', 'FAN_SPEED'],
  'COOLER': ['COOLER_TEMP', 'FAN_SPEED', 'POWER_DRAW'],
};

function getMachineType(machineId) {
  if (machineId.startsWith('KILN')) return 'KILN';
  if (machineId.startsWith('MILL')) return 'MILL';
  if (machineId.startsWith('COOLER')) return 'COOLER';
  return 'KILN';
}

function SummaryCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="glass-card p-4 flex items-center gap-4">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}20`, border: `1px solid ${color}30` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-mono text-muted uppercase tracking-wider">{label}</div>
        <div className="font-display text-xl font-semibold text-white truncate">{value}</div>
        {sub && <div className="text-xs text-muted truncate">{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard({ telemetry, activeAlerts, selectedPlant }) {
  const machines = PLANT_MACHINES[selectedPlant] || [];

  const stats = useMemo(() => {
    let total = 0, stale = 0, oob = 0, ok = 0;
    telemetry.forEach((v) => {
      if (v.plantId !== selectedPlant) return;
      total++;
      if (v.qualityFlag === 'STALE') stale++;
      else if (v.qualityFlag === 'OUT_OF_BOUNDS') oob++;
      else if (v.qualityFlag === 'OK') ok++;
    });
    const quality = total > 0 ? Math.round((ok / total) * 100) : 100;
    return { total, stale, oob, ok, quality };
  }, [telemetry, selectedPlant]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">
            Command Centre
          </h1>
          <p className="text-sm text-muted mt-1 font-mono">
            {selectedPlant} · Live telemetry stream
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-900/20 border border-emerald-500/20 px-3 py-1.5 rounded-full">
          <div className="live-dot" />
          Real-time
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={Activity}
          label="Data Quality"
          value={`${stats.quality}%`}
          sub={`${stats.total} active sensors`}
          color="#34D399"
        />
        <SummaryCard
          icon={Flame}
          label="Stale Sensors"
          value={stats.stale}
          sub="Frozen readings"
          color={stats.stale > 0 ? '#FBBF24' : '#34D399'}
        />
        <SummaryCard
          icon={Cpu}
          label="Out of Range"
          value={stats.oob}
          sub="Flagged readings"
          color={stats.oob > 0 ? '#F87171' : '#34D399'}
        />
        <SummaryCard
          icon={Package}
          label="Active Alerts"
          value={activeAlerts.length}
          sub={activeAlerts.length > 0 ? 'Requires attention' : 'All systems nominal'}
          color={activeAlerts.length > 0 ? '#F87171' : '#34D399'}
        />
      </div>

      {/* Machine Panels */}
      {machines.map((machineId) => {
        const machineType = getMachineType(machineId);
        const metrics = MACHINE_METRICS[machineType] || [];

        return (
          <div key={machineId} className="space-y-3">
            {/* Machine Header */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/5" />
              <div className="flex items-center gap-2 px-3 py-1 glass-card-gold rounded-full">
                <div className="live-dot" />
                <span className="text-xs font-mono font-medium text-gold-300 uppercase tracking-widest">
                  {machineId}
                </span>
                <span className="text-xs text-muted/60">·</span>
                <span className="text-xs text-muted font-mono">{machineType}</span>
              </div>
              <div className="h-px flex-1 bg-white/5" />
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {metrics.map((metric) => {
                const key = `${selectedPlant}::${machineId}::${metric}`;
                const data = telemetry.get(key) || null;
                return (
                  <KpiTile
                    key={metric}
                    metric={metric}
                    data={data}
                    loading={!data}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {machines.length === 0 && (
        <div className="glass-card p-12 text-center text-muted">
          <p className="font-mono text-sm">No machines registered for this plant.</p>
        </div>
      )}
    </div>
  );
}
