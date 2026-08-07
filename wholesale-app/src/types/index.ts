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
