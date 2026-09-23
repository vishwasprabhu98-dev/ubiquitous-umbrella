import { formatDate } from '@/lib/utils'
import { getBillDateString, istDayStart } from '@/lib/istDate'
import type { Bill, ShopProfile } from '@/types'

const RECEIPT_WIDTH = 32
/** Safe default ATT payload (MTU 23 − 3). Oversized chunks fail on many Android BLE stacks. */
const WRITE_CHUNK_SIZE_SAFE = 20
const WRITE_CHUNK_SIZE_FAST = 100
const WRITE_DELAY_MS = 40
const WRITE_DELAY_MS_ANDROID = 60

const CANDIDATE_SERVICE_UUIDS = [
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
] as const

const CANDIDATE_CHARACTERISTIC_UUIDS = new Set([
  '0000ffe1-0000-1000-8000-00805f9b34fb',
  '0000ff02-0000-1000-8000-00805f9b34fb',
  '0000fff1-0000-1000-8000-00805f9b34fb',
  '0000fff2-0000-1000-8000-00805f9b34fb',
  '0000ae01-0000-1000-8000-00805f9b34fb',
  '0000ae02-0000-1000-8000-00805f9b34fb',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
  '49535343-1e4d-4bd9-ba61-23c647249616',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
])

type BleRequestDeviceOptions = {
  filters?: Array<{ services?: string[]; namePrefix?: string }>
  acceptAllDevices?: boolean
  optionalServices?: string[]
}

type BleCharacteristic = {
  uuid: string
  properties: {
    write?: boolean
    writeWithoutResponse?: boolean
  }
  writeValue: (value: BufferSource) => Promise<void>
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>
}

type BleService = {
  uuid: string
  getCharacteristics: () => Promise<BleCharacteristic[]>
}

type BleServer = {
  getPrimaryService: (service: string) => Promise<BleService>
  getPrimaryServices?: () => Promise<BleService[]>
}

type BleGatt = {
  connected: boolean
  connect: () => Promise<BleServer>
  disconnect: () => void
}

type BleDevice = {
  gatt?: BleGatt
}

