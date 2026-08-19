import { formatDate } from '@/lib/utils'
import { getBillDateString, istDayStart } from '@/lib/istDate'
import type { Bill, ShopProfile } from '@/types'

const RECEIPT_WIDTH = 32
const WRITE_CHUNK_SIZE = 180
const WRITE_DELAY_MS = 35

const CANDIDATE_SERVICE_UUIDS = [
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
] as const

const CANDIDATE_CHARACTERISTIC_UUIDS = new Set([
  '0000ffe1-0000-1000-8000-00805f9b34fb',
  '0000ff02-0000-1000-8000-00805f9b34fb',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
  '49535343-1e4d-4bd9-ba61-23c647249616',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
])

type BleRequestDeviceOptions = {
  acceptAllDevices: boolean
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
  getCharacteristics: () => Promise<BleCharacteristic[]>
}

type BleServer = {
  getPrimaryService: (service: string) => Promise<BleService>
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
  lines.push(pair('Bill No: ', bill.billNumber))
  lines.push(pair('Date: ', billDateLabel(bill)))
  lines.push(divider())
  lines.push(...wrapLine(`Customer: ${bill.customerInfo.name}`))
  lines.push(...wrapLine(`Phone: ${bill.customerInfo.phone}`))
  if (bill.customerInfo.gstNumber) lines.push(...wrapLine(`GST: ${bill.customerInfo.gstNumber}`))
  lines.push(divider())

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
  // lines.push(pair('Subtotal', money(bill.subtotal)))
  if ((bill.discount ?? 0) > 0) lines.push(pair('Bill Discount: ', `- ${money(bill.discount)}`))
  if (bill.isGstBill && (bill.gstAmount ?? 0) > 0) lines.push(pair('GST: ', money(bill.gstAmount)))
  lines.push(pair('Grand Total: ', money(bill.grandTotal)))
  if (bill.amountPaid > 0) {
    lines.push(pair('Paid: ', money(bill.amountPaid)));
    if ((bill.remainingAmount ?? 0) > 0) {
      lines.push(divider('-'))
      lines.push(pair('Balance Due: ', money(bill.remainingAmount)))
    }
  }
  // if (bill.comment) {
  //   lines.push(divider())
  //   lines.push('Notes:')
  //   lines.push(...wrapLine(bill.comment))
  // }
  lines.push(divider('='))
  lines.push(center(`Thank you _/\\_`))

  return `${lines.join('\n')}\n`
}

function escPosEncode(text: string): Uint8Array {
  const encoder = new TextEncoder()
  const init = new Uint8Array([0x1b, 0x40])
  const body = encoder.encode(sanitizeText(text))
  const feed = new Uint8Array([0x0a, 0x0a, 0x0a])
  const bytes = new Uint8Array(init.length + body.length + feed.length)
  bytes.set(init, 0)
  bytes.set(body, init.length)
  bytes.set(feed, init.length + body.length)
  return bytes
}

async function findWritableCharacteristic(server: BleServer) {
  for (const serviceUuid of CANDIDATE_SERVICE_UUIDS) {
    try {
      const service = await server.getPrimaryService(serviceUuid)
      const characteristics = await service.getCharacteristics()
      const exact = characteristics.find((characteristic) =>
        CANDIDATE_CHARACTERISTIC_UUIDS.has(characteristic.uuid.toLowerCase())
      )
      if (exact && (exact.properties.write || exact.properties.writeWithoutResponse)) return exact

      const fallback = characteristics.find(
        (characteristic) => characteristic.properties.write || characteristic.properties.writeWithoutResponse
      )
      if (fallback) return fallback
    } catch {
      // Service not exposed by this printer; continue scanning the common UUIDs.
    }
  }
  throw new Error('Could not find a writable BLE characteristic for this printer.')
}

async function writeReceipt(
  characteristic: BleCharacteristic,
  payload: Uint8Array
) {
  for (let offset = 0; offset < payload.length; offset += WRITE_CHUNK_SIZE) {
    const chunk = payload.slice(offset, offset + WRITE_CHUNK_SIZE)
    if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk)
    } else {
      await characteristic.writeValue(chunk)
    }
    await sleep(WRITE_DELAY_MS)
  }
}

export async function printBillToBlePrinter(bill: Bill, shopProfile?: ShopProfile | null) {
  const bleNavigator = navigator as BleNavigator

  if (!bleNavigator.bluetooth) {
    throw new Error('Bluetooth printing is not supported in this browser. Use Chrome on Android or desktop Chrome over HTTPS.')
  }

  const device = await bleNavigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [...CANDIDATE_SERVICE_UUIDS],
  })

  const server = await device.gatt?.connect()
  if (!server) {
    throw new Error('Could not connect to the printer.')
  }

  try {
    const characteristic = await findWritableCharacteristic(server)
    const receipt = buildThermalReceiptText(bill, shopProfile)
    await writeReceipt(characteristic, escPosEncode(receipt))
  } finally {
    if (device.gatt?.connected) device.gatt.disconnect()
  }
}
