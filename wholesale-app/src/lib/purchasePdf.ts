import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import {
  basePdfDefinition,
  companyStack,
  createPdfBlob,
  itemsTable,
  itemsTableBody,
  pdfFmt,
} from '@/lib/pdfMakeSetup'
import type { PurchaseInvoice, ShopProfile } from '@/types'

function formatPurchaseDate(dateStr?: string): string {
  if (!dateStr) return '—'
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) return dateStr
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function vendorAddress(purchase: PurchaseInvoice): string {
  const parts = [purchase.vendorInfo.address].filter(Boolean)
  if (purchase.vendorInfo.gstNumber) parts.push(`GST: ${purchase.vendorInfo.gstNumber}`)
  return parts.join('\n')
}

export function buildPurchasePdfDefinition(
  purchase: PurchaseInvoice,
  shopProfile: ShopProfile | null | undefined
): TDocumentDefinitions {
  const invoiceDate = formatPurchaseDate(purchase.purchaseDate)
  const amountPaid = purchase.amountPaid ?? 0
  const remaining = purchase.remainingAmount ?? Math.max(0, purchase.grandTotal - amountPaid)
  const vendAddress = vendorAddress(purchase)

  const totalsRows: Content[] = [
    {
      columns: [
        { text: 'Subtotal', width: '*', alignment: 'right' as const },
        { text: pdfFmt(purchase.subtotal), width: 80, alignment: 'right' as const },
      ],
      margin: [0, 0, 0, 4] as [number, number, number, number],
    },
  ]

  if (purchase.discount > 0) {
    totalsRows.push({
      columns: [
        { text: 'Discount', width: '*', alignment: 'right' as const },
        { text: `- ${pdfFmt(purchase.discount)}`, width: 80, alignment: 'right' as const },
      ],
      margin: [0, 0, 0, 4] as [number, number, number, number],
    })
  }

  totalsRows.push({
    columns: [
      { text: 'Total', width: '*', alignment: 'right' as const, bold: true },
      { text: pdfFmt(purchase.grandTotal), width: 80, alignment: 'right' as const, bold: true },
    ],
    margin: [0, 4, 0, 4] as [number, number, number, number],
  })

  if (purchase.status === 'SAVED') {
    totalsRows.push(
      {
        columns: [
          { text: `Paid (${invoiceDate})`, width: '*', alignment: 'right' as const },
          { text: pdfFmt(amountPaid), width: 80, alignment: 'right' as const },
        ],
        margin: [0, 0, 0, 4] as [number, number, number, number],
      },
      {
        columns: [
          { text: 'Balance Due', width: '*', alignment: 'right' as const, bold: true },
          { text: pdfFmt(remaining), width: 80, alignment: 'right' as const, bold: true },
        ],
        margin: [0, 4, 0, 0] as [number, number, number, number],
      }
    )
  }

  const vendorStack: Content[] = [
    { text: 'Vendor', style: 'sectionLabel' },
    { text: purchase.vendorInfo.name, style: 'customerName', margin: [0, 4, 0, 0] },
    { text: purchase.vendorInfo.phone, style: 'muted', margin: [0, 2, 0, 0] },
  ]
  if (vendAddress) {
    vendorStack.push({ text: vendAddress, style: 'muted', margin: [0, 2, 0, 0] })
  }

  const content: Content[] = [
    { text: 'PURCHASE INVOICE', style: 'title', alignment: 'center', margin: [0, 0, 0, 16] },
    {
      columns: [{ width: '*', stack: companyStack(shopProfile) }, { width: '*', text: '' }],
      margin: [0, 0, 0, 20],
    },
    {
      columns: [
        { width: '*', stack: vendorStack },
        {
          width: 180,
          stack: [
            {
              columns: [
                { text: 'Invoice No:', width: 80, style: 'metaLabel' },
                { text: purchase.purchaseNumber ?? 'Draft', style: 'metaValue' },
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
    itemsTable(itemsTableBody(purchase.items)),
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: 'Notes', style: 'sectionLabel' },
            {
              text: purchase.comment?.trim() || 'Purchase invoice for internal records.',
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

export async function createPurchasePdfBlob(
  purchase: PurchaseInvoice,
  shopProfile: ShopProfile | null | undefined
): Promise<Blob> {
  return createPdfBlob(buildPurchasePdfDefinition(purchase, shopProfile))
}
