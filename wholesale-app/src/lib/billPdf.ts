import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces'
import { formatDate } from '@/lib/utils'
import { getBillDateString, istDayStart } from '@/lib/istDate'
import {
  PDF_TABLE_LAYOUT,
  basePdfDefinition,
  companyStack,
  createPdfBlob,
  pdfFmt,
} from '@/lib/pdfMakeSetup'
import type { Bill, ShopProfile } from '@/types'

function billItemsTable(bill: Bill): Content {
  const hasItemDiscount = bill.items.some((item) => (item.itemDiscount ?? 0) > 0)

  const header: TableCell[] = [
    { text: 'Sl.', style: 'tableHeader' },
    { text: 'Description', style: 'tableHeader' },
    { text: 'Qty', style: 'tableHeader', alignment: 'right' as const },
    { text: 'Rate', style: 'tableHeader', alignment: 'right' as const },
  ]
  if (hasItemDiscount) {
    header.push({ text: 'Disc', style: 'tableHeader', alignment: 'right' as const })
  }
  header.push({ text: 'Amount', style: 'tableHeader', alignment: 'right' as const })

  const widths: (number | string)[] = hasItemDiscount ? [24, '*', 40, 60, 50, 70] : [24, '*', 40, 60, 70]

  const body: TableCell[][] = [
    header,
    ...bill.items.map((item, i) => {
      const row: TableCell[] = [
        { text: String(i + 1), style: 'tableCell' },
        { text: item.productName, style: 'tableCell' },
        { text: String(item.quantity), style: 'tableCell', alignment: 'right' as const },
        { text: pdfFmt(item.unitRate), style: 'tableCell', alignment: 'right' as const },
      ]
      if (hasItemDiscount) {
        row.push({
          text: (item.itemDiscount ?? 0) > 0 ? pdfFmt(item.itemDiscount) : '—',
          style: 'tableCell',
          alignment: 'right' as const,
        })
      }
      row.push({ text: pdfFmt(item.total), style: 'tableCell', alignment: 'right' as const })
      return row
    }),
  ]

  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths,
      body,
    },
    layout: PDF_TABLE_LAYOUT,
    margin: [0, 0, 0, 20],
  }
}

function billDate(bill: Bill): string {
  const day = getBillDateString(bill)
  if (day) return formatDate(istDayStart(day))
  return '—'
}

function customerAddress(bill: Bill): string {
  const parts = [bill.customerInfo.address].filter(Boolean)
  if (bill.customerInfo.gstNumber) parts.push(`GST: ${bill.customerInfo.gstNumber}`)
  return parts.join('\n')
}

