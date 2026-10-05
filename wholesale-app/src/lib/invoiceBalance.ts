import type { Bill } from '@/types'

/** Unpaid portion of this invoice (grand total − amount paid). */
export function billUnpaidAmount(bill: Bill): number {
  return Math.max(0, (bill.grandTotal ?? 0) - (bill.amountPaid ?? 0))
}

/**
 * Balance lines for invoice view / PDF / share.
 * When ledger outstanding is available (registered customer), Balance Due is the
 * full ledger balance and Previous Balance is outstanding before this bill's unpaid amount.
 */
export function getInvoiceBalanceBreakdown(
  bill: Bill,
  ledgerOutstanding: number | null | undefined
) {
  const thisBillUnpaid = billUnpaidAmount(bill)
  const useLedger = ledgerOutstanding != null && Number.isFinite(ledgerOutstanding)
  const dueAmount = useLedger
    ? (ledgerOutstanding as number)
    : bill.movedToLedger
      ? 0
      : bill.remainingAmount ?? thisBillUnpaid

  const previousBalance = useLedger ? (ledgerOutstanding as number) - thisBillUnpaid : 0

  return {
    thisBillUnpaid,
    previousBalance,
    dueAmount,
    showPreviousBalance: useLedger && Math.abs(previousBalance) > 0.001,
    showAmountPaid: (bill.amountPaid ?? 0) > 0.001,
    showBalanceDue: dueAmount > 0.001,
    showCredit: useLedger && dueAmount < -0.001,
  }
}
