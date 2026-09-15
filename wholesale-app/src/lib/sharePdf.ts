import { jsPDF } from 'jspdf'

const UNSUPPORTED_COLOR = /oklch|oklab|lab\(|color\(/i

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** Replace modern CSS colors html2canvas cannot parse. */
function sanitizeElementColors(root: HTMLElement) {
  const nodes = [root, ...root.querySelectorAll<HTMLElement>('*')]
  for (const node of nodes) {
    const computed = window.getComputedStyle(node)
    const props = [
      'color',
      'backgroundColor',
      'borderColor',
      'borderTopColor',
      'borderRightColor',
      'borderBottomColor',
      'borderLeftColor',
      'outlineColor',
    ] as const

    for (const prop of props) {
      const value = computed[prop]
      if (value && UNSUPPORTED_COLOR.test(value)) {
        if (prop === 'color') node.style.color = '#111827'
        else if (prop === 'backgroundColor') node.style.backgroundColor = '#ffffff'
        else node.style.borderColor = '#e5e7eb'
      } else if (value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
        node.style.setProperty(prop, value)
      }
    }
  }
}

async function waitForElement(elementId: string, timeoutMs = 5000): Promise<HTMLElement | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const el = document.getElementById(elementId)
    if (el && el.scrollWidth > 0 && el.scrollHeight > 0) return el
    await new Promise((r) => setTimeout(r, 80))
  }
  return document.getElementById(elementId)
}

function getCaptureScale(width: number, height: number): number {
  const maxSide = Math.max(width, height)
  if (maxSide <= 1200) return 2
  if (maxSide <= 2400) return 1.5
  return 1
}

async function renderElementToCanvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default
  const width = element.scrollWidth || element.offsetWidth || 794
  const height = element.scrollHeight || element.offsetHeight || 1123
  const scale = getCaptureScale(width, height)

  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  container.style.cssText =
    'position:fixed;left:-10000px;top:0;width:' +
    width +
    'px;background:#ffffff;z-index:-1;pointer-events:none;'
  const clone = element.cloneNode(true) as HTMLElement
  clone.style.width = `${width}px`
  clone.style.maxWidth = `${width}px`
  clone.style.overflow = 'visible'
  sanitizeElementColors(clone)
  container.appendChild(clone)
  document.body.appendChild(container)

  try {
    return await html2canvas(clone, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
      onclone: (doc) => {
        const cloned = doc.body.querySelector<HTMLElement>(`#${element.id}`)
        if (cloned) sanitizeElementColors(cloned)
      },
    })
  } finally {
    document.body.removeChild(container)
  }
}

function canvasToPdfBlob(canvas: HTMLCanvasElement): Blob {
  let imgData: string
  try {
    imgData = canvas.toDataURL('image/jpeg', 0.92)
  } catch {
    imgData = canvas.toDataURL('image/png')
  }

  if (!imgData || imgData.length < 100) {
    throw new Error('Could not encode document image')
  }

  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width
  const format = imgData.startsWith('data:image/png') ? 'PNG' : 'JPEG'

  let heightLeft = imgHeight
  let position = 0

  pdf.addImage(imgData, format, 0, position, imgWidth, imgHeight, undefined, 'FAST')
  heightLeft -= pageHeight

  while (heightLeft > 0) {
    position = heightLeft - imgHeight
    pdf.addPage()
    pdf.addImage(imgData, format, 0, position, imgWidth, imgHeight, undefined, 'FAST')
    heightLeft -= pageHeight
  }

  return pdf.output('blob')
}

function canvasToImageBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.size > 0) resolve(blob)
        else reject(new Error('Could not encode document image'))
      },
      'image/jpeg',
      0.92
    )
  })
}

/** Digits-only WhatsApp phone (defaults 10-digit Indian numbers to +91). */
export function toWhatsAppPhone(phone?: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null
  if (digits.length === 10) return `91${digits}`
  return digits
}

