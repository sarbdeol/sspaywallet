import React, { useState, useEffect } from "react";
import { CheckCircle, ArrowUpRight } from "lucide-react";
import toast from "react-hot-toast";
import { payoutApi } from "../../services/api";
import { Card, Input, Button, Badge, PageHeader } from "../../components/ui";
import { fmt, extractError } from "../../utils/helpers";

const EMPTY = {
  name: "",
  account_number: "",
  ifsc: "",
  bank_name: "",
  amount: "",
  currency: "INR",
};

export default function SinglePayout() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    payoutApi
      .balance()
      .then((r) => setBalance(r.data))
      .catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = "Required";
    if (!form.account_number.trim()) e.account_number = "Required";
    if (!form.ifsc.trim()) e.ifsc = "Required";
    if (!form.bank_name.trim()) e.bank_name = "Bank name is required";
    if (!form.amount || parseFloat(form.amount) <= 0)
      e.amount = "Enter a valid amount";
    if (balance && parseFloat(form.amount) > parseFloat(balance.balance))
      e.amount = `Exceeds balance (${fmt.currency(balance.balance)})`;
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { data } = await payoutApi.singlePayout({
        amount: parseFloat(parseFloat(form.amount).toFixed(2)),
        currency: form.currency,
        beneficiary: {
          name: form.name,
          account_number: form.account_number,
          ifsc: form.ifsc,
          bank_name: form.bank_name,
        },
      });
      setResult(data);
      setForm(EMPTY);
      toast.success("Payout initiated successfully");
      payoutApi
        .balance()
        .then((r) => setBalance(r.data))
        .catch(() => {});
    } catch (e) {
      toast.error(extractError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Single Payout"
        subtitle="Transfer funds to a bank account"
      />

      {/* Balance pill */}
      {balance && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            borderRadius: 99,
            background: "#f0f9ff",
            border: "1px solid #bae6fd",
            marginBottom: 24,
            fontSize: 13,
          }}
        >
          <span style={{ color: "#6b7280" }}>Available:</span>
          <span
            style={{
              fontWeight: 600,
              color: "#0c4a6e",
              fontFamily: "DM Mono, monospace",
            }}
          >
            {fmt.currency(balance.balance)}
          </span>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 380px",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* Form */}
        <Card style={{ padding: 28 }}>
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 20 }}
          >
            <div
              style={{ paddingBottom: 16, borderBottom: "1px solid #f0f0f0" }}
            >
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                Beneficiary Details
              </div>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>
                Bank account to receive the payment
              </div>
            </div>

            <Input
              label="Beneficiary Name *"
              value={form.name}
              onChange={set("name")}
              error={errors.name}
              placeholder="Full name as per bank records"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <Input
                label="Account Number *"
                value={form.account_number}
                onChange={set("account_number")}
                error={errors.account_number}
                placeholder="1234567890"
              />
              <Input
                label="IFSC Code *"
                value={form.ifsc}
                onChange={set("ifsc")}
                error={errors.ifsc}
                placeholder="SBIN0001234"
                style={{ textTransform: "uppercase" }}
              />
            </div>
            <Input
              label="Bank Name *"
              value={form.bank_name}
              error={errors.bank_name}
              onChange={set("bank_name")}
              placeholder="e.g. State Bank of India"
            />

            <div style={{ paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>
                Payment
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px",
                  gap: 14,
                }}
              >
                <Input
                  label="Amount *"
                  type="number"
                  step="0.01"
                  min="1"
                  value={form.amount}
                  onChange={set("amount")}
                  error={errors.amount}
                  placeholder="0.00"
                />
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 5 }}
                >
                  <label
                    style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}
                  >
                    Currency
                  </label>
                  <select
                    value={form.currency}
                    onChange={set("currency")}
                    style={{
                      padding: "9px 12px",
                      borderRadius: 10,
                      border: "1.5px solid #e4e4e7",
                      fontSize: 14,
                      fontFamily: "DM Sans, sans-serif",
                      background: "#fff",
                      outline: "none",
                    }}
                  >
                    <option>INR</option>
                  </select>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              loading={loading}
              size="lg"
              style={{ justifyContent: "center", marginTop: 4 }}
            >
              <ArrowUpRight size={16} /> Initiate Payout
            </Button>
          </form>
        </Card>

        {/* Result / Info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {result ? (
            <Card style={{ padding: 24, borderLeft: "3px solid #10b981" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <CheckCircle size={20} color="#10b981" />
                <span style={{ fontWeight: 600, fontSize: 15 }}>
                  Payout Initiated
                </span>
              </div>
              {[
                ["Order ID", result.order_id],
                ["Amount", fmt.currency(result.amount, result.currency)],
                ["Beneficiary", result.beneficiary_name],
                ["Account", result.account_number],
                ["Status", null],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom: "1px solid #f9f9f9",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "#6b7280" }}>{k}</span>
                  {k === "Status" ? (
                    <Badge status={result.status} />
                  ) : (
                    <span
                      style={{
                        fontWeight: 500,
                        fontFamily:
                          k === "Order ID" || k === "Account"
                            ? "DM Mono, monospace"
                            : "inherit",
                      }}
                    >
                      {v}
                    </span>
                  )}
                </div>
              ))}
            </Card>
          ) : (
            <Card style={{ padding: 24 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
                How it works
              </div>
              {[
                "Fill in the beneficiary bank details",
                "Enter the amount to transfer",
                "Submit — funds deducted instantly from your wallet",
                "Payment processed via sspay gateway",
                "Status updates via webhook callback",
              ].map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 10,
                    marginBottom: 10,
                    fontSize: 13,
                    color: "#6b7280",
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "#f4f4f5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  {s}
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
