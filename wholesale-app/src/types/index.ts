import type { Timestamp } from 'firebase/firestore'

// ─── User & Auth ───────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'staff' | 'finance'

export interface AppUser {
  uid: string
  email: string
  displayName: string
  role: UserRole
  createdAt: Timestamp
}

// ─── Customer ──────────────────────────────────────────────────────────────

export interface Customer {
  customerId: string
  name: string
  phone: string
  whatsapp?: string
  email?: string
  gstNumber?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  /** ₹ the customer already owes at start (receivable). */
  openingBalance?: number
  createdAt: Timestamp
}

export type CustomerFormData = Omit<Customer, 'customerId' | 'createdAt'>

/** Denormalized ledger summary for fast list views. Doc id = customerId. */
export interface CustomerBalance {
  customerId: string
  openingBalance: number
  /** Bills grand totals + opening balance */
  totalBilled: number
  /** Bill amountPaid + ledger-level payments */
  totalPaid: number
  /** SAVED purchases sourced from this customer (credits) */
  purchaseCredits: number
  /** Net balance: positive = customer owes, negative = credit (purchase payable) */
  outstanding: number
  billCount: number
  lastActivityAt?: Timestamp
  updatedAt?: Timestamp
}

/** Month-end running balance under customerBalances/{id}/monthlySnapshots/{YYYY-MM}. */
export interface CustomerMonthlySnapshot {
  monthKey: string
  /** Running balance at end of month (positive = customer owes). */
  closingBalance: number
  updatedAt?: Timestamp
}

// ─── Product ───────────────────────────────────────────────────────────────

export interface Product {
  productId: string
  productName: string
  basePrice: number
  gstPercentage: number
  unit: string
  /** Prefer in product pickers (billing / orders / purchases) */
  starred?: boolean
  createdAt: Timestamp
}

export type ProductFormData = Omit<Product, 'productId' | 'createdAt'>

// ─── Public Catalog Product ────────────────────────────────────────────────

export interface CatalogProductSize {
  label: string
  originalPrice: number
  discountedPrice: number
}

/** Storefront catalog item (separate from billing inventory products). */
export interface CatalogProduct {
  catalogProductId: string
  name: string
  description: string
  /** Price unit, e.g. KG, Piece. */
  unit: string
  /** Used when `sizes` is empty; otherwise typically mirrors the first/default size. */
  originalPrice: number
  discountedPrice: number
  /** Optional size variants with their own prices (Small / Medium / Large, etc.). */
  sizes?: CatalogProductSize[]
  /** Google Drive share / direct links; converted for display at render time. */
  imageUrls: string[]
  /** Optional badge on the card, e.g. "Top item". */
  badge?: string
  sortOrder?: number
  createdAt: Timestamp
}

export type CatalogProductFormData = Omit<CatalogProduct, 'catalogProductId' | 'createdAt'>

// ─── Customer Product Pricing ──────────────────────────────────────────────

export interface CustomerProductPricing {
  mappingId: string
  customerId: string
  productId: string
  customPrice: number
}

// ─── Bill ──────────────────────────────────────────────────────────────────

export type BillStatus =
  | 'PENDING'
  | 'ORDER_ACCEPTED'
  | 'ORDER_DELIVERED'
  | 'PAYMENT_PENDING'
  | 'DONE'
  | 'PARTIAL_PAYMENT'

export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID'

export interface BillItem {
  productId: string
  productName: string
  quantity: number
  unitRate: number
  itemDiscount: number
  gstPercentage: number
  total: number
}

export interface BillCustomerInfo {
  customerId?: string
  name: string
  phone: string
  gstNumber?: string
  address?: string
}

export interface Bill {
  billId: string
  billNumber: string
  customerId?: string
  customerInfo: BillCustomerInfo
  items: BillItem[]
  subtotal: number
  discount: number
  gstAmount: number
  grandTotal: number
  isGstBill?: boolean
  status: BillStatus
  amountPaid: number
  remainingAmount: number
  paymentStatus: PaymentStatus
  movedToLedger?: boolean
  comment?: string
  /** YYYY-MM-DD (IST), user-selected invoice date */
  billingDate?: string
  createdAt: Timestamp
}

// ─── Order ─────────────────────────────────────────────────────────────────

export type OrderStatus = 'NEW' | 'ACCEPTED' | 'REJECTED' | 'PROCESSING' | 'DELIVERED'
export type TimeSlot = 'MORNING' | 'AFTERNOON' | 'EVENING'

export interface OrderItem {
  productId: string
  productName: string
  quantity: number
  unitRate: number
  gstPercentage: number
  total: number
}

