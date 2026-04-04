import React, { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Wallet, Users, ArrowUpRight, TrendingUp } from 'lucide-react'
import { adminApi } from '../../services/api'
import { StatCard, Card, Spinner, PageHeader, Badge } from '../../components/ui'
import { fmt, extractError } from '../../utils/helpers'
import toast from 'react-hot-toast'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [wallet, setWallet] = useState(null)
  const [topupModal, setTopupModal] = useState(false)
  const [topupAmt, setTopupAmt] = useState('')
  const [topupNote, setTopupNote] = useState('')
  const [topupLoading, setTopupLoading] = useState(false)

  useEffect(() => {
    Promise.all([adminApi.dashboard(), adminApi.getWallet()])
      .then(([d, w]) => { setStats(d.data); setWallet(w.data) })
      .catch(e => toast.error(extractError(e)))
      .finally(() => setLoading(false))
  }, [])

  async function handleTopup(e) {
    e.preventDefault()
    setTopupLoading(true)
    try {
      const { data } = await adminApi.topupWallet({ amount: parseFloat(topupAmt), note: topupNote, currency: 'INR' })
      setWallet(data)
      setTopupModal(false)
      setTopupAmt(''); setTopupNote('')
      toast.success(`₹${fmt.number(topupAmt)} added to master wallet`)
      const d = await adminApi.dashboard()
      setStats(d.data)
    } catch (e) { toast.error(extractError(e)) }
    finally { setTopupLoading(false) }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your wallet system"
        action={
          <button onClick={() => setTopupModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
              background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}>
            <TrendingUp size={15} /> Top Up Wallet
          </button>
        }
      />

      {/* Master wallet highlight */}
      <Card style={{ padding: '24px 28px', marginBottom: 24, background: '#1a1a2e', border: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 6 }}>Master Wallet Balance</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#fff', letterSpacing: '-1px' }}>
              {fmt.currency(wallet?.balance, wallet?.currency || 'INR')}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              {wallet?.currency} · Last updated {fmt.ago(wallet?.updated_at)}
            </div>
          </div>
          <div style={{
            width: 64, height: 64, borderRadius: 18, background: 'rgba(255,255,255,.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Wallet size={28} color="#fff" />
          </div>
        </div>
      </Card>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard label="Total Users"              value={fmt.number(stats?.total_users)}              icon={Users}         color="#0ea5e9" />
        <StatCard label="Sub-wallet Balance"        value={fmt.currency(stats?.total_sub_wallet_balance)}icon={Wallet}       color="#10b981" />
        <StatCard label="Total Transactions"        value={fmt.number(stats?.total_transactions)}       icon={ArrowUpRight}  color="#8b5cf6" />
      </div>

      {/* Placeholder activity chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card style={{ padding: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 20 }}>Wallet Distribution</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={[
              { name: 'Master', value: parseFloat(wallet?.balance || 0) },
              { name: 'Sub-wallets', value: parseFloat(stats?.total_sub_wallet_balance || 0) },
            ]}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [fmt.currency(v), 'Balance']}
                contentStyle={{ borderRadius: 10, border: '1px solid #e4e4e7', fontSize: 13 }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                <Cell fill="#1a1a2e" />
                <Cell fill="#0ea5e9" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card style={{ padding: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Create New User',    href: '/admin/users',   color: '#0ea5e9' },
              { label: 'Fund a Wallet',      href: '/admin/wallets', color: '#10b981' },
              { label: 'View All Wallets',   href: '/admin/wallets', color: '#8b5cf6' },
              { label: 'Funding History',    href: '/admin/funding', color: '#f59e0b' },
              { label: 'User Ledgers', href: '/admin/ledger', color: '#f59e0b' }
            ].map(({ label, href, color }) => (
              <a key={label} href={href}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '11px 16px', borderRadius: 10, background: '#fafafa',
                  border: '1px solid #f0f0f0', textDecoration: 'none',
                  color: '#374151', fontSize: 14, fontWeight: 500, transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = color + '10'; e.currentTarget.style.borderColor = color + '40' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fafafa'; e.currentTarget.style.borderColor = '#f0f0f0' }}
              >
                {label}
                <ArrowUpRight size={15} color={color} />
              </a>
            ))}
          </div>
        </Card>
      </div>

      {/* Top up modal */}
      {topupModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
        }} onClick={e => e.target === e.currentTarget && setTopupModal(false)}>
          <div className="fade-in" style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>Top Up Master Wallet</span>
              <button onClick={() => setTopupModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>✕</button>
            </div>
            <form onSubmit={handleTopup} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Amount (INR)</label>
                <input type="number" step="0.01" min="1" required value={topupAmt}
                  onChange={e => setTopupAmt(e.target.value)} placeholder="e.g. 50000"
                  style={{ width: '100%', padding: '9px 12px', fontSize: 15, border: '1.5px solid #e4e4e7', borderRadius: 10, outline: 'none', fontFamily: 'DM Sans, sans-serif' }}
                  onFocus={e => e.target.style.borderColor = '#0ea5e9'} onBlur={e => e.target.style.borderColor = '#e4e4e7'}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Note (optional)</label>
                <input type="text" value={topupNote} onChange={e => setTopupNote(e.target.value)} placeholder="e.g. Bank transfer ref #123"
                  style={{ width: '100%', padding: '9px 12px', fontSize: 14, border: '1.5px solid #e4e4e7', borderRadius: 10, outline: 'none', fontFamily: 'DM Sans, sans-serif' }}
                  onFocus={e => e.target.style.borderColor = '#0ea5e9'} onBlur={e => e.target.style.borderColor = '#e4e4e7'}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setTopupModal(false)}
                  style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'DM Sans, sans-serif' }}>
                  Cancel
                </button>
                <button type="submit" disabled={topupLoading}
                  style={{ padding: '9px 20px', borderRadius: 10, background: '#1a1a2e', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 7 }}>
                  {topupLoading && <Spinner size={14} color="#fff" />} Confirm Top Up
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
