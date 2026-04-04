import React, { useEffect, useState } from 'react'
import { Eye, EyeOff, Copy, RefreshCw, Zap, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { payoutApi } from '../../services/api'
import { PageHeader, Card, Spinner } from '../../components/ui'
import { extractError } from '../../utils/helpers'

export default function ApiKeys() {
  const [apiInfo, setApiInfo]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [visible, setVisible]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting]     = useState(false)

  useEffect(() => {
    payoutApi.getApiInfo()
      .then(r => { setApiInfo(r.data); setWebhookUrl(r.data.webhook_url || '') })
      .catch(e => toast.error(extractError(e)))
      .finally(() => setLoading(false))
  }, [])

  async function saveWebhook() {
    setSaving(true)
    try {
      await payoutApi.updateWebhookUrl({ webhook_url: webhookUrl })
      toast.success('Webhook URL saved!')
      setApiInfo(prev => ({ ...prev, webhook_url: webhookUrl }))
    } catch (e) { toast.error(extractError(e)) }
    finally { setSaving(false) }
  }

  async function testWebhook() {
    if (!webhookUrl) { toast.error('Enter a webhook URL first'); return }
    setTesting(true); setTestResult(null)
    try {
      const r = await payoutApi.testWebhook({ webhook_url: webhookUrl })
      setTestResult(r.data)
      toast.success('Test webhook sent!')
    } catch (e) { toast.error(extractError(e)) }
    finally { setTesting(false) }
  }

  function copy(text, label) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied!`)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>

  const maskedKey = apiInfo?.api_key
    ? apiInfo.api_key.slice(0, 12) + '••••••••••••••••••••••••••••' + apiInfo.api_key.slice(-4)
    : '—'

  return (
    <div>
      <PageHeader title="API Keys" subtitle="Use your API key to create payouts programmatically" />

      {/* API Key */}
      <Card style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Live API Key</div>
          <span style={{ background: '#d1fae5', color: '#065f46', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
            {apiInfo?.api_enabled ? 'Active' : 'Disabled'}
          </span>
        </div>

        <div style={{ background: '#f9fafb', border: '1px solid #e4e4e7', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <code style={{ flex: 1, fontFamily: 'DM Mono, monospace', fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {visible ? apiInfo?.api_key : maskedKey}
          </code>
          <button onClick={() => setVisible(!visible)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, padding: '4px 8px', borderRadius: 6 }}>
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
            {visible ? 'Hide' : 'Show'}
          </button>
          <button onClick={() => copy(apiInfo?.api_key, 'API key')}
            style={{ background: 'none', border: '1px solid #e4e4e7', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, padding: '4px 10px', borderRadius: 6 }}>
            <Copy size={13} /> Copy
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#9ca3af' }}>
          ⚠️ Never expose this key in frontend code. Always call from your backend server.
        </div>
      </Card>

      {/* Quick Reference */}
      <Card style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Quick Reference</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Base URL',    value: `${window.location.origin}/api/v1` },
            { label: 'Auth Header', value: 'x-api-key: YOUR_KEY' },
            { label: 'Create Payout', value: 'POST /api/v1/public/payout' },
            { label: 'Check Status', value: 'GET /api/v1/public/payout/status/:order_id' },
            { label: 'Get Balance',  value: 'GET /api/v1/public/balance' },
            { label: 'Transactions', value: 'GET /api/v1/public/transactions' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: '#f9fafb', border: '1px solid #e4e4e7', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
              <code style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#1a1a2e' }}>{value}</code>
            </div>
          ))}
        </div>
      </Card>

      {/* Webhook */}
      <Card style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Webhook URL</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          XPay will POST to this URL when a payout succeeds or fails. Signed with <code style={{ fontFamily: 'DM Mono, monospace', background: '#f4f4f5', padding: '1px 5px', borderRadius: 4 }}>X-XPay-Signature</code> header.
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            placeholder="https://yoursite.com/webhook/xpay"
            style={{ flex: 1, padding: '9px 12px', fontSize: 14, border: '1.5px solid #e4e4e7', borderRadius: 10, outline: 'none', fontFamily: 'DM Sans, sans-serif' }}
            onFocus={e => e.target.style.borderColor = '#0ea5e9'}
            onBlur={e => e.target.style.borderColor = '#e4e4e7'}
          />
          <button onClick={saveWebhook} disabled={saving}
            style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? .7 : 1 }}>
            {saving ? <Spinner size={13} color="#fff" /> : <CheckCircle size={14} />} Save
          </button>
          <button onClick={testWebhook} disabled={testing}
            style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
            {testing ? <Spinner size={13} /> : <Zap size={14} color="#f59e0b" />} Test
          </button>
        </div>

        {testResult && (
          <div style={{ background: testResult.success ? '#f0fdf4' : '#fef2f2', border: `1px solid ${testResult.success ? '#86efac' : '#fca5a5'}`, borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
            {testResult.success
              ? `✅ Delivered — HTTP ${testResult.http_status}`
              : `❌ Failed — ${testResult.message}`}
          </div>
        )}

        {/* Webhook verification code */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 10 }}>Verify webhook signature (Node.js)</div>
          <div style={{ background: '#1a1a2e', borderRadius: 10, padding: '14px 16px', overflowX: 'auto' }}>
            <pre style={{ margin: 0, fontSize: 12, fontFamily: 'DM Mono, monospace', color: '#a5b4fc', lineHeight: 1.6 }}>
{`const crypto = require('crypto');

app.post('/webhook/xpay', (req, res) => {
  const signature = req.headers['x-xpay-signature'];
  const expected  = crypto
    .createHmac('sha256', process.env.XPAY_API_KEY)
    .update(JSON.stringify(req.body, Object.keys(req.body).sort()))
    .digest('hex');

  if (signature !== expected) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event, order_id, status, amount, utr } = req.body;
  if (event === 'payout.success') {
    // ✅ payout confirmed — update your DB
  } else if (event === 'payout.failed') {
    // ❌ payout failed — handle accordingly
  }

  res.json({ received: true });
});`}
            </pre>
          </div>
        </div>
      </Card>

      {/* Integration example */}
      <Card style={{ padding: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Integration Example (Node.js)</div>
        <div style={{ background: '#1a1a2e', borderRadius: 10, padding: '14px 16px', overflowX: 'auto' }}>
          <pre style={{ margin: 0, fontSize: 12, fontFamily: 'DM Mono, monospace', color: '#a5b4fc', lineHeight: 1.6 }}>
{`const axios = require('axios');

const XPAY_API_KEY = process.env.XPAY_API_KEY;
const BASE = '${window.location.origin}/api/v1';

// Create a payout
const res = await axios.post(\`\${BASE}/public/payout\`, {
  amount: 10000,
  currency: 'INR',
  beneficiary: {
    name: 'John Doe',
    account_number: '1234567890',
    ifsc: 'HDFC0001234',
    bank_name: 'HDFC Bank'
  },
  webhook_url: 'https://yoursite.com/webhook/xpay' // optional override
}, {
  headers: { 'x-api-key': XPAY_API_KEY }
});

console.log(res.data.order_id);  // save this
console.log(res.data.status);    // PENDING

// Check status later
const status = await axios.get(
  \`\${BASE}/public/payout/status/\${order_id}\`,
  { headers: { 'x-api-key': XPAY_API_KEY } }
);`}
          </pre>
        </div>
      </Card>
    </div>
  )
}
