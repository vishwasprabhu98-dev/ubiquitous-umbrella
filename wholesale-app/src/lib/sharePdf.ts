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

async function tryNativeFileShare(file: File, title: string): Promise<boolean> {
  if (typeof navigator.share !== 'function') return false

  const shareData: ShareData = { files: [file], title }

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