export function buildBillPdfDefinition(
  bill: Bill,
  shopProfile: ShopProfile | null | undefined
): TDocumentDefinitions {
  const invoiceDate = billDate(bill)
  const custAddress = customerAddress(bill)
  const itemDiscountTotal = bill.items.reduce((sum, item) => sum + (item.itemDiscount ?? 0), 0)
  const billDiscount = bill.discount ?? 0
  const totalDiscount = itemDiscountTotal + billDiscount
  const hasItemDiscount = itemDiscountTotal > 0
  const hasBillDiscount = billDiscount > 0
  const hasAnyDiscount = totalDiscount > 0
  const grossAmount = bill.items.reduce(
    (sum, item) => sum + item.quantity * item.unitRate,
    0
  )

  const totalsRows: Content[] = []

  if (hasAnyDiscount) {
    totalsRows.push({
      columns: [
        { text: 'Gross Amount', width: '*', alignment: 'right' as const },
        { text: pdfFmt(grossAmount), width: 80, alignment: 'right' as const },
      ],
      margin: [0, 0, 0, 4] as [number, number, number, number],
    })
  }

  if (hasItemDiscount) {
    totalsRows.push({
      columns: [
        { text: 'Item Discount', width: '*', alignment: 'right' as const },
        { text: `- ${pdfFmt(itemDiscountTotal)}`, width: 80, alignment: 'right' as const },
      ],
      margin: [0, 0, 0, 4] as [number, number, number, number],
    })
  }

  totalsRows.push({
    columns: [
      { text: 'Subtotal', width: '*', alignment: 'right' as const },
      { text: pdfFmt(bill.subtotal), width: 80, alignment: 'right' as const },
    ],
    margin: [0, 0, 0, 4] as [number, number, number, number],
  })

  if (hasBillDiscount) {
    totalsRows.push({
      columns: [
        { text: 'Bill Discount', width: '*', alignment: 'right' as const },
        { text: `- ${pdfFmt(billDiscount)}`, width: 80, alignment: 'right' as const },
      ],
      margin: [0, 0, 0, 4] as [number, number, number, number],
    })
  }

  if (hasAnyDiscount) {
    totalsRows.push({
      columns: [
        { text: 'Total Discount', width: '*', alignment: 'right' as const, bold: true },
        { text: `- ${pdfFmt(totalDiscount)}`, width: 80, alignment: 'right' as const, bold: true },
      ],
      margin: [0, 0, 0, 4] as [number, number, number, number],
    })
  }

  if (bill.isGstBill && bill.gstAmount > 0) {
    totalsRows.push({
      columns: [
        { text: 'GST', width: '*', alignment: 'right' as const },
        { text: pdfFmt(bill.gstAmount), width: 80, alignment: 'right' as const },
      ],
      margin: [0, 0, 0, 4] as [number, number, number, number],
    })
  }

  totalsRows.push(
    {
      columns: [
        { text: 'Total', width: '*', alignment: 'right' as const, bold: true },
        { text: pdfFmt(bill.grandTotal), width: 80, alignment: 'right' as const, bold: true },
      ],
      margin: [0, 4, 0, 4] as [number, number, number, number],
    },
    {
      columns: [
        { text: `Paid (${invoiceDate})`, width: '*', alignment: 'right' as const },
        { text: pdfFmt(bill.amountPaid), width: 80, alignment: 'right' as const },
      ],
      margin: [0, 0, 0, 4] as [number, number, number, number],
    }
  )

  if (bill.remainingAmount > 0 && !bill.movedToLedger) {
    totalsRows.push({
      columns: [
        { text: 'Balance Due', width: '*', alignment: 'right' as const, bold: true },
        { text: pdfFmt(bill.remainingAmount), width: 80, alignment: 'right' as const, bold: true },
      ],
      margin: [0, 4, 0, 0] as [number, number, number, number],
    })
  }

  const billToStack: Content[] = [
    { text: 'Bill To', style: 'sectionLabel' },
    { text: bill.customerInfo.name, style: 'customerName', margin: [0, 4, 0, 0] },
    { text: bill.customerInfo.phone, style: 'muted', margin: [0, 2, 0, 0] },
  ]
  if (custAddress) {
    billToStack.push({ text: custAddress, style: 'muted', margin: [0, 2, 0, 0] })
  }

  const content: Content[] = [
    { text: 'INVOICE', style: 'title', alignment: 'center', margin: [0, 0, 0, 16] },
    {
      columns: [{ width: '*', stack: companyStack(shopProfile) }, { width: '*', text: '' }],
      margin: [0, 0, 0, 20],
    },
    {
      columns: [
        { width: '*', stack: billToStack },
        {
          width: 180,
          stack: [
            {
              columns: [
                { text: 'Invoice No:', width: 80, style: 'metaLabel' },
                { text: bill.billNumber, style: 'metaValue' },
              ],
              margin: [0, 0, 0, 4],
            },
            {
              columns: [
                { text: 'Invoice Date:', width: 80, style: 'metaLabel' },
                { text: invoiceDate, style: 'metaValue' },
              ],
            },
          ],
        },
      ],
      margin: [0, 0, 0, 20],
    },
    billItemsTable(bill),
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: 'Payment Instructions', style: 'sectionLabel' },
            {
              text: bill.comment?.trim() || 'Thank you for your business.',
              style: 'muted',
              margin: [0, 6, 0, 0],
            },
          ],
        },
        { width: 200, stack: totalsRows },
      ],
      margin: [0, 0, 0, 40],
    },
    {
      text: 'Authorized Signatory',
      alignment: 'right',
      bold: true,
      margin: [0, 20, 0, 0],
    },
  ]

  return basePdfDefinition(content)
}

export async function createBillPdfBlob(
  bill: Bill,
  shopProfile: ShopProfile | null | undefined
): Promise<Blob> {
  return createPdfBlob(buildBillPdfDefinition(bill, shopProfile))
}
