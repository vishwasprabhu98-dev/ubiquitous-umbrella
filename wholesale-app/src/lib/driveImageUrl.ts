/** Extract a Google Drive file id from common share / view / open URLs. */
export function extractGoogleDriveFileId(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null

  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?[^#]*\bid=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/uc\?[^#]*\bid=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/thumbnail\?[^#]*\bid=([a-zA-Z0-9_-]+)/,
    /docs\.google\.com\/[^/]+\/d\/([a-zA-Z0-9_-]+)/,
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(trimmed)
    if (match?.[1]) return match[1]
  }

  return null
}

/**
 * Convert a Google Drive share link (or plain image URL) into a URL suitable for `<img src>`.
 * Non-Drive URLs are returned unchanged.
 */
export function toDisplayImageUrl(url: string, width = 1200): string {
  const trimmed = url.trim()
  if (!trimmed) return ''

  const fileId = extractGoogleDriveFileId(trimmed)
  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`
  }

  return trimmed
}

export function toDisplayImageUrls(urls: string[], width = 1200): string[] {
  return urls.map((u) => toDisplayImageUrl(u, width)).filter(Boolean)
}
