import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'

// Auth
import LoginPage from './pages/Login'

// Route guards
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'

// Admin pages
import AdminDashboard  from './pages/admin/Dashboard'
import AdminUsers      from './pages/admin/Users'
import AdminWallets    from './pages/admin/Wallets'
import FundingHistory  from './pages/admin/FundingHistory'

// User pages
import UserDashboard  from './pages/user/Dashboard'
import SinglePayout   from './pages/user/SinglePayout'
import BulkPayout     from './pages/user/BulkPayout'
import Transactions   from './pages/user/Transactions'

function RootRedirect() {
  const { user, token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  return <Navigate to={user?.is_superadmin ? '/admin' : '/dashboard'} replace />
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/"      element={<RootRedirect />} />

      {/* Admin */}
      <Route path="/admin"         element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/admin/users"   element={<AdminRoute><AdminUsers /></AdminRoute>} />
      <Route path="/admin/wallets" element={<AdminRoute><AdminWallets /></AdminRoute>} />
      <Route path="/admin/funding" element={<AdminRoute><FundingHistory /></AdminRoute>} />

      {/* User */}
      <Route path="/dashboard"      element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
      <Route path="/payout/single"  element={<ProtectedRoute><SinglePayout /></ProtectedRoute>} />
      <Route path="/payout/bulk"    element={<ProtectedRoute><BulkPayout /></ProtectedRoute>} />
      <Route path="/transactions"   element={<ProtectedRoute><Transactions /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
