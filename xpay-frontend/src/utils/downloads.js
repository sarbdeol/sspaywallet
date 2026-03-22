import { fmt } from './helpers'

// ── PDF Receipt ───────────────────────────────────────────────────────────────

export function downloadPDFReceipt(txn) {
  const statusColors = {
    SUCCESS: '#10b981', FAILED: '#ef4444', PENDING: '#8b5cf6',
    EXPIRED: '#f59e0b', REJECTED: '#6b7280', PROCESSING: '#0ea5e9',
  }
  const color = statusColors[txn.status] || '#6b7280'

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Receipt - ${txn.order_id}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; background:#f9fafb; padding:40px; color:#111827; }
  .card { background:#fff; border-radius:12px; max-width:480px; margin:0 auto; box-shadow:0 4px 20px rgba(0,0,0,.08); overflow:hidden; }
  .header { background:#1a1a2e; padding:28px 32px; text-align:center; }
  .header h1 { color:#fff; font-size:22px; font-weight:700; }
  .header p { color:#9ca3af; font-size:13px; margin-top:4px; }
  .status-bar { padding:14px 32px; text-align:center; background:${color}18; border-bottom:1px solid ${color}30; }
  .status-badge { display:inline-flex; align-items:center; gap:6px; padding:5px 16px; border-radius:99px; background:${color}20; color:${color}; font-weight:600; font-size:14px; }
  .dot { width:8px; height:8px; border-radius:50%; background:${color}; display:inline-block; }
  .amount-section { padding:28px 32px; text-align:center; border-bottom:1px solid #f0f0f0; }
  .amount-label { font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:.08em; margin-bottom:8px; }
  .amount { font-size:38px; font-weight:700; color:#111827; letter-spacing:-1.5px; }
  .details { padding:24px 32px; }
  .row { display:flex; justify-content:space-between; align-items:flex-start; padding:10px 0; border-bottom:1px solid #f9f9f9; }
  .row:last-child { border-bottom:none; }
  .label { font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:.06em; flex-shrink:0; margin-right:16px; }
  .value { font-size:13px; color:#111827; font-weight:500; text-align:right; word-break:break-all; font-family:'Courier New',monospace; }
  .value.normal { font-family:Arial,sans-serif; }
  .utr { background:#ecfdf5; border:1px solid #bbf7d0; border-radius:8px; padding:12px 16px; margin:0 32px 24px; text-align:center; }
  .utr-label { font-size:11px; color:#065f46; text-transform:uppercase; letter-spacing:.08em; margin-bottom:4px; }
  .utr-value { font-size:16px; font-weight:700; color:#10b981; font-family:'Courier New',monospace; }
  .footer { padding:16px 32px; background:#f9fafb; text-align:center; border-top:1px solid #f0f0f0; }
  .footer p { font-size:11px; color:#9ca3af; }
  @media print { body { padding:0; background:#fff; } .card { box-shadow:none; border-radius:0; } }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>SSpay Wallet</h1>
    <p>Transaction Receipt</p>
  </div>
  <div class="status-bar">
    <span class="status-badge"><span class="dot"></span>${txn.status}</span>
  </div>
  <div class="amount-section">
    <div class="amount-label">Amount Transferred</div>
    <div class="amount">${fmt.currency(txn.amount, txn.currency)}</div>
  </div>
  ${txn.utr ? `<div class="utr" style="margin-top:24px"><div class="utr-label">UTR / Reference Number</div><div class="utr-value">${txn.utr}</div></div>` : ''}
  <div class="details">
    <div class="row"><span class="label">Order ID</span><span class="value">${txn.order_id || '—'}</span></div>
    ${txn.transaction_id ? `<div class="row"><span class="label">Transaction ID</span><span class="value">${txn.transaction_id}</span></div>` : ''}
    <div class="row"><span class="label">Beneficiary</span><span class="value normal">${txn.beneficiary_name || '—'}</span></div>
    <div class="row"><span class="label">Account No.</span><span class="value">${txn.account_number || '—'}</span></div>
    <div class="row"><span class="label">IFSC Code</span><span class="value">${txn.ifsc || '—'}</span></div>
    ${txn.bank_name ? `<div class="row"><span class="label">Bank</span><span class="value normal">${txn.bank_name}</span></div>` : ''}
    <div class="row"><span class="label">Date & Time</span><span class="value normal">${fmt.date(txn.created_at)}</span></div>
    ${txn.failure_reason ? `<div class="row"><span class="label">Failure Reason</span><span class="value normal" style="color:#ef4444">${txn.failure_reason}</span></div>` : ''}
  </div>
  <div class="footer">
    <p>Computer-generated receipt · Generated on ${fmt.date(new Date().toISOString())}</p>
  </div>
</div>
</body>
</html>`

  triggerDownload(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    `receipt-${txn.order_id}.html`
  )
}

// ── Bulk Job CSV Report ───────────────────────────────────────────────────────

export function downloadBulkJobExcel(job) {
  const summaryData = [
    ['Field', 'Value'],
    ['Job ID',       job.id            || ''],
    ['Filename',     job.filename      || ''],
    ['Status',       job.status        || ''],
    ['Total Rows',   job.total_rows    || 0],
    ['Success',      job.success_count || 0],
    ['Failed',       job.failed_count  || 0],
    ['Rejected',     job.skipped_count || 0],
    ['Total Amount', job.total_amount  || 0],
    ['Created At',   job.created_at   ? fmt.date(job.created_at)   : ''],
    ['Completed At', job.completed_at ? fmt.date(job.completed_at) : 'In Progress'],
  ]

  const errorData = [
    ['Row', 'Beneficiary Name', 'Amount', 'Status', 'Reason'],
    ...(job.error_log || []).map(e => [
      e.row || '', e.beneficiary_name || '', e.amount || '', e.status || '', e.reason || '',
    ])
  ]

  const sections = [
    { title: '=== JOB SUMMARY ===', data: summaryData },
    { title: '=== ERROR LOG ===',   data: errorData },
  ]

  const csv = sections.map(s => {
    const rows = s.data.map(row =>
      row.map(cell => {
        const v = String(cell ?? '')
        return v.includes(',') || v.includes('"') || v.includes('\n')
          ? `"${v.replace(/"/g, '""')}"` : v
      }).join(',')
    ).join('\n')
    return `${s.title}\n${rows}`
  }).join('\n\n')

  triggerDownload(
    new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
    `bulk-report-${(job.id || 'job').slice(0, 8)}.csv`
  )
}

// ── SSpay Export — single .xlsx for bulk clear upload ────────────────────────
// Columns match SSpay's expected bulk-clear format exactly.
// utrNumber column is included (empty) — user fills it, then uploads to SSpay.

export async function downloadSSpayExport(transactions) {
  const XLSX = await import('xlsx')

  // Exact column order SSpay expects for bulk-clear upload
  const rows = transactions.map(t => ({
    'id':                t.transaction_id   || t.order_id || '',
    'utrNumber':         t.utr              || '',   // pre-fill if already have UTR
    'amount':            parseFloat(t.amount) || 0,
    'accountHolderName': t.beneficiary_name || '',
    'accountNumber':     t.account_number   || '',
    'ifscCode':          t.ifsc             || '',
    'bankName':          t.bank_name        || '',
    'notes':             t.order_id         || '',
    'status':            t.status           || '',
  }))

  const headers = ['id', 'utrNumber', 'amount', 'accountHolderName', 'accountNumber', 'ifscCode', 'bankName', 'notes', 'status']
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers })

  // Column widths
  ws['!cols'] = [
    { wch: 38 }, { wch: 20 }, { wch: 12 }, { wch: 24 },
    { wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 24 }, { wch: 12 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions')

  // Instructions sheet
  const inst = XLSX.utils.aoa_to_sheet([
    ['SSpay Bulk Clear — Instructions'],
    [''],
    ['1. The utrNumber column is pre-filled where UTR is available'],
    ['2. Fill any empty utrNumber cells manually'],
    ['3. Save the file'],
    ['4. Upload to SSpay → Operator → Transactions → Upload Cleared'],
    [''],
    [`Exported: ${new Date().toLocaleString()}`],
    [`Total rows: ${rows.length}`],
  ])
  inst['!cols'] = [{ wch: 55 }]
  XLSX.utils.book_append_sheet(wb, inst, 'Instructions')

  XLSX.writeFile(wb, `sspay-export-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}