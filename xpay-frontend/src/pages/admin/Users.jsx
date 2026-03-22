import React, { useEffect, useState } from 'react'
import { UserPlus, ToggleLeft, ToggleRight, Copy, LogIn, Eye, EyeOff, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '../../services/api'
import { Table, PageHeader, Badge, Button, Modal, Input, Spinner } from '../../components/ui'
import { fmt, extractError } from '../../utils/helpers'

const DEFAULT_FORM = { username: '', email: '', full_name: '', password: '' }

export default function AdminUsers() {
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm]             = useState(DEFAULT_FORM)
  const [saving, setSaving]         = useState(false)
  const [errors, setErrors]         = useState({})
  const [createdUser, setCreatedUser] = useState(null)
  const [credModal, setCredModal]   = useState(null)  // { user, password, loading }
  const [resetModal, setResetModal] = useState(null)  // { user }
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting]   = useState(false)
  const [showPw, setShowPw]         = useState(false)
  const [showCredPw, setShowCredPw] = useState(false)

  const load = () => {
    setLoading(true)
    adminApi.listUsers({ limit: 100 })
      .then(r => setUsers(r.data))
      .catch(e => toast.error(extractError(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function validate() {
    const e = {}
    if (!form.username.trim()) e.username = 'Required'
    if (!form.email.trim()) e.email = 'Required'
    if (!form.password || form.password.length < 6) e.password = 'Minimum 6 characters'
    setErrors(e)
    return !Object.keys(e).length
  }

  async function handleCreate(ev) {
    ev.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      await adminApi.createUser(form)
      toast.success(`User "${form.username}" created`)
      setShowCreate(false)
      setCreatedUser({
        username:  form.username,
        password:  form.password,
        email:     form.email,
        full_name: form.full_name,
      })
      setForm(DEFAULT_FORM)
      load()
    } catch (e) { toast.error(extractError(e)) }
    finally { setSaving(false) }
  }

  async function toggleUser(id, current) {
    try {
      await adminApi.toggleUser(id)
      toast.success(current ? 'User disabled' : 'User enabled')
      load()
    } catch (e) { toast.error(extractError(e)) }
  }

  async function viewCredentials(user) {
    setCredModal({ user, password: null, loading: true })
    try {
      const { data } = await adminApi.getCredentials(user.id)
      setCredModal({ user, password: data.password, loading: false })
    } catch (e) {
      toast.error(extractError(e))
      setCredModal(null)
    }
  }

  async function handleResetPassword() {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setResetting(true)
    try {
      await adminApi.resetPassword(resetModal.user.id, newPassword)
      toast.success(`Password reset for ${resetModal.user.username}`)
      setResetModal(null)
      setNewPassword('')
    } catch (e) { toast.error(extractError(e)) }
    finally { setResetting(false) }
  }

  function copyText(text, label) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied!`)
  }

  function loginAsUser(username) {
    window.open(`${window.location.origin}/login?u=${encodeURIComponent(username)}`, '_blank')
  }

  const columns = [
    { key: 'full_name', title: 'Name', render: (v, r) => (
      <div>
        <div style={{ fontWeight: 500 }}>{v || r.username}</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>@{r.username}</div>
      </div>
    )},
    { key: 'email',     title: 'Email',  render: v => <span style={{ color: '#6b7280', fontSize: 13 }}>{v}</span> },
    { key: 'is_active', title: 'Status', render: v => <Badge status={v ? 'SUCCESS' : 'FAILED'} label={v ? 'Active' : 'Disabled'} /> },
    { key: 'created_at',title: 'Joined', render: v => <span style={{ fontSize: 13, color: '#6b7280' }}>{fmt.dateShort(v)}</span> },
    { key: 'id', title: 'Actions', align: 'right', render: (id, row) => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>

        {/* View Credentials */}
        <button onClick={() => viewCredentials(row)}
          title="View username & password"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
            borderRadius: 7, border: '1px solid #e4e4e7', background: '#fff',
            cursor: 'pointer', fontSize: 12, color: '#374151', fontFamily: 'DM Sans, sans-serif',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
        >
          <Eye size={12} /> Credentials
        </button>

        {/* Reset Password */}
        <button onClick={() => { setResetModal({ user: row }); setNewPassword('') }}
          title="Reset password"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
            borderRadius: 7, border: '1px solid #fde68a', background: '#fffbeb',
            cursor: 'pointer', fontSize: 12, color: '#92400e', fontFamily: 'DM Sans, sans-serif',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#fef3c7'}
          onMouseLeave={e => e.currentTarget.style.background = '#fffbeb'}
        >
          <KeyRound size={12} /> Reset
        </button>

        {/* Login as user */}
        <button onClick={() => loginAsUser(row.username)}
          title="Open login page for this user"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
            borderRadius: 7, border: '1px solid #bae6fd', background: '#f0f9ff',
            cursor: 'pointer', fontSize: 12, color: '#0369a1', fontFamily: 'DM Sans, sans-serif',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#e0f2fe'}
          onMouseLeave={e => e.currentTarget.style.background = '#f0f9ff'}
        >
          <LogIn size={12} /> Login
        </button>

        {/* Enable/Disable */}
        <button onClick={() => toggleUser(id, row.is_active)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: row.is_active ? '#ef4444' : '#10b981',
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, fontFamily: 'DM Sans, sans-serif',
          }}>
          {row.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          {row.is_active ? 'Disable' : 'Enable'}
        </button>
      </div>
    )},
  ]

  return (
    <div>
      <PageHeader title="Users" subtitle={`${users.length} registered users`}
        action={<Button onClick={() => setShowCreate(true)}><UserPlus size={15} /> New User</Button>}
      />

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
        <Table columns={columns} data={users} loading={loading} emptyText="No users yet" />
      </div>

      {/* ── Create User Modal ── */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setForm(DEFAULT_FORM); setErrors({}) }} title="Create New User">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input label="Username *"  value={form.username}  onChange={e => setForm(f => ({ ...f, username:  e.target.value }))} error={errors.username}  placeholder="john_doe" />
            <Input label="Full Name"   value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="John Doe" />
          </div>
          <Input label="Email *"       value={form.email}     onChange={e => setForm(f => ({ ...f, email:     e.target.value }))} error={errors.email}     placeholder="john@example.com" type="email" />
          <Input label="Password *"    value={form.password}  onChange={e => setForm(f => ({ ...f, password:  e.target.value }))} error={errors.password}  placeholder="Min 6 characters" type="password" />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button variant="secondary" type="button" onClick={() => { setShowCreate(false); setForm(DEFAULT_FORM); setErrors({}) }}>Cancel</Button>
            <Button type="submit" loading={saving}>Create User</Button>
          </div>
        </form>
      </Modal>

      {/* ── Credentials After Creation ── */}
      {createdUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(2px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="fade-in" style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,.18)', overflow: 'hidden' }}>
            <div style={{ background: '#1a1a2e', padding: '20px 24px' }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>User Created</div>
              <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>Save these credentials</div>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ background: '#f9fafb', borderRadius: 12, border: '1px solid #e4e4e7', padding: 16, marginBottom: 16 }}>
                {[
                  { label: 'URL',      value: window.location.origin + '/login' },
                  { label: 'Username', value: createdUser.username },
                  { label: 'Password', value: createdUser.password },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 72 }}>{label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: '#111827', fontWeight: 500 }}>{value}</span>
                      <button onClick={() => copyText(value, label)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => { copyText(`Login URL: ${window.location.origin}/login\nUsername: ${createdUser.username}\nPassword: ${createdUser.password}`, 'All credentials') }}
                style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
                <Copy size={14} /> Copy All
              </button>
              <button onClick={() => setCreatedUser(null)}
                style={{ width: '100%', padding: 10, borderRadius: 10, border: 'none', background: '#1a1a2e', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'DM Sans, sans-serif', color: '#fff' }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Credentials Modal ── */}
      {credModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(2px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setCredModal(null)}>
          <div className="fade-in" style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,.18)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>User Credentials</span>
              <button onClick={() => setCredModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ padding: 24 }}>
              {credModal.loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Spinner /></div>
              ) : (
                <>
                  <div style={{ background: '#f9fafb', borderRadius: 12, border: '1px solid #e4e4e7', padding: 16, marginBottom: 16 }}>
                    {[
                      { label: 'URL',      value: window.location.origin + '/login' },
                      { label: 'Username', value: credModal.user.username },
                      { label: 'Password', value: credModal.password, secret: true },
                    ].map(({ label, value, secret }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 72 }}>{label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: '#111827', fontWeight: 500 }}>
                            {secret && !showCredPw ? '••••••••' : value}
                          </span>
                          {secret && (
                            <button onClick={() => setShowCredPw(!showCredPw)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                              {showCredPw ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          )}
                          <button onClick={() => copyText(value, label)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                            <Copy size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => { copyText(`Login URL: ${window.location.origin}/login\nUsername: ${credModal.user.username}\nPassword: ${credModal.password}`, 'All credentials') }}
                      style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Copy size={13} /> Copy All
                    </button>
                    <button
                      onClick={() => { loginAsUser(credModal.user.username); setCredModal(null) }}
                      style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', background: '#1a1a2e', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <LogIn size={13} /> Login as User
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ── */}
      {resetModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(2px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setResetModal(null)}>
          <div className="fade-in" style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,.18)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>Reset Password</span>
              <button onClick={() => setResetModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                Resetting password for <strong>{resetModal.user.username}</strong>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '9px 40px 9px 12px', fontSize: 14, border: '1.5px solid #e4e4e7', borderRadius: 10, outline: 'none', fontFamily: 'DM Sans, sans-serif' }}
                  onFocus={e => e.target.style.borderColor = '#0ea5e9'}
                  onBlur={e  => e.target.style.borderColor = '#e4e4e7'}
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setResetModal(null)}
                  style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'DM Sans, sans-serif' }}>
                  Cancel
                </button>
                <button onClick={handleResetPassword} disabled={resetting}
                  style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', background: '#1a1a2e', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'DM Sans, sans-serif', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: resetting ? .6 : 1 }}>
                  {resetting && <Spinner size={13} color="#fff" />} Reset Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}