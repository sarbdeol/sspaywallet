import React, { useEffect, useState, useCallback } from 'react'
import {
  FileText, Download, Send, ChevronLeft, ChevronRight,
  Search, X, RefreshCw, BookOpen,
} from 'lucide-react'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { adminApi, payoutApi } from '../../services/api'
import { PageHeader, Badge, Spinner } from '../../components/ui'
import { fmt, extractError } from '../../utils/helpers'

// ─── helpers ──────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  SUCCESS: '#10b981', FAILED: '#ef4444',
  PENDING: '#f59e0b', EXPIRED: '#6b7280',
}

function statusBadge(s) {
  const color = STATUS_COLORS[s] || '#6b7280'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, letterSpacing: .3,
      background: color + '18', color,
    }}>{s}</span>
  )
}

function fmtINR(v) {
  return '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

// ─── API shim – admin fetches a user's transactions via payoutApi ─────────────
// payoutApi.transactions({ wallet_id, page, page_size, status, date_from, date_to })
// adminApi.getUserWallet(userId) → { balance, currency, … }

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminLedger() {
  const [users, setUsers]           = useState([])
  const [selUser, setSelUser]       = useState(null)   // full user object
  const [wallet, setWallet]         = useState(null)
  const [txns, setTxns]             = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const PAGE_SIZE = 20

  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingTxns,  setLoadingTxns]  = useState(false)

  // filters
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [statusF,   setStatusF]   = useState('')
  const [search,    setSearch]    = useState('')

  // send modal
  const [sendModal, setSendModal] = useState(false)
  const [sendTo,    setSendTo]    = useState('')
  const [sendFmt,   setSendFmt]   = useState('PDF')
  const [sendNote,  setSendNote]  = useState('')
  const [sending,   setSending]   = useState(false)

  // ── Load users ──────────────────────────────────────────────────────────────
  useEffect(() => {
    adminApi.listUsers({ limit: 200 })
      .then(r => setUsers(r.data))
      .catch(e => toast.error(extractError(e)))
      .finally(() => setLoadingUsers(false))
  }, [])

  // ── Load transactions whenever user / filters / page change ─────────────────
  const loadTxns = useCallback(async (uid, pg = 1) => {
    if (!uid) return
    setLoadingTxns(true)
    try {
      const [txnRes, walletRes] = await Promise.all([
        payoutApi.transactions({
          wallet_id: uid,
          page: pg,
          page_size: PAGE_SIZE,
          ...(statusF  && { status:    statusF  }),
          ...(dateFrom && { date_from: dateFrom }),
          ...(dateTo   && { date_to:   dateTo   }),
        }),
        adminApi.getUserWallet(uid),
      ])
      setTxns(txnRes.data.items ?? txnRes.data)
      setTotal(txnRes.data.total ?? txnRes.data.length)
      setWallet(walletRes.data)
    } catch (e) {
      toast.error(extractError(e))
    } finally {
      setLoadingTxns(false)
    }
  }, [statusF, dateFrom, dateTo])

  function selectUser(user) {
    setSelUser(user)
    setPage(1)
    setTxns([])
    setWallet(null)
    loadTxns(user.id, 1)
  }

  function applyFilters() {
    setPage(1)
    loadTxns(selUser.id, 1)
  }

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setStatusF('')
    setPage(1)
    loadTxns(selUser.id, 1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Filtered user list (search) ─────────────────────────────────────────────
  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase()
    return !q || u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
  })

  // ── Summary stats from loaded txns ─────────────────────────────────────────
  const totalAmt   = txns.reduce((s, t) => s + parseFloat(t.amount || 0), 0)
  const successAmt = txns.filter(t => t.status === 'SUCCESS').reduce((s, t) => s + parseFloat(t.amount || 0), 0)
  const pendingCnt = txns.filter(t => t.status === 'PENDING').length
  const failedCnt  = txns.filter(t => t.status === 'FAILED').length

  // ── Export PDF ──────────────────────────────────────────────────────────────
  function exportPDF() {
    if (!txns.length) { toast.error('No transactions to export'); return }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('XPAY — User Ledger', 14, 16)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`User: ${selUser.full_name || selUser.username}  |  Email: ${selUser.email}`, 14, 23)
    doc.text(`Wallet Balance: ${fmtINR(wallet?.balance)}  |  Generated: ${new Date().toLocaleString('en-IN')}`, 14, 28)
    if (dateFrom || dateTo) doc.text(`Period: ${dateFrom || '—'} to ${dateTo || '—'}`, 14, 33)

    autoTable(doc, {
      startY: dateFrom || dateTo ? 38 : 33,
      head: [['#', 'Date', 'Order ID', 'Beneficiary', 'Account', 'IFSC', 'Bank', 'Amount (₹)', 'Status', 'UTR']],
      body: txns.map((t, i) => [
        i + 1 + (page - 1) * PAGE_SIZE,
        fmt.date(t.created_at),
        t.order_id,
        t.beneficiary_name,
        t.account_number,
        t.ifsc,
        t.bank_name || '—',
        parseFloat(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        t.status,
        t.utr || '—',
      ]),
      foot: [['', '', '', '', '', '', 'Total', parseFloat(totalAmt).toLocaleString('en-IN', { minimumFractionDigits: 2 }), '', '']],
      styles:      { fontSize: 8, cellPadding: 2.5, font: 'helvetica' },
      headStyles:  { fillColor: [26, 26, 46], textColor: 255, fontStyle: 'bold' },
      footStyles:  { fillColor: [240, 240, 250], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0:  { cellWidth: 8 },
        1:  { cellWidth: 24 },
        2:  { cellWidth: 36 },
        3:  { cellWidth: 34 },
        4:  { cellWidth: 28 },
        5:  { cellWidth: 22 },
        6:  { cellWidth: 28 },
        7:  { cellWidth: 22, halign: 'right' },
        8:  { cellWidth: 18 },
        9:  { cellWidth: 22 },
      },
    })

    doc.save(`ledger_${selUser.username}_${new Date().toISOString().slice(0, 10)}.pdf`)
    toast.success('PDF downloaded')
  }

  // ── Export Excel ─────────────────────────────────────────────────────────────
  function exportExcel() {
    if (!txns.length) { toast.error('No transactions to export'); return }
    const wb = XLSX.utils.book_new()

    // Info sheet
    const info = [
      ['XPAY — User Ledger'],
      ['User', selUser.full_name || selUser.username],
      ['Email', selUser.email],
      ['Wallet Balance', parseFloat(wallet?.balance || 0)],
      ['Generated', new Date().toLocaleString('en-IN')],
      [],
    ]

    const headers = ['#', 'Date', 'Order ID', 'Transaction ID', 'Beneficiary', 'Account No', 'IFSC', 'Bank', 'Amount (₹)', 'Currency', 'Status', 'UTR', 'Gateway Ref']
    const rows = txns.map((t, i) => [
      i + 1 + (page - 1) * PAGE_SIZE,
      fmt.date(t.created_at),
      t.order_id,
      t.transaction_id || '—',
      t.beneficiary_name,
      t.account_number,
      t.ifsc,
      t.bank_name || '—',
      parseFloat(t.amount),
      t.currency || 'INR',
      t.status,
      t.utr || '—',
      t.gateway_ref_id || '—',
    ])

    const ws = XLSX.utils.aoa_to_sheet([...info, headers, ...rows])
    ws['!cols'] = [8,20,32,28,28,18,14,22,14,10,12,18,18].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger')
    XLSX.writeFile(wb, `ledger_${selUser.username}_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success('Excel downloaded')
  }

  // ── Send ledger ───────────────────────────────────────────────────────────────
  async function handleSend(e) {
    e.preventDefault()
    if (!sendTo.trim()) { toast.error('Enter email or WhatsApp number'); return }
    setSending(true)
    // In production: POST to your backend to email/WhatsApp the ledger
    await new Promise(r => setTimeout(r, 1200))
    setSending(false)
    setSendModal(false)
    setSendTo(''); setSendNote('')
    toast.success(`Ledger sent to ${sendTo}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', fontFamily: 'DM Sans, sans-serif' }}>

      {/* ── LEFT: User list ──────────────────────────────────────────────────── */}
      <div style={{
        width: 260, flexShrink: 0,
        background: '#fff', borderRadius: 14, border: '1px solid #e4e4e7',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Users</div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              placeholder="Search users…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px 7px 28px', fontSize: 13,
                border: '1px solid #e4e4e7', borderRadius: 8, outline: 'none',
                fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
          {loadingUsers
            ? <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : filteredUsers.length === 0
              ? <div style={{ padding: 20, fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>No users found</div>
              : filteredUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => selectUser(u)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '11px 16px',
                    border: 'none', borderBottom: '1px solid #f9fafb',
                    background: selUser?.id === u.id ? '#f0f9ff' : '#fff',
                    cursor: 'pointer', transition: 'background .12s',
                    borderLeft: selUser?.id === u.id ? '3px solid #0ea5e9' : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (selUser?.id !== u.id) e.currentTarget.style.background = '#f9fafb' }}
                  onMouseLeave={e => { if (selUser?.id !== u.id) e.currentTarget.style.background = '#fff' }}
                >
                  <div style={{ fontWeight: 500, fontSize: 13, color: '#111827' }}>
                    {u.full_name || u.username}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>@{u.username}</div>
                </button>
              ))
          }
        </div>
      </div>

      {/* ── RIGHT: Ledger ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Header */}
        <PageHeader
          title={selUser ? `Ledger — ${selUser.full_name || selUser.username}` : 'Ledger'}
          subtitle={selUser ? selUser.email : 'Select a user to view their ledger'}
          action={selUser && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={exportExcel}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  borderRadius: 9, border: '1px solid #e4e4e7', background: '#fff',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#374151',
                  fontFamily: 'DM Sans, sans-serif',
                }}>
                <Download size={14} color="#10b981" /> Excel
              </button>
              <button onClick={exportPDF}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  borderRadius: 9, border: '1px solid #e4e4e7', background: '#fff',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#374151',
                  fontFamily: 'DM Sans, sans-serif',
                }}>
                <FileText size={14} color="#ef4444" /> PDF
              </button>
              <button onClick={() => setSendModal(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                  borderRadius: 9, border: 'none', background: '#1a1a2e',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#fff',
                  fontFamily: 'DM Sans, sans-serif',
                }}>
                <Send size={14} /> Send Ledger
              </button>
            </div>
          )}
        />

        {!selUser ? (
          /* Empty state */
          <div style={{
            background: '#fff', borderRadius: 14, border: '1px solid #e4e4e7',
            padding: 60, textAlign: 'center',
          }}>
            <BookOpen size={40} color="#e4e4e7" style={{ marginBottom: 14 }} />
            <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>Select a user</div>
            <div style={{ fontSize: 13, color: '#9ca3af' }}>Choose a user from the left panel to view their ledger</div>
          </div>
        ) : (
          <>
            {/* Wallet + stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
              {[
                { label: 'Wallet Balance',  value: fmtINR(wallet?.balance),  color: '#0ea5e9' },
                { label: 'Total (this page)', value: fmtINR(totalAmt),        color: '#8b5cf6' },
                { label: 'Successful',       value: fmtINR(successAmt),       color: '#10b981' },
                { label: 'Pending',          value: pendingCnt + ' txns',      color: '#f59e0b' },
                { label: 'Failed',           value: failedCnt  + ' txns',      color: '#ef4444' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e4e7', padding: '14px 16px' }}>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 5 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div style={{
              background: '#fff', borderRadius: 12, border: '1px solid #e4e4e7',
              padding: '14px 18px', marginBottom: 16,
              display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
            }}>
              {[
                { label: 'From', type: 'date', val: dateFrom, set: setDateFrom },
                { label: 'To',   type: 'date', val: dateTo,   set: setDateTo   },
              ].map(({ label, type, val, set }) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{label}</div>
                  <input type={type} value={val} onChange={e => set(e.target.value)}
                    style={{
                      height: 34, padding: '0 10px', fontSize: 13, borderRadius: 8,
                      border: '1px solid #e4e4e7', outline: 'none', fontFamily: 'DM Sans, sans-serif',
                    }}
                  />
                </div>
              ))}

              <div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Status</div>
                <select value={statusF} onChange={e => setStatusF(e.target.value)}
                  style={{
                    height: 34, padding: '0 10px', fontSize: 13, borderRadius: 8,
                    border: '1px solid #e4e4e7', outline: 'none', fontFamily: 'DM Sans, sans-serif',
                    background: '#fff',
                  }}>
                  <option value="">All</option>
                  {['SUCCESS', 'PENDING', 'FAILED', 'EXPIRED'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <button onClick={applyFilters}
                style={{
                  height: 34, padding: '0 16px', borderRadius: 8, border: 'none',
                  background: '#1a1a2e', color: '#fff', cursor: 'pointer',
                  fontSize: 13, fontWeight: 500, fontFamily: 'DM Sans, sans-serif',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <RefreshCw size={13} /> Apply
              </button>

              {(dateFrom || dateTo || statusF) && (
                <button onClick={clearFilters}
                  style={{
                    height: 34, padding: '0 14px', borderRadius: 8,
                    border: '1px solid #e4e4e7', background: '#fff',
                    cursor: 'pointer', fontSize: 13, color: '#6b7280',
                    fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                  <X size={13} /> Clear
                </button>
              )}
            </div>

            {/* Table */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
              {loadingTxns ? (
                <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
                  <Spinner size={28} />
                </div>
              ) : txns.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                  No transactions found
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e4e4e7' }}>
                        {['#', 'Date', 'Order ID', 'Beneficiary', 'Account', 'Bank', 'Amount', 'Status', 'UTR'].map(h => (
                          <th key={h} style={{
                            padding: '10px 14px', textAlign: h === 'Amount' ? 'right' : 'left',
                            fontWeight: 600, fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {txns.map((t, i) => (
                        <tr key={t.order_id}
                          style={{ borderBottom: '1px solid #f0f0f0', transition: 'background .1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                          <td style={{ padding: '11px 14px', color: '#9ca3af', fontSize: 12 }}>
                            {i + 1 + (page - 1) * PAGE_SIZE}
                          </td>
                          <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', color: '#6b7280' }}>
                            {fmt.date(t.created_at)}
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#374151' }}>
                              {t.order_id}
                            </span>
                          </td>
                          <td style={{ padding: '11px 14px', fontWeight: 500, color: '#111827' }}>
                            {t.beneficiary_name}
                          </td>
                          <td style={{ padding: '11px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#6b7280' }}>
                            {t.account_number}
                          </td>
                          <td style={{ padding: '11px 14px', color: '#6b7280' }}>
                            {t.bank_name || '—'}
                          </td>
                          <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
                            {fmtINR(t.amount)}
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            {statusBadge(t.status)}
                          </td>
                          <td style={{ padding: '11px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#9ca3af' }}>
                            {t.utr || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f9fafb', borderTop: '2px solid #e4e4e7' }}>
                        <td colSpan={6} style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, color: '#374151' }}>
                          Page total ({txns.length} transactions)
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 14, color: '#111827', whiteSpace: 'nowrap' }}>
                          {fmtINR(totalAmt)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <span style={{ fontSize: 13, color: '#9ca3af' }}>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    disabled={page === 1}
                    onClick={() => { const p = page - 1; setPage(p); loadTxns(selUser.id, p) }}
                    style={{
                      height: 32, width: 32, borderRadius: 8, border: '1px solid #e4e4e7',
                      background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: page === 1 ? .4 : 1,
                    }}>
                    <ChevronLeft size={15} />
                  </button>
                  <span style={{ height: 32, padding: '0 14px', display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 500 }}>
                    {page} / {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => { const p = page + 1; setPage(p); loadTxns(selUser.id, p) }}
                    style={{
                      height: 32, width: 32, borderRadius: 8, border: '1px solid #e4e4e7',
                      background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: page >= totalPages ? .4 : 1,
                    }}>
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Send Modal ──────────────────────────────────────────────────────── */}
      {sendModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
            backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 1000, padding: 20,
          }}
          onClick={e => e.target === e.currentTarget && setSendModal(false)}
        >
          <div className="fade-in" style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420,
            boxShadow: '0 20px 60px rgba(0,0,0,.18)', overflow: 'hidden',
          }}>
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid #f0f0f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>Send Ledger</span>
              <button onClick={() => setSendModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>✕</button>
            </div>

            <form onSubmit={handleSend} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div style={{ background: '#f9fafb', borderRadius: 10, border: '1px solid #e4e4e7', padding: '10px 14px', fontSize: 13 }}>
                <span style={{ color: '#9ca3af' }}>User: </span>
                <span style={{ fontWeight: 500, color: '#111827' }}>{selUser?.full_name || selUser?.username}</span>
                <span style={{ color: '#9ca3af', margin: '0 8px' }}>·</span>
                <span style={{ color: '#9ca3af' }}>{txns.length} transactions · {fmtINR(totalAmt)}</span>
              </div>

              {[
                { label: 'Send to (Email or WhatsApp)', placeholder: 'user@email.com or +91 9999999999', val: sendTo, set: setSendTo, required: true },
              ].map(({ label, placeholder, val, set, required }) => (
                <div key={label}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>{label}</label>
                  <input
                    type="text" required={required} value={val}
                    onChange={e => set(e.target.value)} placeholder={placeholder}
                    style={{
                      width: '100%', padding: '9px 12px', fontSize: 14,
                      border: '1.5px solid #e4e4e7', borderRadius: 10, outline: 'none',
                      fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = '#0ea5e9'}
                    onBlur={e  => e.target.style.borderColor = '#e4e4e7'}
                  />
                </div>
              ))}

              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Format</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['PDF', 'Excel', 'Both'].map(f => (
                    <button key={f} type="button" onClick={() => setSendFmt(f)}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 9, fontSize: 13, fontWeight: 500,
                        cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all .15s',
                        border: sendFmt === f ? 'none' : '1px solid #e4e4e7',
                        background: sendFmt === f ? '#1a1a2e' : '#fff',
                        color: sendFmt === f ? '#fff' : '#374151',
                      }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Note (optional)</label>
                <textarea
                  value={sendNote} onChange={e => setSendNote(e.target.value)}
                  placeholder="e.g. Ledger for April 2026…"
                  rows={3}
                  style={{
                    width: '100%', padding: '9px 12px', fontSize: 13,
                    border: '1.5px solid #e4e4e7', borderRadius: 10, outline: 'none', resize: 'none',
                    fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = '#0ea5e9'}
                  onBlur={e  => e.target.style.borderColor = '#e4e4e7'}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setSendModal(false)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10,
                    border: '1px solid #e4e4e7', background: '#fff',
                    cursor: 'pointer', fontSize: 14, fontFamily: 'DM Sans, sans-serif',
                  }}>
                  Cancel
                </button>
                <button type="submit" disabled={sending}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                    background: '#1a1a2e', color: '#fff', cursor: 'pointer',
                    fontSize: 14, fontWeight: 500, fontFamily: 'DM Sans, sans-serif',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    opacity: sending ? .7 : 1,
                  }}>
                  {sending ? <Spinner size={14} color="#fff" /> : <Send size={14} />}
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}