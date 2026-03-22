import React, { useEffect, useState } from 'react'
import { ArrowUpRight, History, Upload, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { payoutApi } from '../../services/api'
import { Card, Spinner, Badge } from '../../components/ui'
import { fmt, extractError } from '../../utils/helpers'

export default function UserDashboard() {
  const [balance, setBalance] = useState(null)
  const [txns, setTxns]       = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([payoutApi.balance(), payoutApi.transactions({ page: 1, page_size: 5 })])
      .then(([b, t]) => { setBalance(b.data); setTxns(t.data.items) })
      .catch(e => toast.error(extractError(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>My Wallet</h1>

      {/* Balance hero */}
      <Card style={{ padding: '28px 32px', marginBottom: 24, background: '#1a1a2e', border: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>Available Balance</div>
            <div style={{ fontSize: 40, fontWeight: 700, color: '#fff', letterSpacing: '-1.5px' }}>
              {fmt.currency(balance?.balance, balance?.currency)}
            </div>
            <div style={{ marginTop: 8 }}>
              <Badge status={balance?.is_active ? 'SUCCESS' : 'FAILED'} label={balance?.is_active ? 'Active' : 'Disabled'} />
            </div>
          </div>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wallet size={28} color="#fff" />
          </div>
        </div>
      </Card>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 32 }}>
        {[
          { icon: ArrowUpRight, label: 'Single Payout', sub: 'Send to one account',  href: '/payout/single', color: '#0ea5e9' },
          { icon: Upload,       label: 'Bulk Payout',   sub: 'Upload Excel file',     href: '/payout/bulk',   color: '#8b5cf6' },
        ].map(({ icon: Icon, label, sub, href, color }) => (
          <Link key={href} to={href} style={{ textDecoration: 'none' }}>
            <Card style={{ padding: '20px 22px', cursor: 'pointer', transition: 'all .15s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 20px ${color}20`; e.currentTarget.style.borderColor = color + '40' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.05)'; e.currentTarget.style.borderColor = '#e4e4e7' }}
            >
              <div style={{ width: 42, height: 42, borderRadius: 12, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Icon size={20} color={color} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>{label}</div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 3 }}>{sub}</div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent transactions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Recent Transactions</div>
        <Link to="/transactions" style={{ fontSize: 13, color: '#0ea5e9', textDecoration: 'none' }}>View all →</Link>
      </div>

      <Card style={{ overflow: 'hidden' }}>
        {txns.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af' }}>
            <History size={36} style={{ marginBottom: 12, opacity: .4 }} />
            <div>No transactions yet</div>
          </div>
        ) : (
          txns.map((t, i) => (
            <div key={t.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', borderBottom: i < txns.length - 1 ? '1px solid #f9f9f9' : 'none',
              }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{t.beneficiary_name}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, fontFamily: 'DM Mono, monospace' }}>{t.order_id}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, fontSize: 15 }}>
                  −{fmt.currency(t.amount, t.currency)}
                </div>
                <div style={{ marginTop: 4 }}>
                  <Badge status={t.status} />
                </div>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
