import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Global 401 → redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  me:    ()     => api.get('/auth/me'),
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  dashboard:         ()          => api.get('/admin/dashboard'),
  getWallet:         ()          => api.get('/admin/wallet'),
  topupWallet:       (data)      => api.post('/admin/wallet/topup', data),

  listUsers:         (p)         => api.get('/admin/users', { params: p }),
  createUser:        (data)      => api.post('/admin/users', data),
  getUser:           (id)        => api.get(`/admin/users/${id}`),
  toggleUser:        (id)        => api.patch(`/admin/users/${id}/toggle-status`),
  getCredentials:    (id)        => api.get(`/admin/users/${id}/credentials`),
  resetPassword:     (id, pw)    => api.patch(`/admin/users/${id}/reset-password`, { password: pw }),
  generateLoginToken:(id)        => api.post(`/admin/users/${id}/login-token`),

  listWallets:       (p)         => api.get('/admin/wallets', { params: p }),
  getUserWallet:     (uid)       => api.get(`/admin/wallets/${uid}`),
  fundWallet:        (data)      => api.post('/admin/wallets/fund', data),
  toggleWallet:      (uid)       => api.patch(`/admin/wallets/${uid}/toggle-status`),

  fundingHistory:    (p)         => api.get('/admin/funding-history', { params: p }),
}

// ── Payout ────────────────────────────────────────────────────────────────────
export const payoutApi = {
  balance:       ()         => api.get('/payout/wallet/balance'),
  singlePayout:  (data)     => api.post('/payout/single', data),

  bulkHeaders:   (fd)       => api.post('/payout/bulk/headers', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  bulkUpload:    (fd)       => api.post('/payout/bulk', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  bulkJobs:      (p)        => api.get('/payout/bulk', { params: p }),
  bulkJobStatus: (id)       => api.get(`/payout/bulk/${id}`),

  transactions:  (p)        => api.get('/payout/transactions', { params: p }),
  transaction:   (orderId)  => api.get(`/payout/transactions/${orderId}`),
  checkStatus:   (orderId)  => api.post(`/payout/transactions/${orderId}/check-status`),
}