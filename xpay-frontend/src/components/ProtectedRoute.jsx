import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import AppLayout from './layout/AppLayout'

export function ProtectedRoute({ children, adminOnly = false }) {
  const { user, token } = useAuthStore()

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && !user.is_superadmin) {
    return <Navigate to="/dashboard" replace />
  }

  if (!adminOnly && user.is_superadmin) {
    return <Navigate to="/admin" replace />
  }

  return <AppLayout>{children}</AppLayout>
}

export function AdminRoute({ children }) {
  const { user, token } = useAuthStore()

  if (!token || !user) return <Navigate to="/login" replace />
  if (!user.is_superadmin)  return <Navigate to="/dashboard" replace />

  return <AppLayout>{children}</AppLayout>
}
