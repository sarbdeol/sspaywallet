import React, { useEffect, useState, useCallback } from "react";
import { Filter, RefreshCw, FileText, FileSpreadsheet } from "lucide-react";
import toast from "react-hot-toast";
import { payoutApi } from "../../services/api";
import { Card, Table, Badge, PageHeader, Spinner } from "../../components/ui";
import { fmt, extractError } from "../../utils/helpers";
import {
  downloadPDFReceipt,
  downloadBulkJobExcel,
  downloadSSpayExport,
} from "../../utils/downloads";

const STATUS_OPTIONS = [
  "",
  "PENDING",
  "SUCCESS",
  "FAILED",
  "EXPIRED",
  "REJECTED",
];

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
  const [detail, setDetail] = useState(null);
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
      if (detail?.order_id === orderId) {
        setDetail((prev) => ({
          ...prev,
          status: result.status,
          utr: result.utr || prev.utr,
        }));
      }
    } catch (e) {
      toast.error(extractError(e));
    } finally {
      setChecking((prev) => ({ ...prev, [orderId]: false }));
    }
  }

  // Fetch all pages matching current filters
  async function fetchAllFiltered() {
    let allItems = [];
    let currentPage = 1;
    let total = 1;
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

  // Export in SSpay bulk-clear format (.xlsx) — fill UTR and upload to SSpay
  async function handleExport() {
    setExporting(true);
    try {
      const items = await fetchAllFiltered();
      await downloadSSpayExport(items);
      toast.success(
        `Exported ${items.length} rows — fill UTR column and upload to SSpay`,
      );
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
              onMouseEnter={(e) => {
                if (!checking[r.order_id])
                  e.currentTarget.style.background = "#f5f3ff";
              }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
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
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            onClick={() => downloadPDFReceipt(row)}
            title="Download Receipt"
            style={{
              fontSize: 12,
              color: "#10b981",
              background: "none",
              border: "1px solid #e4e4e7",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f0fdf4")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <FileText size={12} /> Receipt
          </button>
          <button
            onClick={() => setDetail(row)}
            style={{
              fontSize: 12,
              color: "#0ea5e9",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            Details
          </button>
        </div>
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
            {/* Single Export button — SSpay bulk-clear format */}
            <button
              onClick={handleExport}
              disabled={exporting}
              title="Export as SSpay bulk-clear .xlsx — fill UTR and upload to SSpay"
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
              Export for SSpay
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
          {/* Status filter */}
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

          {/* Date From */}
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

          {/* Date To */}
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

          {/* Apply / Clear */}
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

          {/* Active filter summary */}
          {hasActiveFilters && (
            <div
              style={{
                fontSize: 12,
                color: "#6b7280",
                padding: "4px 10px",
                background: "#f9fafb",
                borderRadius: 6,
                border: "1px solid #e4e4e7",
              }}
            >
              {status && (
                <span style={{ marginRight: 8 }}>
                  Status: <strong>{status}</strong>
                </span>
              )}
              {dateFrom && (
                <span style={{ marginRight: 8 }}>
                  From: <strong>{dateFrom}</strong>
                </span>
              )}
              {dateTo && (
                <span>
                  To: <strong>{dateTo}</strong>
                </span>
              )}
            </div>
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

      {/* Detail Modal */}
      {detail && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.35)",
            backdropFilter: "blur(2px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={(e) => e.target === e.currentTarget && setDetail(null)}
        >
          <div
            className="fade-in"
            style={{
              background: "#fff",
              borderRadius: 16,
              width: "100%",
              maxWidth: 520,
              boxShadow: "0 20px 60px rgba(0,0,0,.18)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "18px 24px",
                borderBottom: "1px solid #f0f0f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 16 }}>
                Transaction Details
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => downloadPDFReceipt(detail)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #bbf7d0",
                    background: "#f0fdf4",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "#065f46",
                    fontFamily: "DM Sans, sans-serif",
                  }}
                >
                  <FileText size={13} /> Receipt
                </button>
                {detail.status === "PENDING" && (
                  <button
                    onClick={() => checkStatus(detail.order_id)}
                    disabled={checking[detail.order_id]}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "1px solid #ddd6fe",
                      background: "#f5f3ff",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "#5b21b6",
                      fontFamily: "DM Sans, sans-serif",
                    }}
                  >
                    {checking[detail.order_id] ? (
                      <Spinner size={12} color="#8b5cf6" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    Check Status
                  </button>
                )}
                <button
                  onClick={() => setDetail(null)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 20,
                    color: "#6b7280",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <div
                style={{
                  marginBottom: 20,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <Badge status={detail.status} />
              </div>
              {[
                ["Order ID", detail.order_id, true],
                ["Transaction ID", detail.transaction_id, true],
                ["Gateway Ref", detail.gateway_ref_id, true],
                ["UTR", detail.utr, true],
                ["Beneficiary", detail.beneficiary_name, false],
                ["Account", detail.account_number, true],
                ["IFSC", detail.ifsc, true],
                ["Bank", detail.bank_name, false],
                ["Amount", fmt.currency(detail.amount, detail.currency), false],
                ["Created", fmt.date(detail.created_at), false],
                ["Updated", fmt.date(detail.updated_at), false],
                ["Failure Reason", detail.failure_reason, false],
              ]
                .filter(([, v]) => v)
                .map(([k, v, mono]) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      padding: "9px 0",
                      borderBottom: "1px solid #f9f9f9",
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        color: "#6b7280",
                        flexShrink: 0,
                        marginRight: 16,
                      }}
                    >
                      {k}
                    </span>
                    <span
                      style={{
                        fontFamily: mono ? "DM Mono, monospace" : "inherit",
                        fontWeight: 500,
                        textAlign: "right",
                        wordBreak: "break-all",
                        color: k === "Failure Reason" ? "#ef4444" : "#111827",
                      }}
                    >
                      {v}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
