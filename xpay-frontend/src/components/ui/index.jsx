import React from 'react'
import { cn, getStatusMeta } from '../../utils/helpers'

/* ── Button ──────────────────────────────────────────────────────────────── */
export function Button({ children, variant = 'primary', size = 'md', loading, className, ...props }) {
  const base = 'inline-flex items-center gap-2 font-medium rounded-[10px] transition-all cursor-pointer border-0 outline-none'
  const variants = {
    primary:  'bg-[#1a1a2e] text-white hover:bg-[#0f0f1f] active:scale-[.98]',
    secondary:'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 active:scale-[.98]',
    danger:   'bg-red-500 text-white hover:bg-red-600 active:scale-[.98]',
    ghost:    'bg-transparent text-gray-600 hover:bg-gray-100 active:scale-[.98]',
    accent:   'bg-sky-500 text-white hover:bg-sky-600 active:scale-[.98]',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-[13px]',
    md: 'px-4 py-2 text-[14px]',
    lg: 'px-5 py-2.5 text-[15px]',
  }
  return (
    <button
      className={cn(base, variants[variant], sizes[size], loading && 'opacity-60 pointer-events-none', className)}
      style={{ fontFamily: 'DM Sans, sans-serif' }}
      {...props}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  )
}

/* ── Input ───────────────────────────────────────────────────────────────── */
export function Input({ label, error, className, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{label}</label>}
      <input
        style={{
          width: '100%', padding: '8px 12px', fontSize: 14,
          border: `1.5px solid ${error ? '#ef4444' : '#e4e4e7'}`,
          borderRadius: 10, outline: 'none', background: '#fff',
          fontFamily: 'DM Sans, sans-serif', color: '#1f2937',
          transition: 'border-color .15s',
        }}
        onFocus={e => e.target.style.borderColor = error ? '#ef4444' : '#0ea5e9'}
        onBlur={e  => e.target.style.borderColor = error ? '#ef4444' : '#e4e4e7'}
        className={className}
        {...props}
      />
      {error && <span style={{ fontSize: 12, color: '#ef4444' }}>{error}</span>}
    </div>
  )
}

/* ── Select ──────────────────────────────────────────────────────────────── */
export function Select({ label, error, children, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{label}</label>}
      <select
        style={{
          width: '100%', padding: '8px 12px', fontSize: 14,
          border: `1.5px solid ${error ? '#ef4444' : '#e4e4e7'}`,
          borderRadius: 10, outline: 'none', background: '#fff',
          fontFamily: 'DM Sans, sans-serif', color: '#1f2937', cursor: 'pointer',
        }}
        {...props}
      >
        {children}
      </select>
      {error && <span style={{ fontSize: 12, color: '#ef4444' }}>{error}</span>}
    </div>
  )
}

/* ── Badge ───────────────────────────────────────────────────────────────── */
export function Badge({ status, label }) {
  const meta = getStatusMeta(status)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 99, fontSize: 12, fontWeight: 500,
      background: meta.bg, color: meta.text,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
      {label || meta.label}
    </span>
  )
}

/* ── Card ────────────────────────────────────────────────────────────────── */
export function Card({ children, className, style, ...props }) {
  return (
    <div
      style={{
        background: '#fff', borderRadius: 14,
        border: '1px solid #e4e4e7',
        boxShadow: '0 1px 4px rgba(0,0,0,.05)',
        ...style,
      }}
      className={className}
      {...props}
    >
      {children}
    </div>
  )
}

/* ── Spinner ─────────────────────────────────────────────────────────────── */
export function Spinner({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: 'spin .7s linear infinite' }}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeOpacity=".2" strokeWidth="2.5" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/* ── Modal ───────────────────────────────────────────────────────────────── */
export function Modal({ open, onClose, title, children, width = 480 }) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div className="fade-in" style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: width,
        boxShadow: '0 20px 60px rgba(0,0,0,.18)', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid #f0f0f0',
        }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{title}</span>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', lineHeight: 1, fontSize: 20 }}>
            ✕
          </button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  )
}

/* ── Table ───────────────────────────────────────────────────────────────── */
export function Table({ columns, data, loading, emptyText = 'No records found' }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
            {columns.map((col) => (
              <th key={col.key}
                style={{
                  padding: '10px 16px', textAlign: col.align || 'left',
                  fontWeight: 500, color: '#6b7280', fontSize: 12,
                  textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap',
                }}>
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columns.length} style={{ padding: 40, textAlign: 'center' }}>
              <Spinner />
            </td></tr>
          ) : data?.length === 0 ? (
            <tr><td colSpan={columns.length}
              style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
              {emptyText}
            </td></tr>
          ) : (
            data?.map((row, i) => (
              <tr key={row.id || i}
                style={{ borderBottom: '1px solid #f9f9f9', transition: 'background .12s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {columns.map((col) => (
                  <td key={col.key}
                    style={{ padding: '12px 16px', textAlign: col.align || 'left', whiteSpace: 'nowrap' }}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ── Stat Card ───────────────────────────────────────────────────────────── */
export function StatCard({ label, value, sub, icon: Icon, color = '#0ea5e9' }) {
  return (
    <Card style={{ padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {Icon && <Icon size={20} color={color} />}
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>{sub}</div>}
      </div>
    </Card>
  )
}

/* ── Empty State ─────────────────────────────────────────────────────────── */
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div style={{ padding: '60px 24px', textAlign: 'center' }}>
      {Icon && <Icon size={40} color="#d1d5db" style={{ marginBottom: 16 }} />}
      <div style={{ fontWeight: 600, fontSize: 16, color: '#374151', marginBottom: 6 }}>{title}</div>
      {description && <div style={{ color: '#9ca3af', fontSize: 14, marginBottom: 20 }}>{description}</div>}
      {action}
    </div>
  )
}

/* ── Page Header ─────────────────────────────────────────────────────────── */
export function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>{title}</h1>
        {subtitle && <p style={{ color: '#6b7280', fontSize: 14, marginTop: 3 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
