import React, { useEffect, useState } from 'react'
import { UserPlus, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '../../services/api'
import { Table, PageHeader, Badge, Button, Modal, Input, Spinner } from '../../components/ui'
import { fmt, extractError } from '../../utils/helpers'

const DEFAULT_FORM = { username: '', email: '', full_name: '', password: '' }

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

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

  const columns = [
    { key: 'full_name', title: 'Name', render: (v, r) => (
      <div>
        <div style={{ fontWeight: 500 }}>{v || r.username}</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>@{r.username}</div>
      </div>
    )},
    { key: 'email',      title: 'Email',   render: v => <span style={{ color: '#6b7280', fontSize: 13 }}>{v}</span> },
    { key: 'is_active',  title: 'Status',  render: v => <Badge status={v ? 'SUCCESS' : 'FAILED'} label={v ? 'Active' : 'Disabled'} /> },
    { key: 'created_at', title: 'Joined',  render: v => <span style={{ fontSize: 13, color: '#6b7280' }}>{fmt.dateShort(v)}</span> },
    { key: 'id',         title: 'Action',  align: 'right', render: (id, row) => (
      <button onClick={() => toggleUser(id, row.is_active)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: row.is_active ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
        {row.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
        {row.is_active ? 'Disable' : 'Enable'}
      </button>
    )},
  ]

  return (
    <div>
      <PageHeader title="Users" subtitle={`${users.length} registered users`}
        action={
          <Button onClick={() => setShowCreate(true)}>
            <UserPlus size={15} /> New User
          </Button>
        }
      />

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
        <Table columns={columns} data={users} loading={loading} emptyText="No users yet" />
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setForm(DEFAULT_FORM); setErrors({}) }} title="Create New User">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input label="Username *"   value={form.username}   onChange={e => setForm(f => ({ ...f, username:   e.target.value }))} error={errors.username}   placeholder="john_doe" />
            <Input label="Full Name"    value={form.full_name}  onChange={e => setForm(f => ({ ...f, full_name:  e.target.value }))} placeholder="John Doe" />
          </div>
          <Input label="Email *"        value={form.email}      onChange={e => setForm(f => ({ ...f, email:      e.target.value }))} error={errors.email}      placeholder="john@example.com" type="email" />
          <Input label="Password *"     value={form.password}   onChange={e => setForm(f => ({ ...f, password:   e.target.value }))} error={errors.password}   placeholder="Min 6 characters" type="password" />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button variant="secondary" type="button" onClick={() => { setShowCreate(false); setForm(DEFAULT_FORM); setErrors({}) }}>Cancel</Button>
            <Button type="submit" loading={saving}>Create User</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
