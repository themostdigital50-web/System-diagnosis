import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { SettingsProvider } from './context/SettingsContext';

const Overview = lazy(() => import('./pages/Overview').then((module) => ({ default: module.Overview })));
const SystemInfo = lazy(() => import('./pages/SystemInfo').then((module) => ({ default: module.SystemInfo })));
const NetworkInfo = lazy(() => import('./pages/NetworkInfo').then((module) => ({ default: module.NetworkInfo })));
const Diagnostics = lazy(() => import('./pages/Diagnostics').then((module) => ({ default: module.Diagnostics })));
const Performance = lazy(() => import('./pages/Performance').then((module) => ({ default: module.Performance })));
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })));

export default function App() {
  return (
    <SettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Overview />} />
            <Route path="system" element={<SystemInfo />} />
            <Route path="network" element={<NetworkInfo />} />
            <Route path="diagnostics" element={<Diagnostics />} />
            <Route path="performance" element={<Performance />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
  );
}
