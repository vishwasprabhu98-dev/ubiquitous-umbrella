Act as a Senior Staff Engineer and UI/UX Architect.

Build a production-ready Wholesale Business Management Web Application for Indian businesses using the latest React ecosystem and Firebase only.

## Tech Stack

Use:
- React 19
- Vite
- TypeScript
- React Router v7
- Firebase
  - Firebase Authentication
  - Cloud Firestore
  - Firebase Hosting
  - Firebase Storage (if needed)
- TanStack Query
- Zustand for state management
- React Hook Form
- Zod validation
- Tailwind CSS
- shadcn/ui
- Recharts for analytics
- Lucide React icons
- Date-fns

DO NOT use:
- Node.js backend
- Express
- NestJS
- Any custom server
- Any SQL database

Everything must be built using Firebase services.

---

## Application Goal

Create a complete Wholesale Distribution Management System.

The application helps businesses:

- Manage customers
- Manage products
- Create bills
- Create estimates/orders
- Track order status
- Track pending payments
- View dashboards
- Generate reports
- Analyze customer balances
- Maintain GST-based transactions

Indian Rupees (₹) must be used everywhere.

---

# Design Requirements

Theme:
- Professional
- Modern
- Enterprise grade
- Light Blue + White theme
- Full Dark Mode support

Design should look similar to:
- Zoho
- Tally Prime modern version
- Razorpay Dashboard
- Stripe Dashboard

Features:
- Responsive
- Mobile-friendly
- Tablet-friendly
- Desktop optimized

Sidebar:
- Fixed left sidebar
- Collapsible
- Hamburger menu on mobile

Top Navbar:
- Search
- Theme Switch
- Notification icon
- User profile dropdown

---

# Sidebar Menu

1. Dashboard
2. Billing
3. Orders
4. Balance Sheet
5. Settings

---

# Authentication

Use Firebase Authentication.

Roles:
- Admin
- Staff

Admin:
- Full access

Staff:
- Billing
- Orders
- Dashboard only

Protect routes.

---

# Firestore Collections

## customers

customerId
name
phone
whatsapp
email
gstNumber
address
city
state
pincode
createdAt

---

## products

productId
productName
basePrice
gstPercentage
unit
createdAt

---

## customerProductPricing

mappingId
customerId
productId
customPrice

This collection allows customer-specific pricing.

Logic:
- If custom price exists -> use custom price.
- Otherwise use product.basePrice.

---

## bills

billId
billNumber
customerId
customerInfo
items
subtotal
discount
gstAmount
grandTotal
status
amountPaid
remainingAmount
paymentStatus
createdAt

---

## orders

orderId
orderNumber
customerId
items
estimatedAmount
status
createdAt

---

## transactions

transactionId
billId
customerId
amount
paymentMode
remarks
createdAt

---

# Dashboard Page

Create a beautiful dashboard.

Cards:

1. Total Sales
2. Pending Amount
3. Orders Pending
4. Total Customers

Upcoming Orders Table:

Columns:
- Order Number
- Customer
- Date
- Amount
- Status

Sort:
- Earliest date first

Charts:

1. Orders Per Day
   - Line Chart

2. Transactions Amount Per Day
   - Bar Chart

3. Sales Distribution
   - Pie Chart

Recent Activity Section.

---

# Settings Module

Settings contains:

## Customer Management

Customer Form:

Fields:
- Name
- GST Number
- Phone
- Email
- Address
- City
- State
- Pincode

Features:
- Create
- Edit
- Delete
- Search

---

## Product Management

Fields:

- Product Name
- Product ID
- Base Price
- GST Percentage
- Unit

Features:
- Create
- Edit
- Delete
- Search

---

## Customer Pricing Mapping

Allow assigning custom prices.

Example:

Customer A
Product Rice
Custom Price ₹42

Customer B
Product Rice
Custom Price ₹45

If no mapping exists:
Use Base Price.

Create a dedicated management screen.

---

# Billing Module

Tabs:

1. Existing Customer
2. New Customer

---

## Existing Customer

Searchable dropdown.

Select customer.

Auto-fetch:
- GST
- Phone
- Address

---

## New Customer

Inputs:

- Customer Name
- Phone
- GST Number

Allow creating bill immediately.

---

## Bill Items

Every row includes:

- Product
- Quantity
- Unit Rate
- Item Discount
- GST %
- Total

Buttons:

- Add Item
- Remove Item

When product selected:

Check customer pricing mapping.

If exists:
Use mapped price.

Else:
Use base price.

---

## Billing Calculations

Automatically calculate:

Subtotal

Item discounts

Bill Discount

GST

Grand Total

Remaining Amount

---

## Bill Status

Enum:

PENDING

ORDER_ACCEPTED

ORDER_DELIVERED

PAYMENT_PENDING

DONE

PARTIAL_PAYMENT

Provide colored status badges.

---

## Billing Actions

Generate:

- Invoice View
- Print Invoice
- Download PDF

Use browser print mechanism and PDF generation.

Create professional GST invoice layout.

---

# Orders Module

Order acts as Estimate/Quotation.

Similar UI as billing.

Differences:

- No payment tracking
- Estimated price
- Convert Order → Bill button

Order Status:

- NEW
- ACCEPTED
- REJECTED
- PROCESSING
- DELIVERED

Add timeline view.

---

# Balance Sheet Module

Date Filters:

- From Date
- To Date

Reports:

1. Total Sales
2. Total GST Collection
3. Total Outstanding Amount
4. Total Paid Amount

Charts:

- Monthly Sales
- Customer Sales Breakdown

Tables:

## Customer Balance Table

Columns:

- Customer Name
- Total Bill Amount
- Paid Amount
- Pending Amount

Export:

- CSV
- Excel

---

# Firebase Architecture

Use repository pattern.

Create:

src/
 ├─ app/
 ├─ modules/
 ├─ components/
 ├─ features/
 ├─ services/
 ├─ hooks/
 ├─ firebase/
 ├─ routes/
 ├─ lib/
 ├─ types/

Firestore access should be centralized.

Use TypeScript interfaces everywhere.

Use proper converters.

---

# Best Practices

- Feature-based folder structure
- Reusable components
- Loading states
- Skeleton loaders
- Error boundaries
- Toast notifications
- Optimistic updates
- Firestore pagination
- Query caching with TanStack Query
- Accessibility support
- SEO-friendly meta handling
- Dark mode persistence
- Form validation using Zod
- No any types
- Strict TypeScript
- Clean architecture

---

# Deliverables

Generate:

1. Complete project structure
2. Firebase configuration
3. Firestore schema
4. TypeScript models
5. Routing architecture
6. Zustand stores
7. Reusable components
8. Dashboard implementation
9. Customer management
10. Product management
11. Customer pricing module
12. Billing module
13. Orders module
14. Balance sheet module
15. Authentication module
16. Dark mode implementation
17. Responsive UI
18. Production-ready code

Build this as if it will be directly deployed to Firebase Hosting for a real wholesale business handling thousands of customers and invoices.