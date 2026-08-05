import { format } from 'date-fns'
import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces'
import {
  PDF_TABLE_LAYOUT,
  basePdfDefinition,
  companyStack,
  createPdfBlob,
  pdfFmt,
} from '@/lib/pdfMakeSetup'
import type { ShopProfile } from '@/types'

export interface LedgerPdfItem {
  productName: string
  quantity: number
  unitRate: number
  total: number
}

export interface LedgerPdfRow {
  date?: Date
  description: string
  type: 'bill' | 'payment' | 'purchase'
  debit: number
  credit: number
  balance: number
  items?: LedgerPdfItem[]
}

export interface LedgerPdfEntry {
  name: string
  phone: string
  totalBilled: number
  totalPaid: number
  outstanding: number
}

function formatRowDate(date?: Date): string {
  if (!date) return '—'
  try {
    return format(date, 'dd MMM yyyy')
  } catch {
    return '—'
  }
}

function rowTypeLabel(type: LedgerPdfRow['type']): string {
  if (type === 'bill') return 'Bill'
  if (type === 'purchase') return 'Purchase'
  return 'Pmt'
}

function balanceText(balance: number): string {
  const suffix = balance > 0 ? ' DR' : balance < 0 ? ' CR' : ''
  return `${pdfFmt(Math.abs(balance))}${suffix}`
}

function descriptionContent(row: LedgerPdfRow): Content {
  const title = `[${rowTypeLabel(row.type)}] ${row.description}`
  if (!row.items || row.items.length === 0) {
    return { text: title, style: 'tableCell' }
  }

  return {
    stack: [
      { text: title, style: 'tableCell', bold: true },
      {
        table: {
          widths: ['*', 28, 48, 52],
          body: [
            [
              { text: 'Item', fontSize: 7, bold: true, color: '#666666' },
              { text: 'Qty', fontSize: 7, bold: true, color: '#666666', alignment: 'right' },
              { text: 'Rate', fontSize: 7, bold: true, color: '#666666', alignment: 'right' },
              { text: 'Amount', fontSize: 7, bold: true, color: '#666666', alignment: 'right' },
            ],
            ...row.items.map((item) => [
              { text: item.productName, fontSize: 7, color: '#444444' },
              { text: String(item.quantity), fontSize: 7, color: '#444444', alignment: 'right' as const },
              { text: pdfFmt(item.unitRate), fontSize: 7, color: '#444444', alignment: 'right' as const },
              { text: pdfFmt(item.total), fontSize: 7, color: '#444444', alignment: 'right' as const },
            ]),
          ],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
            i === 0 || i === node.table.body.length ? 0.4 : 0,
          vLineWidth: () => 0,
          hLineColor: () => '#dddddd',
          paddingLeft: () => 0,
          paddingRight: () => 2,
          paddingTop: () => 1,
          paddingBottom: () => 1,
        },
        margin: [0, 4, 0, 0] as [number, number, number, number],
      },
    ],
  }
}

export function buildLedgerPdfDefinition(
  entry: LedgerPdfEntry,
  rows: LedgerPdfRow[],
  shopProfile: ShopProfile | null | undefined,
  dateFrom: string,
  dateTo: string
): TDocumentDefinitions {
  const dateLabel =
    dateFrom && dateTo
      ? `${dateFrom} to ${dateTo}`
      : dateFrom
        ? `From ${dateFrom}`
        : dateTo
          ? `Up to ${dateTo}`
          : 'All transactions'

  const chronological = [...rows].reverse()
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)
  const finalBalance = rows.length > 0 ? rows[0].balance : 0

  const tableSection: Content =
    rows.length === 0
      ? {
          text: 'No transactions found for this period.',
          alignment: 'center',
          style: 'muted',
          margin: [0, 12, 0, 12],
        }
      : {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths: [60, '*', 60, 60, 70],
            body: [
              [
                { text: 'Date', style: 'tableHeader' },
                { text: 'Description', style: 'tableHeader' },
                { text: 'Debit (DR)', style: 'tableHeader', alignment: 'right' as const },
                { text: 'Credit (CR)', style: 'tableHeader', alignment: 'right' as const },
                { text: 'Balance', style: 'tableHeader', alignment: 'right' as const },
              ],
              ...chronological.map((row) => [
                { text: formatRowDate(row.date), style: 'tableCell' },
                descriptionContent(row),
                {
                  text: row.debit > 0 ? pdfFmt(row.debit) : '—',
                  style: 'tableCell',
                  alignment: 'right' as const,
                },
                {
                  text: row.credit > 0 ? pdfFmt(row.credit) : '—',
                  style: 'tableCell',
                  alignment: 'right' as const,
                },
                {
                  text: balanceText(row.balance),
                  style: 'tableCell',
                  alignment: 'right' as const,
                },
              ] satisfies TableCell[]),
              [
                { text: 'Period Total', style: 'tableHeader', colSpan: 2 },
                '',
                { text: pdfFmt(totalDebit), style: 'tableHeader', alignment: 'right' as const },
                { text: pdfFmt(totalCredit), style: 'tableHeader', alignment: 'right' as const },
                { text: balanceText(finalBalance), style: 'tableHeader', alignment: 'right' as const },
              ],
            ] satisfies TableCell[][],
          },
          layout: PDF_TABLE_LAYOUT,
        }

  const content: Content[] = [
    { text: 'LEDGER STATEMENT', style: 'title', alignment: 'center', margin: [0, 0, 0, 16] },
    {
      columns: [
        { width: '*', stack: companyStack(shopProfile) },
        {
          width: 180,
          stack: [
            { text: `Period: ${dateLabel}`, style: 'muted', alignment: 'right' },
            { text: `Generated: ${format(new Date(), 'dd MMM yyyy')}`, style: 'muted', alignment: 'right', margin: [0, 2, 0, 0] },
          ],
        },
      ],
      margin: [0, 0, 0, 20],
    },
    {
      stack: [
        { text: 'Account Details', style: 'sectionLabel' },
        { text: entry.name, style: 'customerName', margin: [0, 4, 0, 0] },
        { text: `Phone: ${entry.phone}`, style: 'muted', margin: [0, 2, 0, 0] },
        {
          columns: [
            { text: `Total Billed: ${pdfFmt(entry.totalBilled)}`, style: 'muted' },
            { text: `Total Paid: ${pdfFmt(entry.totalPaid)}`, style: 'muted', alignment: 'center' },
            { text: `Outstanding: ${pdfFmt(entry.outstanding)}`, style: 'muted', alignment: 'right' },
          ],
          margin: [0, 6, 0, 0],
        },
      ],
      margin: [0, 0, 0, 20],
    },
    tableSection,
    {
      text: 'This is a computer-generated statement. Thank you for your business.',
      alignment: 'center',
      style: 'muted',
      margin: [0, 24, 0, 0],
    },
  ]

  return basePdfDefinition(content)
}

export async function createLedgerPdfBlob(
  entry: LedgerPdfEntry,
  rows: LedgerPdfRow[],
  shopProfile: ShopProfile | null | undefined,
  dateFrom: string,
  dateTo: string
): Promise<Blob> {
  return createPdfBlob(buildLedgerPdfDefinition(entry, rows, shopProfile, dateFrom, dateTo))
}
