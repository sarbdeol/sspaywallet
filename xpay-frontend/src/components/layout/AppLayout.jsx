import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Wallet, ArrowUpRight, Upload,
  History, LogOut, Menu, KeyRound, BookOpen,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

const ADMIN_NAV = [
  { to: '/admin',          icon: LayoutDashboard, label: 'Dashboard',       end: true },
  { to: '/admin/users',    icon: Users,           label: 'Users' },
  { to: '/admin/wallets',  icon: Wallet,          label: 'Wallets' },
  { to: '/admin/funding',  icon: History,         label: 'Funding History' },
  { to: '/admin/ledger',   icon: BookOpen,        label: 'Ledger' },
]

const USER_NAV = [
  { to: '/dashboard',      icon: Wallet,          label: 'My Wallet',    end: true },
  { to: '/payout/single',  icon: ArrowUpRight,    label: 'Single Payout' },
  { to: '/payout/bulk',    icon: Upload,          label: 'Bulk Payout' },
  { to: '/transactions',   icon: History,         label: 'Transactions' },
  { to: '/api-keys',       icon: KeyRound,        label: 'API Keys' },  // NEW
]

function NavItem({ to, icon: Icon, label, end }) {
  return (
    <NavLink to={to} end={end}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
        borderRadius: 9, textDecoration: 'none', fontSize: 14, fontWeight: 500,
        color: isActive ? '#111827' : '#6b7280',
        background: isActive ? '#f4f4f5' : 'transparent',
        transition: 'all .15s',
      })}
      onMouseEnter={e => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = '#f9f9f9' }}
      onMouseLeave={e => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = 'transparent' }}
    >
      <Icon size={16} />
      {label}
    </NavLink>
  )
}

export default function AppLayout({ children }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isAdmin = user?.is_superadmin
  const nav = isAdmin ? ADMIN_NAV : USER_NAV

  function handleLogout() { logout(); navigate('/login') }

  const sidebar = (
    <div style={{
      width: 240, height: '100vh', position: 'fixed', top: 0, left: 0,
      background: '#fff', borderRight: '1px solid #e4e4e7',
      display: 'flex', flexDirection: 'column', zIndex: 100,
      transition: 'transform .25s',
    }}>
      <div style={{ padding: '22px 20px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/sspayicon.png" alt="SSPay" style={{ height: 34, objectFit: 'contain' }} />
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{isAdmin ? 'Super Admin' : 'Pay Wallet'}</div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {nav.map((item) => <NavItem key={item.to} {...item} />)}
      </nav>

      <div style={{ padding: '12px 10px', borderTop: '1px solid #f0f0f0' }}>
        <div style={{ padding: '10px 14px', borderRadius: 9, background: '#fafafa', marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.full_name || user?.username}
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </div>
        </div>
        <button onClick={handleLogout}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'none', fontSize: 14, color: '#6b7280', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
          onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ width: 240, flexShrink: 0 }} className="hidden-mobile">{sidebar}</div>

      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,.3)' }}
          onClick={() => setMobileOpen(false)}>
          <div onClick={e => e.stopPropagation()}>{sidebar}</div>
        </div>
      )}

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'none', padding: '14px 20px', borderBottom: '1px solid #e4e4e7', background: '#fff', alignItems: 'center', gap: 12 }} className="show-mobile-flex">
          <button onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151' }}>
            <Menu size={20} />
          </button>
          <span style={{ fontWeight: 600, fontSize: 15 }}>SSPay</span>
        </div>

        <div style={{ flex: 1, padding: '32px 36px', maxWidth: 1200, width: '100%', margin: '0 auto' }} className="page-content fade-in">
          {children}
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .show-mobile-flex { display: flex !important; }
          .page-content { padding: 20px 16px !important; }
        }
      `}</style>
    </div>
  )
}
