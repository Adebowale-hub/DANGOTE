import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import AlertBanner from './components/AlertBanner';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import Alerts from './pages/Alerts';
import { useWebSocket } from './hooks/useWebSocket';
import { useTelemetry } from './hooks/useTelemetry';

export default function App() {
  const [selectedPlant, setSelectedPlant] = useState('IBESE-01');
  const { status: wsStatus, subscribe } = useWebSocket();
  const {
    telemetry,
    alerts,
    activeAlerts,
    criticalCount,
    acknowledgeAlert,
  } = useTelemetry(subscribe, selectedPlant);

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-void overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          wsStatus={wsStatus}
          criticalCount={criticalCount}
          selectedPlant={selectedPlant}
          onPlantChange={setSelectedPlant}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Critical alert banner */}
          <AlertBanner alerts={activeAlerts} onDismiss={acknowledgeAlert} />

          {/* Page routes */}
          <Routes>
            <Route
              path="/"
              element={
                <Dashboard
                  telemetry={telemetry}
                  activeAlerts={activeAlerts}
                  selectedPlant={selectedPlant}
                />
              }
            />
            <Route
              path="/analytics"
              element={
                <Analytics
                  telemetry={telemetry}
                  selectedPlant={selectedPlant}
                />
              }
            />
            <Route
              path="/alerts"
              element={
                <Alerts alerts={alerts} acknowledgeAlert={acknowledgeAlert} />
              }
            />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
