# ssPay Frontend — React + Vite

Clean, minimal dashboard for the ssPay Wallet System.
Two portals in one app — Super Admin and User — routed by role.

---

## Pages

### Super Admin
| Route              | Page              |
|--------------------|-------------------|
| `/admin`           | Dashboard + stats + master wallet top-up |
| `/admin/users`     | Create / list / enable-disable users     |
| `/admin/wallets`   | List sub-wallets, fund any user wallet   |
| `/admin/funding`   | Full funding history with balance audit  |

### User
| Route             | Page              |
|-------------------|-------------------|
| `/dashboard`      | Wallet balance + recent transactions     |
| `/payout/single`  | Single payout form                       |
| `/payout/bulk`    | Excel drag-and-drop upload + job tracker |
| `/transactions`   | Full history with status filter + detail |

---

## Setup

```bash
# Install
npm install

# Copy env
cp .env.example .env

# Dev (proxies /api to localhost:8000)
npm run dev

# Production build
npm run build
```

The Vite dev server runs on **http://localhost:3000**
and proxies all `/api` requests to **http://localhost:8000** (your FastAPI backend).

---

## Tech Stack

| Library         | Purpose                      |
|-----------------|------------------------------|
| React 18        | UI framework                 |
| Vite            | Build tool + dev server      |
| React Router v6 | Client-side routing          |
| Axios           | HTTP client + JWT interceptor|
| Zustand         | Auth state management        |
| Recharts        | Dashboard charts             |
| react-dropzone  | File drag-and-drop           |
| react-hot-toast | Toast notifications          |
| lucide-react    | Icons                        |
| date-fns        | Date formatting              |

---

## Auth Flow

1. Admin or user logs in at `/login`
2. JWT token stored in `localStorage`
3. Every Axios request automatically attaches `Authorization: Bearer <token>`
4. On 401 response → auto logout + redirect to `/login`
5. Super admin → redirected to `/admin`
6. Regular user → redirected to `/dashboard`

---

## Connecting to Production Backend

Update `vite.config.js` proxy target:

```js
proxy: {
  '/api': {
    target: 'https://your-backend.com',
    changeOrigin: true,
  }
}
```

Or for a static build, set `VITE_API_BASE=https://your-backend.com/api/v1`
and update `src/services/api.js` `baseURL` to `import.meta.env.VITE_API_BASE`.