type BleNavigator = Navigator & {
  bluetooth?: {
    requestDevice: (options: BleRequestDeviceOptions) => Promise<BleDevice>
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isAndroidBrowser() {
  return /Android/i.test(navigator.userAgent)
}

function sanitizeText(value: string): string {
  return value
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
}

function money(value: number, includeCurrency = true): string {
  if (!includeCurrency) return value.toFixed(1)
  return `Rs. ${value.toFixed(2)}`
}

function center(text: string, width = RECEIPT_WIDTH): string {
  const trimmed = text.trim().slice(0, width)
  const left = Math.max(0, Math.floor((width - trimmed.length) / 2))
  return `${' '.repeat(left)}${trimmed}`
}

function divider(char = '-') {
  return char.repeat(RECEIPT_WIDTH)
}

function wrapLine(text: string, width = RECEIPT_WIDTH): string[] {
  const input = sanitizeText(text).trim()
  if (!input) return ['']

  const words = input.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    if (!current) {
      current = word
      continue
    }
    if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`
      continue
    }
    lines.push(current)
    current = word
  }

  if (current) lines.push(current)
  return lines
}

function pair(left: string, right: string, width = RECEIPT_WIDTH): string {
  const l = sanitizeText(left)
  const r = sanitizeText(right)
  const space = Math.max(1, width - l.length - r.length)
  if (l.length + r.length + 1 <= width) {
    return `${l}${' '.repeat(space)}${r}`
  }
  return `${l}\n${' '.repeat(Math.max(0, width - r.length))}${r}`
}

function billDateLabel(bill: Bill): string {
  const billDay = getBillDateString(bill)
  if (billDay) return formatDate(istDayStart(billDay))
  if (bill.createdAt?.toDate) return formatDate(bill.createdAt.toDate())
  return '-'
}

export function buildThermalReceiptText(bill: Bill, shopProfile?: ShopProfile | null): string {
  const lines: string[] = []
  const address = [shopProfile?.address, shopProfile?.city, shopProfile?.state, shopProfile?.pincode]
    .filter(Boolean)
    .join(', ')

  lines.push(center(shopProfile?.name || 'INVOICE'))
  if (address) lines.push(...wrapLine(address))
  if (shopProfile?.phone) lines.push(center(`Ph: ${shopProfile.phone}`))
  if (shopProfile?.gstNumber) lines.push(center(`GST: ${shopProfile.gstNumber}`))
  lines.push(divider('='))
  lines.push(...buildThermalBillBodyLines(bill))
  lines.push(divider('='))
  lines.push(center(`Thank you _/\\_`))

  return `${lines.join('\n')}\n`
}

function buildThermalBillBodyLines(bill: Bill, showCustomer = true): string[] {
  const lines: string[] = []
  lines.push(pair('Bill No: ', bill.billNumber))
  lines.push(pair('Date: ', billDateLabel(bill)))
  lines.push(divider())
  if (showCustomer) {
    lines.push(...wrapLine(`Customer: ${bill.customerInfo.name}`))
    lines.push(...wrapLine(`Phone: ${bill.customerInfo.phone}`))
    if (bill.customerInfo.gstNumber) lines.push(...wrapLine(`GST: ${bill.customerInfo.gstNumber}`))
    lines.push(divider())
  }

  bill.items.forEach((item, index) => {
    const qty = Number(item.quantity) || 0
    const rate = Number(item.unitRate) || 0
    const total = qty * rate - (Number(item.itemDiscount) || 0)

    lines.push(...wrapLine(`[${index + 1}] ${item.productName}`))
    lines.push(pair(`${qty} x ${money(rate, false)} = `, money(total)))
    if ((item.itemDiscount ?? 0) > 0) {
      lines.push(pair('  Disc', `- ${money(item.itemDiscount)}`))
    }
  })

  lines.push(divider())
  if ((bill.discount ?? 0) > 0) lines.push(pair('Bill Discount: ', `- ${money(bill.discount)}`))
  if (bill.isGstBill && (bill.gstAmount ?? 0) > 0) lines.push(pair('GST: ', money(bill.gstAmount)))
  lines.push(pair('Grand Total: ', money(bill.grandTotal)))
  if (bill.amountPaid > 0 && showCustomer) {
    lines.push(pair('Paid: ', money(bill.amountPaid)))
    if ((bill.remainingAmount ?? 0) > 0) {
      lines.push(divider('-'))
      lines.push(pair('Balance Due: ', money(bill.remainingAmount)))
    }
  }
  return lines
}

function signedBalanceLabel(amount: number): string {
  const abs = Math.abs(amount)
  if (abs < 0.001) return money(0)
  const suffix = amount > 0 ? ' DR' : ' CR'
  return `${money(abs)}${suffix}`
}

function formatShortDate(date?: Date): string {
  if (!date) return '—'
  try {
    return formatDate(date)
  } catch {
    return '—'
  }
}

export interface LedgerThermalPaymentLine {
  date?: Date
  amount: number
  paymentMode?: string
  description?: string
}

export function buildLedgerThermalStatement(params: {
  shopProfile?: ShopProfile | null
  customerName: string
  customerPhone: string
  dateFrom?: string
  dateTo?: string
  openingBalance: number
  bills: Bill[]
  payments: LedgerThermalPaymentLine[]
  balanceDue: number
}): string {
  const {
    shopProfile,
    customerName,
    customerPhone,
    dateFrom,
    dateTo,
    openingBalance,
    bills,
    payments,
    balanceDue,
  } = params

  const lines: string[] = []
  const address = [shopProfile?.address, shopProfile?.city, shopProfile?.state, shopProfile?.pincode]
    .filter(Boolean)
    .join(', ')

  lines.push(center(shopProfile?.name || 'LEDGER'))
  if (address) lines.push(...wrapLine(address))
  if (shopProfile?.phone) lines.push(center(`Ph: ${shopProfile.phone}`))
  lines.push(divider('='))
  lines.push(center('LEDGER STATEMENT'))
  lines.push(divider())
  lines.push(...wrapLine(`Customer: ${customerName}`))
  lines.push(...wrapLine(`Phone: ${customerPhone || '—'}`))
  if (shopProfile?.gstNumber) lines.push(center(`GST: ${shopProfile.gstNumber}`))
  
  const period =
    dateFrom && dateTo
      ? `${dateFrom} to ${dateTo}`
      : dateFrom
        ? `From ${dateFrom}`
        : dateTo
          ? `Up to ${dateTo}`
          : 'All time'
  lines.push(...wrapLine(`Period: ${period}`))
  lines.push(divider())
  lines.push(pair('Prev Balance:', signedBalanceLabel(openingBalance)))
  lines.push(divider('='))

  if (bills.length === 0) {
    lines.push(center('No bills in range'))
  } else {
    lines.push(center(`BILLS (${bills.length})`))
    lines.push(divider())
    bills.forEach((bill, index) => {
      lines.push(...buildThermalBillBodyLines(bill, false))
      if (index < bills.length - 1) lines.push(divider('='))
    })
  }

  lines.push(divider('='))
  if (payments.length === 0) {
    lines.push(center('No payments in range'))
  } else {
    lines.push(center(`PAYMENTS (${payments.length})`))
    lines.push(divider())
    for (const payment of payments) {
      lines.push(
        pair(
          formatShortDate(payment.date),
          money(payment.amount)
        )
      )
      const meta = [payment.description].filter(Boolean).join(' · ')
      if (meta) lines.push(...wrapLine(`  ${meta}`))
      lines.push(divider())
    }
  }

  lines.push(divider('='))
  lines.push(pair('BALANCE DUE:', signedBalanceLabel(balanceDue)))
  lines.push(divider('='))
  lines.push(center('Thank you'))

  return `${lines.join('\n')}`
}

function escPosEncode(text: string): Uint8Array {
  const encoder = new TextEncoder()
  // ESC @ init, then body, then feed paper so the last lines are visible
  const init = new Uint8Array([0x1b, 0x40])
  const body = encoder.encode(sanitizeText(text))
  // Extra line feeds only — many 58mm printers have no cutter; GS V can print garbage.
  const feed = new Uint8Array([0x0a, 0x0a, 0x0a, 0x0a, 0x0a])
  const bytes = new Uint8Array(init.length + body.length + feed.length)
  bytes.set(init, 0)
  bytes.set(body, init.length)
  bytes.set(feed, init.length + body.length)
  return bytes
}

function isWritableCharacteristic(characteristic: BleCharacteristic) {
  return Boolean(characteristic.properties.write || characteristic.properties.writeWithoutResponse)
}

function pickWritableCharacteristic(characteristics: BleCharacteristic[]) {
  const exact = characteristics.find(
    (characteristic) =>
      CANDIDATE_CHARACTERISTIC_UUIDS.has(characteristic.uuid.toLowerCase()) &&
      isWritableCharacteristic(characteristic)
  )
  if (exact) return exact

  // Prefer write-with-response when available — more reliable on Android.
  return (
    characteristics.find((c) => c.properties.write) ||
    characteristics.find((c) => c.properties.writeWithoutResponse) ||
    null
  )
}

async function findWritableCharacteristic(server: BleServer) {
  for (const serviceUuid of CANDIDATE_SERVICE_UUIDS) {
    try {
      const service = await server.getPrimaryService(serviceUuid)
      const characteristics = await service.getCharacteristics()
      const match = pickWritableCharacteristic(characteristics)
      if (match) return match
    } catch {
      // Service not exposed by this printer; continue scanning the common UUIDs.
    }
  }

  // Fallback: enumerate any services the browser granted access to.
  if (server.getPrimaryServices) {
    try {
      const services = await server.getPrimaryServices()
      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics()
          const match = pickWritableCharacteristic(characteristics)
          if (match) return match
        } catch {
          // skip
        }
      }
    } catch {
      // ignore
    }
  }

  throw new Error('Could not find a writable BLE characteristic for this printer.')
}

async function writeChunk(
  characteristic: BleCharacteristic,
  chunk: Uint8Array
) {
  // Copy into a fresh ArrayBuffer-backed view for Web Bluetooth typings / Android.
  const bytes = new Uint8Array(chunk)

  // Prefer with-response when available — Android often drops/truncates
  // writeWithoutResponse bursts before the printer UART drains.
  if (characteristic.properties.write) {
    await characteristic.writeValue(bytes)
    return
  }
  if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
    await characteristic.writeValueWithoutResponse(bytes)
    return
  }
  throw new Error('Printer characteristic is not writable.')
}

async function writeReceipt(
  characteristic: BleCharacteristic,
  payload: Uint8Array
) {
  const android = isAndroidBrowser()
  let chunkSize = android ? WRITE_CHUNK_SIZE_SAFE : WRITE_CHUNK_SIZE_FAST
  const delayMs = android ? WRITE_DELAY_MS_ANDROID : WRITE_DELAY_MS

  const sendAll = async (size: number) => {
    for (let offset = 0; offset < payload.length; offset += size) {
      const chunk = payload.slice(offset, offset + size)
      await writeChunk(characteristic, chunk)
      await sleep(delayMs)
    }
  }

  try {
    await sendAll(chunkSize)
  } catch (err) {
    // Retry once with the safest BLE ATT payload size.
    if (chunkSize > WRITE_CHUNK_SIZE_SAFE) {
      chunkSize = WRITE_CHUNK_SIZE_SAFE
      await sendAll(chunkSize)
    } else {
      throw err
    }
  }

  // writeWithoutResponse only means the OS accepted bytes — wait for printer drain
  // before disconnecting, otherwise Android truncates mid-receipt.
  const drainMs = Math.min(4000, Math.max(400, Math.ceil(payload.length / 12) * delayMs))
  await sleep(drainMs)
}

async function requestBlePrinterDevice(bleNavigator: BleNavigator): Promise<BleDevice> {
  if (!bleNavigator.bluetooth) {
    throw new Error('Bluetooth printing is not supported in this browser. Use Chrome on Android or desktop Chrome over HTTPS.')
  }

  // acceptAllDevices is the most reliable picker on Android Chrome for cheap POS printers
  // with arbitrary advertised names. Services must be listed in optionalServices to access them.
  return bleNavigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [...CANDIDATE_SERVICE_UUIDS],
  })
}

export async function printBillToBlePrinter(bill: Bill, shopProfile?: ShopProfile | null) {
  await printThermalTextToBlePrinter(buildThermalReceiptText(bill, shopProfile))
}

export async function printLedgerToBlePrinter(
  params: Parameters<typeof buildLedgerThermalStatement>[0]
) {
  await printThermalTextToBlePrinter(buildLedgerThermalStatement(params))
}

async function printThermalTextToBlePrinter(text: string) {
  const bleNavigator = navigator as BleNavigator

  if (!bleNavigator.bluetooth) {
    throw new Error('Bluetooth printing is not supported in this browser. Use Chrome on Android or desktop Chrome over HTTPS.')
  }

  if (!window.isSecureContext) {
    throw new Error('Bluetooth printing requires HTTPS (or localhost). Open the app over HTTPS and try again.')
  }

  const device = await requestBlePrinterDevice(bleNavigator)

  const server = await device.gatt?.connect()
  if (!server) {
    throw new Error('Could not connect to the printer.')
  }

  // Give Android a moment after GATT connect before service discovery.
  if (isAndroidBrowser()) await sleep(250)

  try {
    const characteristic = await findWritableCharacteristic(server)
    await writeReceipt(characteristic, escPosEncode(text))
  } finally {
    try {
      if (device.gatt?.connected) device.gatt.disconnect()
    } catch {
      // ignore disconnect errors
    }
  }
}