function openWhatsAppChat(phone: string | null | undefined, text: string) {
  const encoded = encodeURIComponent(text)
  const waPhone = toWhatsAppPhone(phone)
  const url = waPhone
    ? `https://wa.me/${waPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export { openWhatsAppChat }

/** iOS ignores `<a download>` — open PDF in a new tab so the user can share from the viewer. */
function openPdfInNewTab(blob: Blob): boolean {
  const url = URL.createObjectURL(blob)
  const opened = window.open(url, '_blank')
  if (!opened) {
    window.location.assign(url)
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000)
  return !!opened || isIOS()
}

function downloadBlobDesktop(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function tryNativeFileShare(file: File, title: string, text?: string): Promise<boolean> {
  if (typeof navigator.share !== 'function') return false

  const shareData: ShareData = text
    ? { files: [file], title, text }
    : { files: [file], title }

  try {
    if (navigator.canShare && !navigator.canShare(shareData)) return false
    await navigator.share(shareData)
    return true
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return true
    console.warn('[sharePdf] navigator.share failed:', err)
    return false
  }
}

export async function elementToPdfBlob(
  elementId: string,
  onError?: (msg: string) => void
): Promise<Blob | null> {
  const element = await waitForElement(elementId)
  if (!element) {
    onError?.('Document not rendered yet — please wait and try again')
    return null
  }

  let canvas: HTMLCanvasElement
  try {
    canvas = await renderElementToCanvas(element)
  } catch (err) {
    console.error('[elementToPdfBlob] html2canvas error:', err)
    onError?.('Failed to render document for PDF')
    return null
  }

  if (canvas.width === 0 || canvas.height === 0) {
    onError?.('Document rendered empty — please try again')
    return null
  }

  try {
    return canvasToPdfBlob(canvas)
  } catch (err) {
    console.error('[elementToPdfBlob] jsPDF error:', err)
    onError?.('Failed to create PDF file')
    return null
  }
}

export async function elementToImageBlob(
  elementId: string,
  onError?: (msg: string) => void
): Promise<Blob | null> {
  const element = await waitForElement(elementId)
  if (!element) {
    onError?.('Document not rendered yet — please wait and try again')
    return null
  }

  let canvas: HTMLCanvasElement
  try {
    canvas = await renderElementToCanvas(element)
  } catch (err) {
    console.error('[elementToImageBlob] html2canvas error:', err)
    onError?.('Failed to render document image')
    return null
  }

  if (canvas.width === 0 || canvas.height === 0) {
    onError?.('Document rendered empty — please try again')
    return null
  }

  try {
    return await canvasToImageBlob(canvas)
  } catch (err) {
    console.error('[elementToImageBlob] encode error:', err)
    onError?.('Failed to create image file')
    return null
  }
}

export async function sharePdfBlob(options: {
  blob: Blob
  filename: string
  title: string
  onFallback?: (message: string) => void
}): Promise<void> {
  const file = new File([options.blob], options.filename, { type: 'application/pdf' })

  const shared = await tryNativeFileShare(file, options.title)
  if (shared) return

  if (isIOS()) {
    openPdfInNewTab(options.blob)
    options.onFallback?.(
      'PDF opened — tap the Share button in the viewer to send via WhatsApp, Mail, etc.'
    )
    return
  }

  downloadBlobDesktop(options.blob, options.filename)
  options.onFallback?.('PDF downloaded — attach it from your Downloads folder to share.')
}

/** Share a document image (JPEG). Prefers the system share sheet (WhatsApp on phone). */
export async function shareImageBlob(options: {
  blob: Blob
  filename: string
  title: string
  text?: string
  phone?: string | null
  onFallback?: (message: string) => void
}): Promise<void> {
  const filename = options.filename.endsWith('.jpg') || options.filename.endsWith('.jpeg')
    ? options.filename
    : `${options.filename.replace(/\.pdf$/i, '')}.jpg`
  const file = new File([options.blob], filename, { type: 'image/jpeg' })
  const text = options.text ?? options.title

  const shared = await tryNativeFileShare(file, options.title, text)
  if (shared) return

  downloadBlobDesktop(options.blob, filename)
  openWhatsAppChat(options.phone, text)
  options.onFallback?.(
    options.phone
      ? 'Image saved — attach it in the WhatsApp chat that just opened.'
      : 'Image saved — open WhatsApp and attach it from Downloads.'
  )
}

function formatReminderAmount(amount: number): string {
  return `₹ ${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`
}

function formatReminderAsOf(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function fillCenteredTextWithSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  letterSpacing: number,
) {
  const chars = Array.from(text)
  const widths = chars.map((ch) => ctx.measureText(ch).width)
  const total =
    widths.reduce((sum, w) => sum + w, 0) +
    letterSpacing * Math.max(0, chars.length - 1)
  let x = centerX - total / 2
  const prevAlign = ctx.textAlign
  ctx.textAlign = 'left'
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, y)
    x += widths[i] + letterSpacing
  }
  ctx.textAlign = prevAlign
}

/** Draw a landscape payment-reminder JPEG without html2canvas (avoids CSS/dialog capture failures). */
export async function createPaymentReminderImageBlob(options: {
  amount: number
  shopName: string
  asOf?: Date
}): Promise<Blob> {
  const width = 1280
  const height = 720
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas')

  const shop = options.shopName.trim() || 'Shop'
  const amountLabel = formatReminderAmount(options.amount)
  const oweLabel = `You owe ${formatReminderAmount(options.amount).replace('₹ ', '₹')} as on ${formatReminderAsOf(options.asOf ?? new Date())}`

  // Soft blush → stone → cool gray gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#fff5f3')
  gradient.addColorStop(0.5, '#faf7f5')
  gradient.addColorStop(1, '#eef2f7')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  // Border
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 2
  ctx.strokeRect(24, 24, width - 48, height - 48)

  // Match PaymentReminderCard: 24px title, text-6xl amount, larger owe — scaled for 1280 canvas
  const scale = width / 720
  ctx.fillStyle = '#9ca3af'
  ctx.font = `600 ${Math.round(24 * scale)}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('PAYMENT REMINDER', width / 2, 150)

  ctx.fillStyle = '#8B1E1E'
  ctx.font = `700 ${Math.round(60 * scale)}px system-ui, -apple-system, sans-serif`
  fillCenteredTextWithSpacing(ctx, amountLabel, width / 2, 300, Math.round(4.8 * scale))

  ctx.fillStyle = '#6b7280'
  ctx.font = `400 ${Math.round(20 * scale)}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(oweLabel, width / 2, 410)

  // Shop button
  ctx.font = '600 24px system-ui, -apple-system, sans-serif'
  const padX = 36
  const btnTextW = ctx.measureText(shop).width
  const btnW = btnTextW + padX * 2 + 28
  const btnH = 56
  const btnX = (width - btnW) / 2
  const btnY = 500
  const radius = 8

  ctx.fillStyle = '#9ca3af'
  ctx.beginPath()
  ctx.moveTo(btnX + radius, btnY)
  ctx.arcTo(btnX + btnW, btnY, btnX + btnW, btnY + btnH, radius)
  ctx.arcTo(btnX + btnW, btnY + btnH, btnX, btnY + btnH, radius)
  ctx.arcTo(btnX, btnY + btnH, btnX, btnY, radius)
  ctx.arcTo(btnX, btnY, btnX + btnW, btnY, radius)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.fillText(shop, width / 2, btnY + btnH / 2)

  return canvasToImageBlob(canvas)
}

export async function sharePaymentReminderImage(options: {
  amount: number
  shopName: string
  customerName: string
  phone?: string | null
  text?: string
  onFallback?: (message: string) => void
}): Promise<void> {
  const blob = await createPaymentReminderImageBlob({
    amount: options.amount,
    shopName: options.shopName,
  })
  await shareImageBlob({
    blob,
    filename: `payment-reminder-${options.customerName.replace(/\s+/g, '-')}.jpg`,
    title: `Payment reminder — ${options.customerName}`,
    text: options.text,
    phone: options.phone,
    onFallback: options.onFallback,
  })
}

export async function downloadPdfBlob(options: {
  blob: Blob
  filename: string
  onFallback?: (message: string) => void
}): Promise<void> {
  if (isIOS()) {
    openPdfInNewTab(options.blob)
    options.onFallback?.('PDF opened — use Share in the viewer to save to Files.')
    return
  }

  downloadBlobDesktop(options.blob, options.filename)
}

export async function shareElementAsPdf(options: {
  elementId: string
  filename: string
  title: string
  onError?: (msg: string) => void
  onFallback?: (message: string) => void
}): Promise<void> {
  const blob = await elementToPdfBlob(options.elementId, options.onError)
  if (!blob) return

  await sharePdfBlob({
    blob,
    filename: options.filename,
    title: options.title,
    onFallback: options.onFallback,
  })
}

export async function shareElementAsImage(options: {
  elementId: string
  filename: string
  title: string
  text?: string
  phone?: string | null
  onError?: (msg: string) => void
  onFallback?: (message: string) => void
}): Promise<void> {
  const blob = await elementToImageBlob(options.elementId, options.onError)
  if (!blob) return

  await shareImageBlob({
    blob,
    filename: options.filename,
    title: options.title,
    text: options.text,
    phone: options.phone,
    onFallback: options.onFallback,
  })
}

export async function downloadElementAsPdf(options: {
  elementId: string
  filename: string
  onError?: (msg: string) => void
  onFallback?: (message: string) => void
}): Promise<void> {
  const blob = await elementToPdfBlob(options.elementId, options.onError)
  if (!blob) return

  await downloadPdfBlob({ blob, filename: options.filename, onFallback: options.onFallback })
}
