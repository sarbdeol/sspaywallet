import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { CreditCard, Eye, EyeOff } from "lucide-react";
import { authApi } from "../services/api";
import { useAuthStore } from "../store/authStore";
import { Button, Input } from "../components/ui";
import { extractError } from "../utils/helpers";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  // Pre-fill username from URL param (?u=username) when admin clicks Login button
  const urlUsername =
    new URLSearchParams(window.location.search).get("u") || "";
  const [form, setForm] = useState({ username: urlUsername, password: "" });
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.login(form);
      setAuth(data.user, data.access_token);
      toast.success(
        `Welcome back, ${data.user.full_name || data.user.username}!`,
      );
      navigate(data.user.is_superadmin ? "/admin" : "/dashboard");
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fafafa",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo mark */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <img
            src="/sspaylogo.png"
            alt="SSPay"
            style={{ height: 56, objectFit: "contain", marginBottom: 16 }}
          />
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#111827",
              marginBottom: 4,
            }}
          >
            SSPay Wallet
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280" }}>
            Sign in to your account
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e4e4e7",
            boxShadow: "0 4px 20px rgba(0,0,0,.06)",
            padding: 32,
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 18 }}
          >
            <Input
              label="Username"
              type="text"
              placeholder="Enter your username"
              value={form.username}
              onChange={(e) =>
                setForm((f) => ({ ...f, username: e.target.value }))
              }
              required
              autoFocus
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label
                style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  required
                  style={{
                    width: "100%",
                    padding: "8px 40px 8px 12px",
                    fontSize: 14,
                    border: "1.5px solid #e4e4e7",
                    borderRadius: 10,
                    outline: "none",
                    background: "#fff",
                    fontFamily: "DM Sans, sans-serif",
                    color: "#1f2937",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#0ea5e9")}
                  onBlur={(e) => (e.target.style.borderColor = "#e4e4e7")}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#9ca3af",
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              loading={loading}
              size="lg"
              style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
            >
              Sign in
            </Button>
          </form>
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "#9ca3af",
            marginTop: 20,
          }}
        >
          Contact your administrator to get access.
        </p>
      </div>
    </div>
  );
}
