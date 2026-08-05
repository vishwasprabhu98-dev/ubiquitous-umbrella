import pdfMake from 'pdfmake/build/pdfmake'
import vfs from 'pdfmake/build/vfs_fonts'
import type { Content, StyleDictionary, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces'
import type { ShopProfile } from '@/types'

let pdfMakeReady = false

export function ensurePdfMakeReady() {
  if (pdfMakeReady) return
  pdfMake.addVirtualFileSystem(vfs)
  pdfMake.addFonts({
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    },
  })
  pdfMakeReady = true
}

export async function createPdfBlob(definition: TDocumentDefinitions): Promise<Blob> {
  ensurePdfMakeReady()
  return pdfMake.createPdf(definition).getBlob()
}

export function pdfFmt(amount: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
}

export function shopAddress(profile: ShopProfile | null | undefined): string {
  return [profile?.address, profile?.city, profile?.state, profile?.pincode].filter(Boolean).join(', ')
}

export function companyStack(profile: ShopProfile | null | undefined): Content[] {
  const address = shopAddress(profile)
  const stack: Content[] = [
    { text: profile?.name || 'Your Business Name', style: 'companyName' },
  ]
  if (address) stack.push({ text: address, style: 'muted', margin: [0, 2, 0, 0] })
  if (profile?.phone) {
    stack.push({ text: `Mobile: ${profile.phone}`, style: 'muted', margin: [0, 2, 0, 0] })
  }
  if (profile?.email) {
    stack.push({ text: `Email: ${profile.email}`, style: 'muted', margin: [0, 2, 0, 0] })
  }
  if (profile?.gstNumber) {
    stack.push({ text: `GST: ${profile.gstNumber}`, style: 'muted', margin: [0, 2, 0, 0] })
  }
  return stack
}

export const PDF_STYLES: StyleDictionary = {
  title: { fontSize: 22, bold: true },
  companyName: { fontSize: 12, bold: true },
  sectionLabel: { fontSize: 10, bold: true },
  customerName: { fontSize: 10, bold: true },
  metaLabel: { fontSize: 9, color: '#444444' },
  metaValue: { fontSize: 9, bold: true, alignment: 'right' },
  muted: { fontSize: 9, color: '#444444' },
  tableHeader: { fontSize: 9, bold: true },
  tableCell: { fontSize: 9 },
}

export const PDF_TABLE_LAYOUT = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
    i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
  vLineWidth: () => 0,
  hLineColor: () => '#cccccc',
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 5,
  paddingBottom: () => 5,
}

export function pdfPageFooter(currentPage: number, pageCount: number): Content {
  return {
    text: `Page ${currentPage} of ${pageCount}`,
    alignment: 'center',
    fontSize: 9,
    color: '#666666',
    margin: [0, 10, 0, 0],
  }
}

export function basePdfDefinition(content: Content[]): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#111111' },
    footer: pdfPageFooter,
    styles: PDF_STYLES,
    content,
  }
}

export function itemsTableBody(
  items: { productName: string; quantity: number; unitRate: number; total: number }[]
): TableCell[][] {
  return [
    [
      { text: 'Sl.', style: 'tableHeader' },
      { text: 'Description', style: 'tableHeader' },
      { text: 'Qty', style: 'tableHeader', alignment: 'right' as const },
      { text: 'Rate', style: 'tableHeader', alignment: 'right' as const },
      { text: 'Amount', style: 'tableHeader', alignment: 'right' as const },
    ],
    ...items.map((item, i) => [
      { text: String(i + 1), style: 'tableCell' },
      { text: item.productName, style: 'tableCell' },
      { text: String(item.quantity), style: 'tableCell', alignment: 'right' as const },
      { text: pdfFmt(item.unitRate), style: 'tableCell', alignment: 'right' as const },
      { text: pdfFmt(item.total), style: 'tableCell', alignment: 'right' as const },
    ]),
  ]
}

export function itemsTable(tableBody: TableCell[][]): Content {
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: [24, '*', 40, 60, 70],
      body: tableBody,
    },
    layout: PDF_TABLE_LAYOUT,
    margin: [0, 0, 0, 20],
  }
}
