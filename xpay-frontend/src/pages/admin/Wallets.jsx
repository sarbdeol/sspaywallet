import React, { useEffect, useState } from 'react'
import { PlusCircle, ToggleLeft, ToggleRight, KeyRound, RefreshCw, Copy, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '../../services/api'
import { Table, PageHeader, Badge, Button, Modal, Input, Spinner } from '../../components/ui'
import { fmt, extractError } from '../../utils/helpers'

export default function AdminWallets() {
  const [wallets, setWallets]         = useState([])
  const [users, setUsers]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [fundModal, setFundModal]     = useState(false)
  const [apiModal, setApiModal]       = useState(null)  // { userId, apiKey, apiEnabled, webhookUrl }
  const [selectedUserId, setSelectedUserId] = useState('')
  const [amount, setAmount]           = useState('')
  const [note, setNote]               = useState('')
  const [saving, setSaving]           = useState(false)
  const [keyVisible, setKeyVisible]   = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [togglingApi, setTogglingApi] = useState(false)

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
      await adminApi.fundWallet({ user_id: selectedUserId, amount: parseFloat(amount), note, currency: 'INR' })
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

  async function openApiModal(uid) {
    try {
      const { data } = await adminApi.getApiInfo(uid)
      setApiModal({ userId: uid, apiKey: data.api_key, apiEnabled: data.api_enabled, webhookUrl: data.webhook_url })
      setKeyVisible(false)
    } catch (e) { toast.error(extractError(e)) }
  }

  async function handleRegenerateKey() {
    if (!window.confirm('Regenerate API key? The old key will stop working immediately.')) return
    setRegenerating(true)
    try {
      const { data } = await adminApi.regenerateApiKey(apiModal.userId)
      setApiModal(prev => ({ ...prev, apiKey: data.new_api_key }))
      setKeyVisible(true)
      toast.success('API key regenerated!')
    } catch (e) { toast.error(extractError(e)) }
    finally { setRegenerating(false) }
  }

  async function handleToggleApi() {
    setTogglingApi(true)
    try {
      const { data } = await adminApi.toggleApiAccess(apiModal.userId)
      setApiModal(prev => ({ ...prev, apiEnabled: data.api_enabled }))
      toast.success(data.api_enabled ? 'API access enabled' : 'API access disabled')
    } catch (e) { toast.error(extractError(e)) }
    finally { setTogglingApi(false) }
  }

  function copyKey() {
    navigator.clipboard.writeText(apiModal.apiKey)
    toast.success('API key copied!')
  }

  const maskedKey = apiModal?.apiKey
    ? apiModal.apiKey.slice(0, 10) + '••••••••••••••••••••••' + apiModal.apiKey.slice(-4)
    : '—'

  const columns = [
    { key: 'user', title: 'User', render: (v) => (
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
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button onClick={() => { setSelectedUserId(uid); setFundModal(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1px solid #e4e4e7', background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: '#374151' }}>
          <PlusCircle size={13} /> Fund
        </button>

        {/* API Key button */}
        <button onClick={() => openApiModal(uid)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1px solid #ddd6fe', background: '#f5f3ff', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: '#6d28d9' }}>
          <KeyRound size={13} /> API
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
        action={<Button onClick={() => setFundModal(true)}><PlusCircle size={15} /> Fund Wallet</Button>}
      />

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
        <Table columns={columns} data={wallets} loading={loading} emptyText="No wallets found" />
      </div>

      {/* ── Fund Modal ── */}
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

      {/* ── API Key Modal ── */}
      {apiModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={e => e.target === e.currentTarget && setApiModal(null)}>
          <div className="fade-in" style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,.18)', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>API Access</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Manage API key and access for this user</div>
              </div>
              <button onClick={() => setApiModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>✕</button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* API Status toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb', borderRadius: 10, border: '1px solid #e4e4e7', padding: '12px 16px' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>API Access</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Allow this user to use the payout API</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: apiModal.apiEnabled ? '#10b981' : '#ef4444' }}>
                    {apiModal.apiEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <button onClick={handleToggleApi} disabled={togglingApi}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: apiModal.apiEnabled ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', opacity: togglingApi ? .6 : 1 }}>
                    {togglingApi ? <Spinner size={18} /> : apiModal.apiEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                </div>
              </div>

              {/* API Key */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 8 }}>API Key</div>
                <div style={{ background: '#f9fafb', border: '1px solid #e4e4e7', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ flex: 1, fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {keyVisible ? apiModal.apiKey : maskedKey}
                  </code>
                  <button onClick={() => setKeyVisible(!keyVisible)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', flexShrink: 0 }}>
                    {keyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={copyKey} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', flexShrink: 0 }}>
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              {/* Webhook URL */}
              {apiModal.webhookUrl && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Webhook URL</div>
                  <div style={{ background: '#f9fafb', border: '1px solid #e4e4e7', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontFamily: 'DM Mono, monospace', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {apiModal.webhookUrl}
                  </div>
                </div>
              )}

              {/* Regenerate */}
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#92400e', marginBottom: 4 }}>⚠️ Regenerate API Key</div>
                <div style={{ fontSize: 12, color: '#b45309', marginBottom: 12 }}>
                  This will invalidate the current key immediately. The user must update their integration.
                </div>
                <button onClick={handleRegenerateKey} disabled={regenerating}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #f97316', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#ea580c', fontFamily: 'DM Sans, sans-serif', opacity: regenerating ? .7 : 1 }}>
                  {regenerating ? <Spinner size={13} /> : <RefreshCw size={13} />} Regenerate Key
                </button>
              </div>

              <button onClick={() => setApiModal(null)}
                style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'DM Sans, sans-serif' }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
