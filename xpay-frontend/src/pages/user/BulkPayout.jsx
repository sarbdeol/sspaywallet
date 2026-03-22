import React, { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileSpreadsheet, RefreshCw, Clock, ChevronRight, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { payoutApi } from '../../services/api'
import { Card, Badge, Button, PageHeader, Spinner } from '../../components/ui'
import { fmt, extractError } from '../../utils/helpers'

const REQUIRED_FIELDS = ['beneficiary_name', 'account_number', 'ifsc', 'amount']
const OPTIONAL_FIELDS = ['bank_name', 'currency']
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]

const FIELD_LABELS = {
  beneficiary_name: 'Beneficiary Name',
  account_number:   'Account Number',
  ifsc:             'IFSC Code',
  amount:           'Amount',
  bank_name:        'Bank Name',
  currency:         'Currency',
}

// ── Job Card ──────────────────────────────────────────────────────────────────
function JobCard({ job, onRefresh }) {
  const progress = job.total_rows > 0
    ? Math.round(((job.success_count + job.failed_count + job.skipped_count) / job.total_rows) * 100)
    : 0
  const isRunning = ['QUEUED', 'PROCESSING'].includes(job.status)

  return (
    <Card style={{ padding: 20, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{job.filename || 'Bulk Job'}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, fontFamily: 'DM Mono, monospace' }}>
            {job.id.slice(0, 16)}…
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge status={job.status} />
          {isRunning && (
            <button onClick={() => onRefresh(job.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
              <RefreshCw size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{ height: 4, background: '#f0f0f0', borderRadius: 99, marginBottom: 14, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${progress}%`, borderRadius: 99, transition: 'width .4s',
          background: job.status === 'COMPLETED' ? '#10b981' : job.status === 'FAILED' ? '#ef4444' : '#0ea5e9',
        }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {[
          { label: 'Total',    value: job.total_rows,    color: '#374151' },
          { label: 'Success',  value: job.success_count, color: '#10b981' },
          { label: 'Failed',   value: job.failed_count,  color: '#ef4444' },
          { label: 'Rejected', value: job.skipped_count, color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center', padding: '8px 0', background: '#fafafa', borderRadius: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {job.error_log?.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', userSelect: 'none' }}>
            {job.error_log.length} row error(s)
          </summary>
          <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto', background: '#fef2f2', borderRadius: 8, padding: 10 }}>
            {job.error_log.map((e, i) => (
              <div key={i} style={{ fontSize: 12, padding: '4px 0', borderBottom: i < job.error_log.length - 1 ? '1px solid #fee2e2' : 'none', color: '#991b1b' }}>
                Row {e.row}: {e.beneficiary_name} — {e.reason || e.status}
              </div>
            ))}
          </div>
        </details>
      )}

      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>
        {fmt.date(job.created_at)}
        {job.total_amount > 0 && <> · <span style={{ fontFamily: 'DM Mono, monospace' }}>{fmt.currency(job.total_amount)}</span></>}
      </div>
    </Card>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BulkPayout() {
  const [step, setStep]           = useState(1)   // 1=upload, 2=map columns, 3=jobs
  const [file, setFile]           = useState(null)
  const [headers, setHeaders]     = useState([])
  const [mapping, setMapping]     = useState({})  // { excelCol: ourField }
  const [fileData, setFileData]   = useState(null) // base64 from server
  const [filename, setFilename]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [jobs, setJobs]           = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [balance, setBalance]     = useState(null)

  const loadJobs = () => {
    payoutApi.bulkJobs({ limit: 20 })
      .then(r => setJobs(r.data))
      .catch(() => {})
      .finally(() => setLoadingJobs(false))
  }

  useEffect(() => {
    payoutApi.balance().then(r => setBalance(r.data)).catch(() => {})
    loadJobs()
  }, [])

  const onDrop = useCallback((accepted) => {
    if (accepted[0]) setFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: false,
    maxSize: 5 * 1024 * 1024,
  })

  // Step 1 → Step 2: read headers
  async function handleReadHeaders() {
    if (!file) return toast.error('Select a file first')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await payoutApi.bulkHeaders(fd)

      setHeaders(data.headers)
      setFileData(data.file_data)
      setFilename(data.filename)

      // Auto-map obvious matches (case-insensitive)
      const autoMap = {}
      const fieldAliases = {
        beneficiary_name: ['name', 'beneficiary', 'beneficiary_name', 'bene name', 'beneficiary name', 'account name', 'account holder'],
        account_number:   ['account', 'account_number', 'account number', 'acc no', 'acc number', 'account no'],
        ifsc:             ['ifsc', 'ifsc_code', 'ifsc code'],
        amount:           ['amount', 'amt', 'transfer amount', 'payout amount'],
        bank_name:        ['bank', 'bank_name', 'bank name'],
        currency:         ['currency', 'cur', 'currency code'],
      }

      data.headers.forEach(col => {
        const lower = col.toLowerCase().trim()
        for (const [field, aliases] of Object.entries(fieldAliases)) {
          if (aliases.includes(lower) && !Object.values(autoMap).includes(field)) {
            autoMap[col] = field
            break
          }
        }
      })

      setMapping(autoMap)
      setStep(2)
    } catch (e) {
      toast.error(extractError(e))
    } finally {
      setLoading(false)
    }
  }

  // Step 2 → Submit with mapping
  async function handleSubmit() {
    // Validate all required fields are mapped
    const mappedFields = Object.values(mapping)
    const missing = REQUIRED_FIELDS.filter(f => !mappedFields.includes(f))
    if (missing.length > 0) {
      toast.error(`Please map: ${missing.map(f => FIELD_LABELS[f]).join(', ')}`)
      return
    }

    setSubmitting(true)
    try {
      // Reconstruct file from base64
      const byteString = atob(fileData)
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
      const blob = new Blob([ab])
      const reconstructedFile = new File([blob], filename)

      const fd = new FormData()
      fd.append('file', reconstructedFile)
      fd.append('mapping', JSON.stringify(mapping))

      await payoutApi.bulkUpload(fd)
      toast.success('Bulk job queued!')
      setStep(1)
      setFile(null)
      setMapping({})
      setFileData(null)
      loadJobs()
      payoutApi.balance().then(r => setBalance(r.data)).catch(() => {})
    } catch (e) {
      toast.error(extractError(e))
    } finally {
      setSubmitting(false)
    }
  }

  async function refreshJob(id) {
    try {
      const { data } = await payoutApi.bulkJobStatus(id)
      setJobs(prev => prev.map(j => j.id === id ? data : j))
    } catch (e) {
      toast.error(extractError(e))
    }
  }

  // Check if all required fields mapped
  const mappedFields    = Object.values(mapping)
  const unmappedRequired = REQUIRED_FIELDS.filter(f => !mappedFields.includes(f))
  const isReadyToSubmit  = unmappedRequired.length === 0

  return (
    <div>
      <PageHeader title="Bulk Payout" subtitle="Upload any Excel — map your columns to our fields" />

      {balance && (
        <div style={{ display: 'inline-flex', gap: 8, padding: '6px 14px', borderRadius: 99, background: '#f0f9ff', border: '1px solid #bae6fd', marginBottom: 24, fontSize: 13 }}>
          <span style={{ color: '#6b7280' }}>Available:</span>
          <span style={{ fontWeight: 600, color: '#0c4a6e', fontFamily: 'DM Mono, monospace' }}>{fmt.currency(balance.balance)}</span>
        </div>
      )}

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
        {[
          { n: 1, label: 'Upload File' },
          { n: 2, label: 'Map Columns' },
          { n: 3, label: 'Done' },
        ].map(({ n, label }, i) => (
          <React.Fragment key={n}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600,
                background: step >= n ? '#1a1a2e' : '#f4f4f5',
                color: step >= n ? '#fff' : '#9ca3af',
              }}>
                {step > n ? <CheckCircle size={14} /> : n}
              </div>
              <span style={{ fontSize: 13, fontWeight: step === n ? 600 : 400, color: step === n ? '#111827' : '#9ca3af' }}>
                {label}
              </span>
            </div>
            {i < 2 && <div style={{ flex: 1, height: 1, background: '#e4e4e7', margin: '0 12px', maxWidth: 60 }} />}
          </React.Fragment>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>

        {/* Left panel — step 1 or step 2 */}
        <div>
          {step === 1 ? (
            <Card style={{ padding: 24 }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Upload Your Excel</div>

              <div {...getRootProps()} style={{
                border: `2px dashed ${isDragActive ? '#0ea5e9' : file ? '#10b981' : '#e4e4e7'}`,
                borderRadius: 12, padding: '36px 24px', textAlign: 'center', cursor: 'pointer',
                background: isDragActive ? '#f0f9ff' : file ? '#f0fdf4' : '#fafafa',
                transition: 'all .2s',
              }}>
                <input {...getInputProps()} />
                {file ? (
                  <div>
                    <FileSpreadsheet size={36} color="#10b981" style={{ marginBottom: 10 }} />
                    <div style={{ fontWeight: 500, fontSize: 14, color: '#111827' }}>{file.name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                ) : (
                  <div>
                    <Upload size={32} color="#9ca3af" style={{ marginBottom: 10 }} />
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>
                      {isDragActive ? 'Drop your file here' : 'Drag & drop or click to upload'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                      Any .xlsx, .xls, .csv — any column names
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                {file && (
                  <Button variant="secondary" onClick={() => setFile(null)} style={{ flex: 1, justifyContent: 'center' }}>
                    Remove
                  </Button>
                )}
                <Button onClick={handleReadHeaders} loading={loading} disabled={!file}
                  style={{ flex: 1, justifyContent: 'center' }}>
                  Next: Map Columns <ChevronRight size={15} />
                </Button>
              </div>
            </Card>
          ) : (
            <Card style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Map Your Columns</div>
                <button onClick={() => { setStep(1); setFile(null); setMapping({}) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9ca3af' }}>
                  ← Change file
                </button>
              </div>

              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
                Match each of your Excel columns to the correct payout field.
              </div>

              {/* File info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f9fafb', borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
                <FileSpreadsheet size={14} color="#6b7280" />
                <span style={{ color: '#374151', fontWeight: 500 }}>{filename}</span>
                <span style={{ color: '#9ca3af' }}>· {headers.length} columns detected</span>
              </div>

              {/* Mapping rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ALL_FIELDS.map(field => {
                  const isRequired   = REQUIRED_FIELDS.includes(field)
                  const mappedToCol  = Object.entries(mapping).find(([, f]) => f === field)?.[0]
                  const isMapped     = !!mappedToCol

                  return (
                    <div key={field} style={{
                      display: 'grid', gridTemplateColumns: '1fr 32px 1fr',
                      alignItems: 'center', gap: 10,
                      padding: '10px 14px', borderRadius: 10,
                      background: isMapped ? '#f0fdf4' : isRequired ? '#fef9f0' : '#fafafa',
                      border: `1px solid ${isMapped ? '#bbf7d0' : isRequired ? '#fde68a' : '#e4e4e7'}`,
                    }}>
                      {/* Our field */}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                          {FIELD_LABELS[field]}
                          {isRequired && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'DM Mono, monospace' }}>{field}</div>
                      </div>

                      {/* Arrow */}
                      <div style={{ textAlign: 'center', color: isMapped ? '#10b981' : '#d1d5db', fontSize: 16 }}>
                        {isMapped ? '✓' : '←'}
                      </div>

                      {/* Excel column dropdown */}
                      <select
                        value={mappedToCol || ''}
                        onChange={e => {
                          const col = e.target.value
                          setMapping(prev => {
                            const next = { ...prev }
                            // Remove previous mapping to this field
                            Object.keys(next).forEach(k => { if (next[k] === field) delete next[k] })
                            // Remove previous mapping of this col
                            if (col) {
                              Object.keys(next).forEach(k => { if (k === col) delete next[k] })
                              next[col] = field
                            }
                            return next
                          })
                        }}
                        style={{
                          padding: '7px 10px', borderRadius: 8, fontSize: 13,
                          border: `1.5px solid ${isMapped ? '#86efac' : '#e4e4e7'}`,
                          background: '#fff', fontFamily: 'DM Sans, sans-serif',
                          outline: 'none', cursor: 'pointer', color: '#374151',
                        }}
                      >
                        <option value="">— not mapped —</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>

              {/* Validation summary */}
              {!isReadyToSubmit && (
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fef9f0', border: '1px solid #fde68a', borderRadius: 10, fontSize: 13, color: '#92400e' }}>
                  <AlertCircle size={14} />
                  Still need to map: {unmappedRequired.map(f => FIELD_LABELS[f]).join(', ')}
                </div>
              )}

              {isReadyToSubmit && (
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 13, color: '#065f46' }}>
                  <CheckCircle size={14} />
                  All required fields mapped — ready to submit!
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <Button variant="secondary" onClick={() => setStep(1)} style={{ flex: 1, justifyContent: 'center' }}>
                  Back
                </Button>
                <Button onClick={handleSubmit} loading={submitting} disabled={!isReadyToSubmit}
                  style={{ flex: 1, justifyContent: 'center' }}>
                  <Upload size={15} /> Submit Payout
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Right panel — recent jobs */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Recent Jobs</div>
            <button onClick={loadJobs}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {loadingJobs ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
          ) : jobs.length === 0 ? (
            <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
              <Clock size={36} color="#d1d5db" style={{ marginBottom: 12 }} />
              <div style={{ color: '#9ca3af', fontSize: 14 }}>No bulk jobs yet</div>
            </Card>
          ) : (
            jobs.map(j => <JobCard key={j.id} job={j} onRefresh={refreshJob} />)
          )}
        </div>
      </div>
    </div>
  )
}