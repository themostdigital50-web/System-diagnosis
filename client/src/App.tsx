import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { FleetGate } from './components/layout/FleetGate';
import { FleetProvider, useFleet } from './context/FleetContext';
import { SettingsProvider } from './context/SettingsContext';

const Overview = lazy(() => import('./pages/Overview').then((module) => ({ default: module.Overview })));
const SystemInfo = lazy(() => import('./pages/SystemInfo').then((module) => ({ default: module.SystemInfo })));
const NetworkInfo = lazy(() => import('./pages/NetworkInfo').then((module) => ({ default: module.NetworkInfo })));
const Diagnostics = lazy(() => import('./pages/Diagnostics').then((module) => ({ default: module.Diagnostics })));
const Performance = lazy(() => import('./pages/Performance').then((module) => ({ default: module.Performance })));
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })));
const Devices = lazy(() => import('./pages/Devices').then((module) => ({ default: module.Devices })));
const DeviceLayout = lazy(() => import('./pages/DeviceLayout').then((module) => ({ default: module.DeviceLayout })));

/** Remount every device view when the selected computer changes so no state
 * or result from one computer leaks into another. */
function DeviceRoute() {
  const { id } = useParams();
  return <DeviceLayout key={id} />;
}

function Home() {
  const { config } = useFleet();
  return config?.fleetEnabled ? <Navigate to="/devices" replace /> : <Overview />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="devices" element={<Devices />} />
        <Route path="device/:id" element={<DeviceRoute />}>
          <Route index element={<Overview />} />
          <Route path="system" element={<SystemInfo />} />
          <Route path="network" element={<NetworkInfo />} />
          <Route path="diagnostics" element={<Diagnostics />} />
          <Route path="performance" element={<Performance />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        {/* Local-agent views stay available without an enrolled device. */}
        <Route path="system" element={<SystemInfo />} />
        <Route path="network" element={<NetworkInfo />} />
        <Route path="diagnostics" element={<Diagnostics />} />
        <Route path="performance" element={<Performance />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <FleetProvider>
        <BrowserRouter>
          <FleetGate>
            <AppRoutes />
          </FleetGate>
        </BrowserRouter>
      </FleetProvider>
    </SettingsProvider>
  );
}
