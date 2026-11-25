import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { StatusPage } from './pages/StatusPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { ChannelsView } from './pages/admin/ChannelsView';
import { IncidentsView } from './pages/admin/IncidentsView';
import { MaintenancesView } from './pages/admin/MaintenancesView';
import { MonitorsView } from './pages/admin/MonitorsView';
import { SettingsView } from './pages/admin/SettingsView';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StatusPage />} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<MonitorsView />} />
          <Route path="incidents" element={<IncidentsView />} />
          <Route path="maintenances" element={<MaintenancesView />} />
          <Route path="channels" element={<ChannelsView />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
