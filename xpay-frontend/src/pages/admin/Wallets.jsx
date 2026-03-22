import React, { useEffect, useState } from 'react'
import { PlusCircle, Wallet, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '../../services/api'
import { Table, PageHeader, Badge, Button, Modal, Input, Spinner } from '../../components/ui'
import { fmt, extractError } from '../../utils/helpers'

export default function AdminWallets() {
  const [wallets, setWallets] = useState([])
  const [users, setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [fundModal, setFundModal] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote]     = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([adminApi.listWallets({ limit: 100 }), adminApi.listUsers({ limit: 200 })])
      .then(([w, u]) => { setWallets(w.data); setUsers(u.data) })
      .catch(e => toast.error(extractError(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleFund(e) {
    e.preventDefault()
    if (!selectedUserId || !amount) return toast.error('Select a user and enter amount')
    setSaving(true)
    try {
      const { data } = await adminApi.fundWallet({ user_id: selectedUserId, amount: parseFloat(amount), note, currency: 'INR' })
      toast.success(`₹${fmt.number(amount)} funded successfully`)
      setFundModal(false); setAmount(''); setNote(''); setSelectedUserId('')
      load()
    } catch (e) { toast.error(extractError(e)) }
    finally { setSaving(false) }
  }

  async function toggleWallet(userId, current) {
    try {
      await adminApi.toggleWallet(userId)
      toast.success(current ? 'Wallet disabled' : 'Wallet enabled')
      load()
    } catch (e) { toast.error(extractError(e)) }
  }

  const columns = [
    { key: 'user', title: 'User', render: (v, r) => (
      <div>
        <div style={{ fontWeight: 500 }}>{v?.full_name || v?.username || '—'}</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>{v?.email}</div>
      </div>
    )},
    { key: 'balance', title: 'Balance', render: (v, r) => (
      <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 500, fontSize: 14 }}>
        {fmt.currency(v, r.currency)}
      </span>
    )},
    { key: 'currency',   title: 'Currency', render: v => <span style={{ fontSize: 13, color: '#6b7280' }}>{v}</span> },
    { key: 'is_active',  title: 'Status',   render: v => <Badge status={v ? 'SUCCESS' : 'FAILED'} label={v ? 'Active' : 'Disabled'} /> },
    { key: 'updated_at', title: 'Updated',  render: v => <span style={{ fontSize: 13, color: '#9ca3af' }}>{fmt.ago(v)}</span> },
    { key: 'user_id', title: 'Actions', align: 'right', render: (uid, row) => (
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={() => { setSelectedUserId(uid); setFundModal(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1px solid #e4e4e7', background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: '#374151' }}>
          <PlusCircle size={13} /> Fund
        </button>
        <button onClick={() => toggleWallet(uid, row.is_active)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: row.is_active ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
          {row.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
        </button>
      </div>
    )},
  ]

  return (
    <div>
      <PageHeader title="Sub-Wallets" subtitle={`${wallets.length} user wallets`}
        action={
          <Button onClick={() => setFundModal(true)}>
            <PlusCircle size={15} /> Fund Wallet
          </Button>
        }
      />

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
        <Table columns={columns} data={wallets} loading={loading} emptyText="No wallets found" />
      </div>

      <Modal open={fundModal} onClose={() => { setFundModal(false); setAmount(''); setNote(''); setSelectedUserId('') }} title="Fund User Wallet">
        <form onSubmit={handleFund} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Select User *</label>
            <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} required
              style={{ padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e4e4e7', fontSize: 14, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: '#fff' }}>
              <option value="">— Choose a user —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username} ({u.email})</option>)}
            </select>
          </div>
          <Input label="Amount (INR) *" type="number" step="0.01" min="1" required
            value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 10000" />
          <Input label="Note (optional)" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Monthly allocation" />

          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#0c4a6e' }}>
            Amount will be deducted from the master wallet and credited to the selected user's wallet.
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="secondary" type="button" onClick={() => setFundModal(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Confirm Funding</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
