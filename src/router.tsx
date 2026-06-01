import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AdminGate from './components/AdminGate';
import { AppModeProvider } from './context/AppModeContext';
import { DataProvider } from './context/DataContext';
import AdminLayout from './layouts/AdminLayout';
import PublicLayout from './layouts/PublicLayout';
import AdminContractsPage from './pages/admin/AdminContractsPage';
import AdminEquipmentsPage from './pages/admin/AdminEquipmentsPage';
import AdminImportPage from './pages/admin/AdminImportPage';
import AdminMethodologyPage from './pages/admin/AdminMethodologyPage';
import AdminSyncPage from './pages/admin/AdminSyncPage';
import AdminAssistancePage from './pages/admin/AdminAssistancePage';
import AdminMonitorEmergencialPage from './pages/admin/AdminMonitorEmergencialPage';
import DecisionHomePage from './pages/public/DecisionHomePage';
import EmergencyContractPage from './pages/public/EmergencyContractPage';
import HistoryPage from './pages/public/HistoryPage';
import MethodologyPage from './pages/public/MethodologyPage';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AppModeProvider>
      <DataProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<DecisionHomePage />} />
            <Route path="historico" element={<HistoryPage />} />
            <Route path="contrato-emergencial" element={<EmergencyContractPage />} />
            <Route path="metodologia" element={<MethodologyPage />} />
          </Route>

          <Route
            path="/admin"
            element={
              <AdminGate>
                <AdminLayout />
              </AdminGate>
            }
          >
            <Route index element={<Navigate to="monitoramento" replace />} />
            <Route path="importar" element={<AdminImportPage />} />
            <Route path="equipamentos" element={<AdminEquipmentsPage />} />
            <Route path="metodologia" element={<AdminMethodologyPage />} />
            <Route path="contratos" element={<AdminContractsPage />} />
            <Route
              path="monitoramento"
              element={<AdminMonitorEmergencialPage />}
            />
            <Route path="sincronizar" element={<AdminSyncPage />} />
            <Route path="atendimentos" element={<AdminAssistancePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </DataProvider>
      </AppModeProvider>
    </BrowserRouter>
  );
}
