import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SitesPage from './pages/SitesPage'
import CabinetsPage from './pages/CabinetsPage'
import RackDetailPage from './pages/RackDetailPage'
import DevicesPage from './pages/DevicesPage'
import DeviceDetailPage from './pages/DeviceDetailPage'
import TopologyPage from './pages/TopologyPage'
import PatchPanelsPage from './pages/PatchPanelsPage'
import PatchPanelDetailPage from './pages/PatchPanelDetailPage'
import VlansPage from './pages/VlansPage'
import PrefixesPage from './pages/PrefixesPage'
import PrefixDetailPage from './pages/PrefixDetailPage'
import ScanPage from './pages/ScanPage'
import ScheduledScansPage from './pages/ScheduledScansPage'
import ConflictsPage from './pages/ConflictsPage'
import AuditLogPage from './pages/AuditLogPage'
import UsersPage from './pages/UsersPage'
import VendorsPage from './pages/VendorsPage'

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="sedi" element={<SitesPage />} />
        <Route path="armadi" element={<CabinetsPage />} />
        <Route path="armadi/:id" element={<RackDetailPage />} />
        <Route path="dispositivi" element={<DevicesPage />} />
        <Route path="dispositivi/:id" element={<DeviceDetailPage />} />
        <Route path="topologia" element={<TopologyPage />} />
        <Route path="patch-panel" element={<PatchPanelsPage />} />
        <Route path="patch-panel/:id" element={<PatchPanelDetailPage />} />
        <Route path="vlan" element={<VlansPage />} />
        <Route path="prefissi" element={<PrefixesPage />} />
        <Route path="prefissi/:id" element={<PrefixDetailPage />} />
        <Route path="scansione" element={<ScanPage />} />
        <Route path="pianificazione" element={<ScheduledScansPage />} />
        <Route path="conflitti" element={<ConflictsPage />} />
        <Route path="storico" element={<AuditLogPage />} />
        <Route path="utenti" element={<UsersPage />} />
        <Route path="vendor" element={<VendorsPage />} />
      </Route>
    </Routes>
  )
}

export default App
