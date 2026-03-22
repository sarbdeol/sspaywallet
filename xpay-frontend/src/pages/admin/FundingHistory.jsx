import React, { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '../../services/api'
import { Table, PageHeader, Spinner } from '../../components/ui'
import { fmt, extractError } from '../../utils/helpers'

export default function FundingHistory() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminApi.fundingHistory({ limit: 100 })
      .then(r => setRecords(r.data))
      .catch(e => toast.error(extractError(e)))
      .finally(() => setLoading(false))
  }, [])

  const columns = [
    { key: 'created_at', title: 'Date', render: v => <span style={{ fontSize: 13 }}>{fmt.date(v)}</span> },
    { key: 'amount',     title: 'Amount', render: (v, r) => (
      <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: '#10b981' }}>
        +{fmt.currency(v, r.currency)}
      </span>
    )},
    { key: 'admin_balance_before', title: 'Admin Wallet', render: (v, r) => (
      <div style={{ fontSize: 13 }}>
        <span style={{ color: '#6b7280' }}>{fmt.currency(v)}</span>
        <ArrowRight size={12} style={{ margin: '0 4px', color: '#9ca3af', display: 'inline' }} />
        <span style={{ color: '#374151', fontWeight: 500 }}>{fmt.currency(r.admin_balance_after)}</span>
      </div>
    )},
    { key: 'sub_balance_before', title: 'Sub Wallet', render: (v, r) => (
      <div style={{ fontSize: 13 }}>
        <span style={{ color: '#6b7280' }}>{fmt.currency(v)}</span>
        <ArrowRight size={12} style={{ margin: '0 4px', color: '#9ca3af', display: 'inline' }} />
        <span style={{ color: '#374151', fontWeight: 500 }}>{fmt.currency(r.sub_balance_after)}</span>
      </div>
    )},
    { key: 'note', title: 'Note', render: v => <span style={{ fontSize: 13, color: '#6b7280' }}>{v || '—'}</span> },
  ]

  return (
    <div>
      <PageHeader title="Funding History" subtitle="All wallet funding transactions" />
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
        <Table columns={columns} data={records} loading={loading} emptyText="No funding records yet" />
      </div>
    </div>
  )
}
