import { format, formatDistanceToNow } from 'date-fns'
import { clsx } from 'clsx'

export const cn = clsx

export const fmt = {
  currency: (n, cur = 'INR') =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n ?? 0),

  date: (d) => d ? format(new Date(d), 'dd MMM yyyy, hh:mm a') : '—',

  dateShort: (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—',

  ago: (d) => d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : '—',

  number: (n) => new Intl.NumberFormat('en-IN').format(n ?? 0),
}

export const STATUS_META = {
  SUCCESS:    { label: 'Success',    color: '#10b981', bg: '#ecfdf5', text: '#065f46' },
  FAILED:     { label: 'Failed',     color: '#ef4444', bg: '#fef2f2', text: '#991b1b' },
  PENDING:    { label: 'Pending',    color: '#8b5cf6', bg: '#f5f3ff', text: '#5b21b6' },
  PROCESSING: { label: 'Processing', color: '#0ea5e9', bg: '#f0f9ff', text: '#0c4a6e' },
  EXPIRED:    { label: 'Expired',    color: '#f59e0b', bg: '#fffbeb', text: '#92400e' },
  REJECTED:   { label: 'Rejected',   color: '#6b7280', bg: '#f9fafb', text: '#374151' },
  QUEUED:     { label: 'Queued',     color: '#8b5cf6', bg: '#f5f3ff', text: '#5b21b6' },
  COMPLETED:  { label: 'Completed',  color: '#10b981', bg: '#ecfdf5', text: '#065f46' },
  PARTIAL:    { label: 'Partial',    color: '#f59e0b', bg: '#fffbeb', text: '#92400e' },
}

export function getStatusMeta(status) {
  return STATUS_META[status?.toUpperCase()] || STATUS_META.PENDING
}

export function extractError(err) {
  return err?.response?.data?.detail || err?.message || 'Something went wrong'
}
