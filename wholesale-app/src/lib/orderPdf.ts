import { format, parseISO } from 'date-fns'
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { formatDate } from '@/lib/utils'
import {
  basePdfDefinition,
  companyStack,
  createPdfBlob,
  itemsTable,
  pdfFmt,
} from '@/lib/pdfMakeSetup'
import type { Order, OrderStatus, ShopProfile, TimeSlot } from '@/types'

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'New',
  ACCEPTED: 'Accepted',
  PROCESSING: 'Processing',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
}

const TIME_SLOT_LABELS: Record<TimeSlot, string> = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  EVENING: 'Evening',
}

function orderDateLabel(order: Order): string {
  if (order.orderDate) {
    try {
      return format(parseISO(order.orderDate), 'dd MMM yyyy')
    } catch {
      return order.orderDate
    }
  }
  if (order.createdAt?.toDate) return formatDate(order.createdAt.toDate())
  return '—'
}

export function buildOrderPdfDefinition(
  order: Order,
  shopProfile: ShopProfile | null | undefined
): TDocumentDefinitions {
  const dateLabel = orderDateLabel(order)
  const custAddress = [order.customerInfo.address, order.customerInfo.gstNumber ? `GST: ${order.customerInfo.gstNumber}` : '']
    .filter(Boolean)
    .join('\n')

  const tableBody = [
    [
      { text: 'Sl.', style: 'tableHeader' },
      { text: 'Description', style: 'tableHeader' },
      { text: 'Qty', style: 'tableHeader', alignment: 'right' as const },
      { text: 'Rate', style: 'tableHeader', alignment: 'right' as const },
      { text: 'Amount', style: 'tableHeader', alignment: 'right' as const },
    ],
    ...order.items.map((item, i) => [
      { text: String(i + 1), style: 'tableCell' },
      { text: item.productName, style: 'tableCell' },
      { text: String(item.quantity), style: 'tableCell', alignment: 'right' as const },
      { text: pdfFmt(item.unitRate), style: 'tableCell', alignment: 'right' as const },
      { text: pdfFmt(item.total), style: 'tableCell', alignment: 'right' as const },
    ]),
  ]

  const customerStack: Content[] = [
    { text: 'Customer', style: 'sectionLabel' },
    { text: order.customerInfo.name, style: 'customerName', margin: [0, 4, 0, 0] },
    { text: order.customerInfo.phone, style: 'muted', margin: [0, 2, 0, 0] },
  ]
  if (custAddress) {
    customerStack.push({ text: custAddress, style: 'muted', margin: [0, 2, 0, 0] })
  }

  const metaStack: Content[] = [
    {
      columns: [
        { text: 'Order No:', width: 80, style: 'metaLabel' },
        { text: order.orderNumber, style: 'metaValue' },
      ],
      margin: [0, 0, 0, 4],
    },
    {
      columns: [
        { text: 'Order Date:', width: 80, style: 'metaLabel' },
        { text: dateLabel, style: 'metaValue' },
      ],
      margin: [0, 0, 0, 4],
    },
    {
      columns: [
        { text: 'Status:', width: 80, style: 'metaLabel' },
        { text: ORDER_STATUS_LABELS[order.status], style: 'metaValue' },
      ],
    },
  ]

  if (order.timeSlot) {
    metaStack.splice(2, 0, {
      columns: [
        { text: 'Time Slot:', width: 80, style: 'metaLabel' },
        { text: TIME_SLOT_LABELS[order.timeSlot], style: 'metaValue' },
      ],
      margin: [0, 0, 0, 4],
    })
  }

  const content: Content[] = [
    { text: 'ORDER', style: 'title', alignment: 'center', margin: [0, 0, 0, 16] },
    {
      columns: [{ width: '*', stack: companyStack(shopProfile) }, { width: '*', text: '' }],
      margin: [0, 0, 0, 20],
    },
    {
      columns: [
        { width: '*', stack: customerStack },
        { width: 180, stack: metaStack },
      ],
      margin: [0, 0, 0, 20],
    },
    itemsTable(tableBody),
    {
      columns: [
        {
          width: '*',
          stack: order.comment?.trim()
            ? [
                { text: 'Notes', style: 'sectionLabel' },
                { text: order.comment.trim(), style: 'muted', margin: [0, 6, 0, 0] },
              ]
            : [{ text: 'Thank you for your order!', style: 'muted' }],
        },
        {
          width: 200,
          stack: [
            {
              columns: [
                { text: 'Estimated Total', width: '*', alignment: 'right' as const, bold: true },
                { text: pdfFmt(order.estimatedAmount), width: 80, alignment: 'right' as const, bold: true },
              ],
            },
          ],
        },
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

export async function createOrderPdfBlob(
  order: Order,
  shopProfile: ShopProfile | null | undefined
): Promise<Blob> {
  return createPdfBlob(buildOrderPdfDefinition(order, shopProfile))
}
