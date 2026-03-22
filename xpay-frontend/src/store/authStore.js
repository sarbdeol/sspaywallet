import { create } from 'zustand'

const stored = () => {
  try {
    return JSON.parse(localStorage.getItem('user'))
  } catch { return null }
}

export const useAuthStore = create((set) => ({
  user:  stored(),
  token: localStorage.getItem('token') || null,

  setAuth: (user, token) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, token })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ user: null, token: null })
  },
}))
