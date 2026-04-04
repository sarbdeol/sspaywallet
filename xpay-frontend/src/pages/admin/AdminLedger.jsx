import React, { useEffect, useState, useCallback } from "react";
import {
  FileText, Download, ChevronLeft, ChevronRight,
  Search, X, RefreshCw, BookOpen, Copy,
} from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { adminApi } from "../../services/api";
import { PageHeader, Spinner } from "../../components/ui";
import { fmt, extractError } from "../../utils/helpers";

const STATUS_COLORS = {
  SUCCESS: "#10b981", FAILED: "#ef4444",
  PENDING: "#f59e0b", EXPIRED: "#6b7280",
};

function statusBadge(s) {
  const color = STATUS_COLORS[s] || "#6b7280";
  return (
    <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:11, fontWeight:600, letterSpacing:0.3, background:color+"18", color }}>
      {s}
    </span>
  );
}

function fmtINR(v) {
  return "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function copyText(text, label) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied!`);
}

export default function AdminLedger() {
  const [users, setUsers]             = useState([]);
  const [selUser, setSelUser]         = useState(null);
  const [wallet, setWallet]           = useState(null);
  const [txns, setTxns]               = useState([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const PAGE_SIZE = 20;

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingTxns, setLoadingTxns]   = useState(false);
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");
  const [statusF, setStatusF]           = useState("");
  const [search, setSearch]             = useState("");
  const [selTxn, setSelTxn]             = useState(null);

  useEffect(() => {
    adminApi.listUsers({ limit: 200 })
      .then((r) => setUsers(r.data))
      .catch((e) => toast.error(extractError(e)))
      .finally(() => setLoadingUsers(false));
  }, []);

  const loadTxns = useCallback(async (uid, pg = 1) => {
    if (!uid) return;
    setLoadingTxns(true);
    try {
      const [txnRes, walletRes] = await Promise.all([
        adminApi.userLedger(uid, {
          page: pg, page_size: PAGE_SIZE,
          ...(statusF  && { status: statusF }),
          ...(dateFrom && { date_from: dateFrom }),
          ...(dateTo   && { date_to: dateTo }),
        }),
        adminApi.getUserWallet(uid),
      ]);
      setTxns(txnRes.data.items ?? txnRes.data);
      setTotal(txnRes.data.total ?? txnRes.data.length);
      setWallet(walletRes.data);
    } catch (e) {
      toast.error(extractError(e));
    } finally {
      setLoadingTxns(false);
    }
  }, [statusF, dateFrom, dateTo]);

  function selectUser(user) { setSelUser(user); setPage(1); setTxns([]); setWallet(null); loadTxns(user.id, 1); }
  function applyFilters()   { setPage(1); loadTxns(selUser.id, 1); }
  function clearFilters()   { setDateFrom(""); setDateTo(""); setStatusF(""); setPage(1); loadTxns(selUser.id, 1); }

  const totalPages    = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  const successTxns = txns.filter((t) => t.status === "SUCCESS");
  const successAmt  = successTxns.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const totalAmt    = txns.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const pendingCnt  = txns.filter((t) => t.status === "PENDING").length;
  const failedCnt   = txns.filter((t) => t.status === "FAILED").length;

  // ── PDF Export ──────────────────────────────────────────────────────────────
  function exportPDF() {
    if (!txns.length) { toast.error("No transactions to export"); return; }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();

    // Dark header
    doc.setFillColor(26, 26, 46);
    doc.rect(0, 0, W, 22, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text("SSPay Wallet — User Ledger", 14, 14);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, W - 14, 14, { align: "right" });

    // Info block
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("User:", 14, 30);
    doc.text("Wallet Balance:", 100, 30);
    doc.text("Success Total:", 100, 37);
    if (dateFrom || dateTo) doc.text("Period:", 14, 37);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 70, 70);
    doc.text(`${selUser.full_name || selUser.username}  (${selUser.email})`, 28, 30);
    doc.text(`Rs. ${parseFloat(wallet?.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 132, 30);
    doc.text(`Rs. ${successAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 132, 37);
    if (dateFrom || dateTo) doc.text(`${dateFrom || "—"}  to  ${dateTo || "—"}`, 28, 37);

    doc.setDrawColor(220, 220, 220);
    doc.line(14, 41, W - 14, 41);

    autoTable(doc, {
      startY: 45,
      margin: { left: 14, right: 14 },
      head: [["#", "Date & Time", "Order ID", "Beneficiary", "Account No", "IFSC", "Bank", "Amount (Rs.)", "Status", "UTR"]],
      body: txns.map((t, i) => [
        i + 1 + (page - 1) * PAGE_SIZE,
        fmt.date(t.created_at),
        t.order_id,
        t.beneficiary_name,
        t.account_number,
        t.ifsc,
        t.bank_name || "—",
        parseFloat(t.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
        t.status,
        t.utr || "—",
      ]),
      foot: [["", "", "", "", "", "", "", "", "Success Total:", successAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })]],
      styles:      { fontSize: 8, cellPadding: 3, font: "helvetica", overflow: "linebreak", textColor: [40, 40, 40] },
      headStyles:  { fillColor: [26, 26, 46], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      footStyles:  { fillColor: [232, 248, 240], textColor: [16, 100, 60], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8,  halign: "center" },
        1: { cellWidth: 28 },
        2: { cellWidth: 40 },
        3: { cellWidth: 34 },
        4: { cellWidth: 26 },
        5: { cellWidth: 22 },
        6: { cellWidth: 30 },
        7: { cellWidth: 26, halign: "right" },
        8: { cellWidth: 18, halign: "center" },
        9: { cellWidth: 26 },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 8) {
          const v = data.cell.raw;
          if (v === "SUCCESS") { data.cell.styles.textColor = [16, 120, 60]; data.cell.styles.fontStyle = "bold"; }
          else if (v === "FAILED")  { data.cell.styles.textColor = [180, 30, 30]; data.cell.styles.fontStyle = "bold"; }
          else if (v === "PENDING") { data.cell.styles.textColor = [160, 100, 0]; }
        }
      },
    });

    // Page footer
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(160, 160, 160);
      doc.text(`SSPay Wallet  |  Page ${i} of ${pages}  |  Confidential`, W / 2, doc.internal.pageSize.getHeight() - 5, { align: "center" });
    }

    doc.save(`sspay_ledger_${selUser.username}_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF downloaded");
  }

  // ── Excel Export ─────────────────────────────────────────────────────────────
  function exportExcel() {
    if (!txns.length) { toast.error("No transactions to export"); return; }
    const wb = XLSX.utils.book_new();

    // Transactions only — no email/user info block
    const headers = ["#", "Date", "Order ID", "Beneficiary", "Account No", "IFSC", "Bank", "Amount (Rs.)", "Status", "UTR"];
    const rows = txns.map((t, i) => [
      i + 1 + (page - 1) * PAGE_SIZE,
      fmt.date(t.created_at),
      t.order_id,
      t.beneficiary_name,
      t.account_number,
      t.ifsc,
      t.bank_name || "—",
      parseFloat(t.amount),
      t.status,
      t.utr || "—",
    ]);

    // Total rows at bottom
    const blankRow  = ["", "", "", "", "", "", "", "", "", ""];
    const totalRow  = ["", "", "", "", "", "", "Total (all)",    totalAmt,   "", ""];
    const successRow= ["", "", "", "", "", "", "Success Total",  successAmt, "", ""];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows, blankRow, totalRow, successRow]);

    // Column widths
    ws["!cols"] = [6, 20, 36, 28, 18, 14, 24, 16, 12, 22].map((w) => ({ wch: w }));

    // Bold the total rows
    const totalRowIdx  = rows.length + 2; // 1-indexed + header + blank
    const successRowIdx= rows.length + 3;
    ["G","H"].forEach((col) => {
      [`${col}${totalRowIdx}`, `${col}${successRowIdx}`].forEach((cell) => {
        if (ws[cell]) ws[cell].s = { font: { bold: true } };
      });
    });

    XLSX.utils.book_append_sheet(wb, ws, `${selUser.username} Ledger`);
    XLSX.writeFile(wb, `sspay_ledger_${selUser.username}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel downloaded");
  }

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", fontFamily: "DM Sans, sans-serif" }}>

      {/* LEFT: User list */}
      <div style={{ width: 260, flexShrink: 0, background: "#fff", borderRadius: 14, border: "1px solid #e4e4e7", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Users</div>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
            <input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "7px 10px 7px 28px", fontSize: 13, border: "1px solid #e4e4e7", borderRadius: 8, outline: "none", fontFamily: "DM Sans, sans-serif", boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
          {loadingUsers ? (
            <div style={{ padding: 24, display: "flex", justifyContent: "center" }}><Spinner /></div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: "#9ca3af", textAlign: "center" }}>No users found</div>
          ) : filteredUsers.map((u) => (
            <button key={u.id} onClick={() => selectUser(u)}
              style={{ width: "100%", textAlign: "left", padding: "11px 16px", border: "none", borderBottom: "1px solid #f9fafb",
                background: selUser?.id === u.id ? "#f0f9ff" : "#fff", cursor: "pointer", transition: "background .12s",
                borderLeft: selUser?.id === u.id ? "3px solid #0ea5e9" : "3px solid transparent" }}
              onMouseEnter={(e) => { if (selUser?.id !== u.id) e.currentTarget.style.background = "#f9fafb"; }}
              onMouseLeave={(e) => { if (selUser?.id !== u.id) e.currentTarget.style.background = "#fff"; }}
            >
              <div style={{ fontWeight: 500, fontSize: 13, color: "#111827" }}>{u.full_name || u.username}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>@{u.username}</div>
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT: Ledger */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <PageHeader
          title={selUser ? `Ledger — ${selUser.full_name || selUser.username}` : "Ledger"}
          subtitle={selUser ? selUser.email : "Select a user to view their ledger"}
          action={selUser && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={exportExcel}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "1px solid #e4e4e7", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#374151", fontFamily: "DM Sans, sans-serif" }}>
                <Download size={14} color="#10b981" /> Excel
              </button>
              <button onClick={exportPDF}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "1px solid #e4e4e7", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#374151", fontFamily: "DM Sans, sans-serif" }}>
                <FileText size={14} color="#ef4444" /> PDF
              </button>
            </div>
          )}
        />

        {!selUser ? (
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e4e4e7", padding: 60, textAlign: "center" }}>
            <BookOpen size={40} color="#e4e4e7" style={{ marginBottom: 14 }} />
            <div style={{ fontWeight: 600, fontSize: 15, color: "#374151", marginBottom: 6 }}>Select a user</div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>Choose a user from the left panel to view their ledger</div>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
              {[
                { label: "Wallet Balance", value: fmtINR(wallet?.balance), color: "#0ea5e9" },
                { label: "Success Total",  value: fmtINR(successAmt),      color: "#10b981" },
                { label: "Total (all)",    value: fmtINR(totalAmt),        color: "#8b5cf6" },
                { label: "Pending",        value: pendingCnt + " txns",    color: "#f59e0b" },
                { label: "Failed",         value: failedCnt  + " txns",    color: "#ef4444" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e4e4e7", padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 5 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e4e4e7", padding: "14px 18px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              {[{ label: "From", val: dateFrom, set: setDateFrom }, { label: "To", val: dateTo, set: setDateTo }].map(({ label, val, set }) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>{label}</div>
                  <input type="date" value={val} onChange={(e) => set(e.target.value)}
                    style={{ height: 34, padding: "0 10px", fontSize: 13, borderRadius: 8, border: "1px solid #e4e4e7", outline: "none", fontFamily: "DM Sans, sans-serif" }} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Status</div>
                <select value={statusF} onChange={(e) => setStatusF(e.target.value)}
                  style={{ height: 34, padding: "0 10px", fontSize: 13, borderRadius: 8, border: "1px solid #e4e4e7", outline: "none", fontFamily: "DM Sans, sans-serif", background: "#fff" }}>
                  <option value="">All</option>
                  {["SUCCESS", "PENDING", "FAILED", "EXPIRED"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={applyFilters}
                style={{ height: 34, padding: "0 16px", borderRadius: 8, border: "none", background: "#1a1a2e", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "DM Sans, sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
                <RefreshCw size={13} /> Apply
              </button>
              {(dateFrom || dateTo || statusF) && (
                <button onClick={clearFilters}
                  style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid #e4e4e7", background: "#fff", cursor: "pointer", fontSize: 13, color: "#6b7280", fontFamily: "DM Sans, sans-serif", display: "flex", alignItems: "center", gap: 5 }}>
                  <X size={13} /> Clear
                </button>
              )}
            </div>

            {/* Table */}
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e4e4e7", overflow: "hidden" }}>
              {loadingTxns ? (
                <div style={{ padding: 60, display: "flex", justifyContent: "center" }}><Spinner size={28} /></div>
              ) : txns.length === 0 ? (
                <div style={{ padding: 60, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>No transactions found</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
                    <thead>
                      <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e4e4e7" }}>
                        {[
                          { label: "#",           w: 44  },
                          { label: "Date",         w: 140 },
                          { label: "Order ID",     w: 170 },
                          { label: "Beneficiary",  w: 130 },
                          { label: "Account",      w: 120 },
                          { label: "Bank",         w: 150 },
                          { label: "Amount",       w: 110 },
                          { label: "Status",       w: 90  },
                          { label: "UTR",          w: 120 },
                        ].map(({ label, w }) => (
                          <th key={label} style={{ width: w, padding: "10px 14px", textAlign: label === "Amount" ? "right" : "left", fontWeight: 600, fontSize: 12, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden" }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {txns.map((t, i) => (
                        <tr key={t.order_id} onClick={() => setSelTxn(t)}
                          style={{ borderBottom: "1px solid #f0f0f0", transition: "background .1s", cursor: "pointer" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                        >
                          <td style={{ padding: "11px 14px", color: "#9ca3af", fontSize: 12, overflow: "hidden" }}>{i + 1 + (page - 1) * PAGE_SIZE}</td>
                          <td style={{ padding: "11px 14px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmt.date(t.created_at)}</td>
                          <td style={{ padding: "11px 14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "#374151" }}>{t.order_id}</span>
                          </td>
                          <td style={{ padding: "11px 14px", fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.beneficiary_name}</td>
                          <td style={{ padding: "11px 14px", fontFamily: "DM Mono, monospace", fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.account_number}</td>
                          <td style={{ padding: "11px 14px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.bank_name || "—"}>{t.bank_name || "—"}</td>
                          <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: "DM Mono, monospace", fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>{fmtINR(t.amount)}</td>
                          <td style={{ padding: "11px 14px" }}>{statusBadge(t.status)}</td>
                          <td style={{ padding: "11px 14px", fontFamily: "DM Mono, monospace", fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.utr || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#f0fdf4", borderTop: "2px solid #e4e4e7" }}>
                        <td colSpan={6} style={{ padding: "11px 14px", fontWeight: 600, fontSize: 13, color: "#374151" }}>
                          Success total ({successTxns.length} of {txns.length} transactions)
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: "DM Mono, monospace", fontWeight: 700, fontSize: 15, color: "#10b981", whiteSpace: "nowrap" }}>
                          {fmtINR(successAmt)}
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button disabled={page === 1} onClick={() => { const p = page - 1; setPage(p); loadTxns(selUser.id, p); }}
                    style={{ height: 32, width: 32, borderRadius: 8, border: "1px solid #e4e4e7", background: "#fff", cursor: page === 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: page === 1 ? 0.4 : 1 }}>
                    <ChevronLeft size={15} />
                  </button>
                  <span style={{ height: 32, padding: "0 14px", display: "flex", alignItems: "center", fontSize: 13, fontWeight: 500 }}>{page} / {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); loadTxns(selUser.id, p); }}
                    style={{ height: 32, width: 32, borderRadius: 8, border: "1px solid #e4e4e7", background: "#fff", cursor: page >= totalPages ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: page >= totalPages ? 0.4 : 1 }}>
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Transaction Detail Modal */}
      {selTxn && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
          onClick={(e) => e.target === e.currentTarget && setSelTxn(null)}>
          <div className="fade-in" style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,.18)", overflow: "hidden" }}>
            <div style={{ background: "#1a1a2e", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 15, fontFamily: "DM Mono, monospace" }}>{selTxn.order_id}</div>
                <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 3 }}>{selTxn.created_at ? new Date(selTxn.created_at).toLocaleString("en-IN") : "—"}</div>
              </div>
              <button onClick={() => setSelTxn(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 22 }}>✕</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ textAlign: "center", marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #f0f0f0" }}>
                <div style={{ fontSize: 34, fontWeight: 700, color: "#111827" }}>{fmtINR(selTxn.amount)}</div>
                <div style={{ marginTop: 8 }}>{statusBadge(selTxn.status)}</div>
                {selTxn.failure_reason && (
                  <div style={{ fontSize: 12, color: "#ef4444", marginTop: 8, background: "#fef2f2", padding: "6px 12px", borderRadius: 8 }}>{selTxn.failure_reason}</div>
                )}
              </div>
              <div style={{ background: "#f9fafb", borderRadius: 12, border: "1px solid #e4e4e7", padding: "4px 16px" }}>
                {[
                  { label: "Account Name",   value: selTxn.beneficiary_name },
                  { label: "Account Number", value: selTxn.account_number },
                  { label: "IFSC Code",      value: selTxn.ifsc },
                  { label: "Bank Name",      value: selTxn.bank_name || "—" },
                  { label: "Transaction ID", value: selTxn.transaction_id || "—" },
                  { label: "UTR",            value: selTxn.utr || "—" },
                  { label: "Gateway Ref",    value: selTxn.gateway_ref_id || "—" },
                  { label: "Currency",       value: selTxn.currency },
                  { label: "Updated At",     value: selTxn.updated_at ? new Date(selTxn.updated_at).toLocaleString("en-IN") : "—" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid #f0f0f0" }}>
                    <span style={{ fontSize: 12, color: "#9ca3af", minWidth: 130 }}>{label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontFamily: "DM Mono, monospace", color: "#111827", fontWeight: 500, textAlign: "right" }}>{value}</span>
                      {value && value !== "—" && (
                        <button onClick={() => copyText(value, label)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2 }}>
                          <Copy size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setSelTxn(null)}
                style={{ width: "100%", marginTop: 16, padding: "10px 0", borderRadius: 10, border: "none", background: "#1a1a2e", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 500, fontFamily: "DM Sans, sans-serif" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}