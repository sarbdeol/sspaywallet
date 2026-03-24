import React, { useEffect, useState, useCallback, useRef } from "react";
import { RefreshCw, FileSpreadsheet } from "lucide-react";
import toast from "react-hot-toast";
import { payoutApi } from "../../services/api";
import { Card, Table, Badge, PageHeader, Spinner } from "../../components/ui";
import { fmt, extractError } from "../../utils/helpers";
import { downloadSSpayExport } from "../../utils/downloads";

const STATUS_OPTIONS = [
  "",
  "PENDING",
  "SUCCESS",
  "FAILED",
  "EXPIRED",
  "REJECTED",
];

// ── Receipt Image Modal ────────────────────────────────────────────────────────
function ReceiptModal({ txn, onClose }) {
  const receiptRef = useRef(null);
  if (!txn) return null;

  const statusColors = {
    SUCCESS: "#10b981",
    FAILED: "#ef4444",
    PENDING: "#8b5cf6",
    EXPIRED: "#f59e0b",
    REJECTED: "#6b7280",
  };
  const color = statusColors[txn.status] || "#6b7280";

  const handleSaveImage = async () => {
    if (!receiptRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${txn.order_id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Receipt saved!");
    } catch (e) {
      toast.error("Save failed");
    }
  };

  const handleShare = async () => {
    if (!receiptRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      canvas.toBlob(async (blob) => {
        const file = new File([blob], `receipt-${txn.order_id}.png`, {
          type: "image/png",
        });
        if (
          navigator.share &&
          navigator.canShare &&
          navigator.canShare({ files: [file] })
        ) {
          await navigator.share({
            files: [file],
            title: `Receipt ${txn.order_id}`,
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `receipt-${txn.order_id}.png`;
          a.click();
          toast.success("Image saved! Share from gallery.");
        }
      }, "image/png");
    } catch (e) {
      toast.error("Share failed");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,.5)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          width: "100%",
          maxWidth: 400,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
        }}
      >
        {/* Receipt content — captured by html2canvas */}
        <div ref={receiptRef}>
          {/* Header */}
          <div
            style={{
              background: "#1a1a2e",
              padding: "20px 24px",
              borderRadius: "16px 16px 0 0",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{ color: "#fff", fontSize: 20, fontWeight: "bold" }}
                >
                  SSPay
                </div>
                <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 2 }}>
                  Payment Receipt
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    color: "#fff",
                    fontSize: 12,
                    fontFamily: "monospace",
                  }}
                >
                  #{txn.order_id?.slice(-10)}
                </div>
                <div
                  style={{
                    color: color,
                    fontSize: 11,
                    fontWeight: "bold",
                    marginTop: 2,
                  }}
                >
                  {txn.status}
                </div>
              </div>
            </div>
          </div>

          {/* Amount */}
          <div
            style={{
              background: `${color}15`,
              padding: "20px 24px",
              textAlign: "center",
              borderBottom: `1px solid ${color}30`,
            }}
          >
            <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 6 }}>
              Amount
            </div>
            <div style={{ color: "#111827", fontSize: 32, fontWeight: "bold" }}>
              {fmt.currency(txn.amount, txn.currency)}
            </div>
          </div>

          {/* UTR if available */}
          {txn.utr && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                margin: "16px 24px 0",
                borderRadius: 10,
                padding: "10px 14px",
                textAlign: "center",
              }}
            >
              <div style={{ color: "#065f46", fontSize: 11, marginBottom: 4 }}>
                UTR / Reference
              </div>
              <div
                style={{
                  color: "#10b981",
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: "monospace",
                }}
              >
                {txn.utr}
              </div>
            </div>
          )}

          {/* Details */}
          <div style={{ padding: "16px 24px" }}>
            {[
              ["Order ID", txn.order_id],
              ["Transaction ID", txn.transaction_id],
              ["Beneficiary", txn.beneficiary_name],
              ["Account No.", txn.account_number],
              ["IFSC Code", txn.ifsc],
              ["Bank", txn.bank_name],
              ["Date", fmt.date(txn.created_at)],
              txn.failure_reason ? ["Reason", txn.failure_reason] : null,
            ]
              .filter(Boolean)
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    padding: "7px 0",
                    borderBottom: "1px solid #f3f4f6",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{ color: "#9ca3af", flexShrink: 0, marginRight: 12 }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      color: label === "Reason" ? "#ef4444" : "#1f2937",
                      fontWeight: 600,
                      textAlign: "right",
                      wordBreak: "break-all",
                      fontFamily: [
                        "Order ID",
                        "Transaction ID",
                        "Account No.",
                        "IFSC Code",
                        "UTR",
                      ].includes(label)
                        ? "monospace"
                        : "inherit",
                      fontSize: 11,
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "12px 24px 20px",
              textAlign: "center",
              borderTop: "1px solid #f3f4f6",
            }}
          >
            <div style={{ color: "#9ca3af", fontSize: 10 }}>
              System generated receipt
            </div>
            <div style={{ color: "#9ca3af", fontSize: 10 }}>
              © 2026 SSPay Wallet
            </div>
          </div>
        </div>

        {/* Action buttons — NOT captured */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: 16,
            borderTop: "1px solid #f3f4f6",
          }}
        >
          <button
            onClick={handleSaveImage}
            style={{
              flex: 1,
              height: 44,
              background: "#10b981",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "DM Sans, sans-serif",
            }}
          >
            Save Image
          </button>
          <button
            onClick={handleShare}
            style={{
              flex: 1,
              height: 44,
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "DM Sans, sans-serif",
            }}
          >
            Share
          </button>
          <button
            onClick={onClose}
            style={{
              height: 44,
              padding: "0 16px",
              background: "#f3f4f6",
              color: "#6b7280",
              border: "none",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "DM Sans, sans-serif",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Transactions Page ────────────────────────────────────────────────────
export default function Transactions() {
  const [data, setData] = useState({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [checking, setChecking] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(
    (p = page, s = status, df = dateFrom, dt = dateTo) => {
      setLoading(true);
      payoutApi
        .transactions({
          page: p,
          page_size: 20,
          ...(s && { status: s }),
          ...(df && { date_from: df }),
          ...(dt && { date_to: dt }),
        })
        .then((r) => setData(r.data))
        .catch((e) => toast.error(extractError(e)))
        .finally(() => setLoading(false));
    },
    [page, status, dateFrom, dateTo],
  );

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      const hasPending = data.items.some((t) => t.status === "PENDING");
      if (hasPending) load(page, status, dateFrom, dateTo);
      else setAutoRefresh(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, data.items, page, status, dateFrom, dateTo, load]);

  useEffect(() => {
    if (data.items.some((t) => t.status === "PENDING")) setAutoRefresh(true);
  }, [data.items]);

  function applyFilters() {
    setPage(1);
    load(1, status, dateFrom, dateTo);
  }
  function clearFilters() {
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    load(1, "", "", "");
  }
  function onPage(p) {
    setPage(p);
    load(p, status, dateFrom, dateTo);
  }

  async function checkStatus(orderId) {
    setChecking((prev) => ({ ...prev, [orderId]: true }));
    try {
      const { data: result } = await payoutApi.checkStatus(orderId);
      toast.success(
        `Status: ${result.status}${result.utr ? ` · UTR: ${result.utr}` : ""}`,
      );
      setData((prev) => ({
        ...prev,
        items: prev.items.map((t) =>
          t.order_id === orderId
            ? { ...t, status: result.status, utr: result.utr || t.utr }
            : t,
        ),
      }));
    } catch (e) {
      toast.error(extractError(e));
    } finally {
      setChecking((prev) => ({ ...prev, [orderId]: false }));
    }
  }

  async function fetchAllFiltered() {
    let allItems = [],
      currentPage = 1,
      total = 1;
    do {
      const { data: result } = await payoutApi.transactions({
        page: currentPage,
        page_size: 100,
        ...(status && { status }),
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
      });
      allItems = [...allItems, ...result.items];
      total = result.total;
      currentPage++;
    } while (allItems.length < total);
    return allItems;
  }

  async function handleExport() {
    setExporting(true);
    try {
      const items = await fetchAllFiltered();
      await downloadSSpayExport(items);
      toast.success(`Exported ${items.length} rows`);
    } catch (e) {
      toast.error(extractError(e));
    } finally {
      setExporting(false);
    }
  }

  const totalPages = Math.ceil(data.total / data.page_size);
  const hasActiveFilters = status || dateFrom || dateTo;

  const columns = [
    {
      key: "order_id",
      title: "Order ID",
      render: (v) => (
        <span
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: 12,
            color: "#374151",
          }}
        >
          {v}
        </span>
      ),
    },
    {
      key: "beneficiary_name",
      title: "Beneficiary",
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{v}</div>
          <div
            style={{
              fontSize: 12,
              color: "#9ca3af",
              fontFamily: "DM Mono, monospace",
            }}
          >
            {r.account_number}
          </div>
        </div>
      ),
    },
    {
      key: "amount",
      title: "Amount",
      align: "right",
      render: (v, r) => (
        <span style={{ fontFamily: "DM Mono, monospace", fontWeight: 600 }}>
          {fmt.currency(v, r.currency)}
        </span>
      ),
    },
    {
      key: "status",
      title: "Status",
      render: (v, r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Badge status={v} />
          {v === "PENDING" && (
            <button
              onClick={() => checkStatus(r.order_id)}
              disabled={checking[r.order_id]}
              title="Check latest status"
              style={{
                background: "none",
                border: "1px solid #e4e4e7",
                borderRadius: 6,
                cursor: checking[r.order_id] ? "not-allowed" : "pointer",
                padding: "2px 6px",
                display: "flex",
                alignItems: "center",
                color: "#8b5cf6",
                opacity: checking[r.order_id] ? 0.5 : 1,
              }}
            >
              {checking[r.order_id] ? (
                <Spinner size={12} color="#8b5cf6" />
              ) : (
                <RefreshCw size={11} />
              )}
            </button>
          )}
        </div>
      ),
    },
    {
      key: "utr",
      title: "UTR",
      render: (v) =>
        v ? (
          <span
            style={{
              fontFamily: "DM Mono, monospace",
              fontSize: 12,
              color: "#10b981",
            }}
          >
            {v}
          </span>
        ) : (
          <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>
        ),
    },
    {
      key: "created_at",
      title: "Date",
      render: (v) => (
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{fmt.date(v)}</span>
      ),
    },
    {
      key: "id",
      title: "",
      align: "right",
      render: (_, row) => (
        <button
          onClick={() => setReceipt(row)}
          style={{
            fontSize: 12,
            color: "#10b981",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            cursor: "pointer",
            padding: "5px 12px",
            borderRadius: 8,
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 500,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#dcfce7")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#f0fdf4")}
        >
          Receipt
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle={`${fmt.number(data.total)} transactions`}
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {autoRefresh && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "#8b5cf6",
                }}
              >
                <Spinner size={12} color="#8b5cf6" /> Auto-refreshing…
              </div>
            )}
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                borderRadius: 9,
                border: "1px solid #bbf7d0",
                background: "#f0fdf4",
                fontSize: 13,
                cursor: exporting ? "not-allowed" : "pointer",
                fontFamily: "DM Sans, sans-serif",
                color: "#065f46",
                opacity: exporting ? 0.6 : 1,
              }}
            >
              {exporting ? (
                <Spinner size={13} />
              ) : (
                <FileSpreadsheet size={13} />
              )}
              Export
            </button>
            <button
              onClick={() => load(page, status, dateFrom, dateTo)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                borderRadius: 9,
                border: "1px solid #e4e4e7",
                background: "#fff",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
                color: "#374151",
              }}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        }
      />

      {/* Pending banner */}
      {data.items.some((t) => t.status === "PENDING") && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px",
            background: "#f5f3ff",
            border: "1px solid #ddd6fe",
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 13,
            color: "#5b21b6",
          }}
        >
          <Spinner size={14} color="#8b5cf6" />
          Pending transactions — auto-refreshing every 5s.
        </div>
      )}

      {/* Filters */}
      <Card style={{ padding: "16px 20px", marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "#6b7280" }}>
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                border: "1.5px solid #e4e4e7",
                fontSize: 13,
                fontFamily: "DM Sans, sans-serif",
                background: "#fff",
                outline: "none",
                cursor: "pointer",
                minWidth: 130,
              }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "All Statuses"}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "#6b7280" }}>
              Date From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                border: "1.5px solid #e4e4e7",
                fontSize: 13,
                fontFamily: "DM Sans, sans-serif",
                outline: "none",
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "#6b7280" }}>
              Date To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                border: "1.5px solid #e4e4e7",
                fontSize: 13,
                fontFamily: "DM Sans, sans-serif",
                outline: "none",
              }}
            />
          </div>
          <button
            onClick={applyFilters}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              background: "#1a1a2e",
              color: "#fff",
              border: "none",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "DM Sans, sans-serif",
            }}
          >
            Apply
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "#fff",
                color: "#6b7280",
                border: "1px solid #e4e4e7",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
              }}
            >
              Clear
            </button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card style={{ overflow: "hidden", marginBottom: 16 }}>
        <Table
          columns={columns}
          data={data.items}
          loading={loading}
          emptyText="No transactions found"
        />
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          <button
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid #e4e4e7",
              background: "#fff",
              cursor: page > 1 ? "pointer" : "not-allowed",
              opacity: page <= 1 ? 0.4 : 1,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
            }}
          >
            ← Prev
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(
            (p) => (
              <button
                key={p}
                onClick={() => onPage(p)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: "1px solid",
                  borderColor: p === page ? "#1a1a2e" : "#e4e4e7",
                  background: p === page ? "#1a1a2e" : "#fff",
                  color: p === page ? "#fff" : "#374151",
                  cursor: "pointer",
                  fontFamily: "DM Mono, monospace",
                  fontSize: 13,
                }}
              >
                {p}
              </button>
            ),
          )}
          <button
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid #e4e4e7",
              background: "#fff",
              cursor: page < totalPages ? "pointer" : "not-allowed",
              opacity: page >= totalPages ? 0.4 : 1,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
            }}
          >
            Next →
          </button>
        </div>
      )}

      {/* Receipt Modal */}
      {receipt && (
        <ReceiptModal txn={receipt} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}