export interface Order {
  orderId: string
  orderNumber: string
  customerId: string
  customerInfo: BillCustomerInfo
  items: OrderItem[]
  estimatedAmount: number
  advanceAmount?: number
  advanceMode?: PaymentMode
  advanceRemarks?: string
  status: OrderStatus
  billId?: string
  orderDate: string      // YYYY-MM-DD, user-selected
  timeSlot: TimeSlot     // MORNING | AFTERNOON | EVENING
  comment?: string
  createdAt: Timestamp
}

// ─── Transaction ───────────────────────────────────────────────────────────

export type PaymentMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER'

export interface Transaction {
  transactionId: string
  billId: string
  customerId?: string
  purchaseId?: string
  amount: number
  paymentMode: PaymentMode
  remarks?: string
  createdAt: Timestamp
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalSales: number
  pendingAmount: number
  ordersPending: number
  totalCustomers: number
}

export interface ChartDataPoint {
  date: string
  value: number
}

export type YearFormat = 'YYYY' | 'YY' | 'none'
export type SeparatorChar = '-' | '/' | '.' | '_' | ''

export interface NumberFormatConfig {
  prefix: string
  yearFormat: YearFormat
  separator: SeparatorChar
  startNumber: number
  currentNumber: number
  suffix: string
}

export interface NumberFormatSettings {
  bill: NumberFormatConfig
  order: NumberFormatConfig
  purchase: NumberFormatConfig
}

// ─── Shop Profile ───────────────────────────────────────────────────────────

export interface ShopProfile {
  name: string
  address: string
  city: string
  state: string
  pincode: string
  gstNumber: string
  phone: string
  email?: string
  /** UPI ID shown on payment reminders (e.g. shop@okaxis). */
  upiId?: string
  compositionGstRate: number
}

// ─── Purchase Invoice ────────────────────────────────────────────────────────

export type PurchaseStatus = 'DRAFT' | 'SAVED'

export interface PurchaseItem {
  productId: string
  productName: string
  quantity: number
  unitRate: number
  total: number
}

export interface VendorInfo {
  name: string
  phone: string
  gstNumber?: string
  address?: string
}

export interface PurchaseInvoice {
  purchaseId: string
  purchaseNumber?: string
  status: PurchaseStatus
  vendorType: 'customer' | 'new'
  customerId?: string
  vendorInfo: VendorInfo
  items: PurchaseItem[]
  subtotal: number
  discount: number
  grandTotal: number
  amountPaid?: number
  remainingAmount?: number
  purchaseDate: string
  comment?: string
  createdAt: Timestamp
  updatedAt?: Timestamp
}

// ─── Activity Logs ─────────────────────────────────────────────────────────

export type ActivityEventType =
  | 'bill.created'
  | 'bill.updated'
  | 'bill.payment_recorded'
  | 'bill.moved_to_ledger'
  | 'bill.removed_from_ledger'
  | 'bill.shared_whatsapp'
  | 'bill.shared_pdf'
  | 'bill.printed'
  | 'ledger.payment_recorded'
  | 'ledger.payment_reminder_sent'
  | 'order.created'
  | 'order.updated'
  | 'order.status_changed'
  | 'order.deleted'
  | 'order.converted_to_bill'
  | 'purchase.created'
  | 'purchase.updated'
  | 'purchase.deleted'
  | 'settings.shop_profile_updated'
  | 'settings.number_format_updated'
  | 'settings.user_role_updated'
  | 'settings.customer_created'
  | 'settings.customer_updated'
  | 'settings.customer_deleted'
  | 'settings.product_created'
  | 'settings.product_updated'
  | 'settings.product_deleted'
  | 'settings.catalog_created'
  | 'settings.catalog_updated'
  | 'settings.catalog_deleted'
  | 'settings.pricing_updated'
  | 'settings.ledger_rebuilt'

export type ActivityEntityType =
  | 'bill'
  | 'customer'
  | 'order'
  | 'purchase'
  | 'ledger'
  | 'product'
  | 'catalog'
  | 'settings'
  | 'user'

export interface ActivityLog {
  logId: string
  type: ActivityEventType
  /** Human-readable summary of what happened. */
  description: string
  createdAt: Timestamp
  /** Firestore TTL field — auto-delete after retention (typically 2 months). */
  expireAt: Timestamp
  actorUid: string
  actorName: string
  actorEmail: string
  actorRole: UserRole
  entityType: ActivityEntityType
  entityId: string
  entityLabel?: string
  customerId?: string
  customerName?: string
  /** Line items snapshot, e.g. for bill/order create. */
  itemsSummary?: string
  /** Previous items when updating a bill/order. */
  itemsBefore?: string
  /** New items when updating a bill/order. */
  itemsAfter?: string
  meta?: Record<string, string | number | boolean | null | undefined>
}

export type ActivityLogInput = Omit<ActivityLog, 'logId' | 'createdAt' | 'expireAt'>
