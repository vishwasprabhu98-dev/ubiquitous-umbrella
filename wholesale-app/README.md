# WholesalePro — Wholesale Distribution Management System

A production-ready Wholesale Business Management Web Application built for Indian businesses, powered by React 19, Vite, TypeScript, and Firebase.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Routing | React Router v7 |
| State | Zustand |
| Server State | TanStack Query v5 |
| Backend / DB | Firebase (Auth + Firestore + Hosting) |
| Forms | React Hook Form |
| Styling | Tailwind CSS v4 |
| Components | Radix UI primitives |
| Charts | Recharts |
| Icons | Lucide React |
| Dates | date-fns |
| Export | xlsx |

---

## Features

- **Authentication** — Firebase Auth with Admin / Staff roles, protected routes
- **Dashboard** — Stats cards, Line / Bar / Pie charts, Upcoming Orders table
- **Billing** — GST invoices with existing/new customer tabs, customer-specific pricing, bill status tracking, print/PDF
- **Orders** — Estimate/quotation management, order status timeline, Convert Order → Bill
- **Balance Sheet** — Date-range reports, monthly charts, customer balance table, CSV/Excel export
- **Settings** — Customer management, Product management, Custom pricing per customer

---

## Getting Started

### 1. Clone & Install

```bash
cd wholesale-app
npm install
```

### 2. Firebase Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Email/Password** authentication
3. Create a **Firestore** database
4. Copy `.env.example` to `.env` and fill in your Firebase credentials:

```bash
cp .env.example .env
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 4. Build for Production

```bash
npm run build
```

### 5. Deploy to Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

---

## Project Structure

```
src/
├── firebase/
│   ├── config.ts              # Firebase initialization
│   ├── collections.ts         # Firestore collection names
│   └── repositories/          # Data access layer
│       ├── customerRepository.ts
│       ├── productRepository.ts
│       ├── pricingRepository.ts
│       ├── billRepository.ts
│       ├── orderRepository.ts
│       └── transactionRepository.ts
├── types/
│   └── index.ts               # All TypeScript interfaces
├── stores/
│   ├── authStore.ts           # Zustand auth state
│   ├── themeStore.ts          # Dark mode persistence
│   └── uiStore.ts             # Sidebar state
├── hooks/
│   └── useAuth.ts             # Firebase auth hook
├── components/
│   ├── ui/                    # Reusable UI primitives
│   └── layout/                # AppLayout, Sidebar, Navbar
├── routes/
│   └── ProtectedRoute.tsx
└── features/
    ├── auth/                  # Login page
    ├── dashboard/             # Dashboard with charts
    ├── billing/               # Billing + Invoice view
    ├── orders/                # Orders + Timeline
    ├── balance-sheet/         # Financial reports
    └── settings/              # Customers, Products, Pricing
```

---

## Firestore Collections

| Collection | Description |
|---|---|
| `users` | App users with role (admin/staff) |
| `customers` | Customer master data |
| `products` | Product catalog |
| `customerProductPricing` | Custom pricing overrides per customer |
| `bills` | GST invoices |
| `orders` | Estimates / quotations |
| `transactions` | Payment records |

---

## Environment Variables

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```
