import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  query,
  orderBy,
  limit,
  Timestamp,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db, auth } from '@/firebase/config'
import { COLLECTIONS } from '@/firebase/collections'
import { useAuthStore } from '@/stores/authStore'
import type { ActivityLog, ActivityLogInput, ActivityEventType } from '@/types'

const logsRef = () => collection(db, COLLECTIONS.ACTIVITY_LOGS)

export type ActivityLineItem = {
  productName?: string
  quantity?: number
  unitRate?: number
  itemDiscount?: number
}

/** Compact item list for activity descriptions. */
export function formatActivityItems(items: ActivityLineItem[] | undefined | null): string {
  if (!items?.length) return ''
  return items
    .filter((i) => (i.productName ?? '').trim())
    .map((i) => {
      const name = (i.productName ?? '').trim()
      const qty = Number(i.quantity) || 0
      const rate = Number(i.unitRate) || 0
      const disc = Number(i.itemDiscount) || 0
      const discPart = disc > 0 ? ` (−₹${disc})` : ''
      return `${name} × ${qty} @ ₹${rate}${discPart}`
    })
    .join('; ')
}

/** Strip null/undefined recursively — Firestore rejects nested undefined. */
function cleanForFirestore(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined
  if (Array.isArray(value)) {
    return value.map(cleanForFirestore).filter((v) => v !== undefined)
  }
  if (value instanceof Timestamp) return value
  if (
    typeof value === 'object' &&
    value !== null &&
    ('_methodName' in value ||
      (value as { constructor?: { name?: string } }).constructor?.name === 'FieldValue')
  ) {
    return value
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = cleanForFirestore(v)
      if (cleaned !== undefined) out[k] = cleaned
    }
    return out
  }
  return value
}

/** Coerce Firestore / plain timestamp-like values into a Timestamp. */
function coerceTimestamp(value: unknown): Timestamp | null {
  if (!value) return null
  if (value instanceof Timestamp) {
    try {
      const ms = value.toMillis()
      return Number.isFinite(ms) ? value : null
    } catch {
      return null
    }
  }
  if (typeof value === 'object' && value !== null) {
    // Broken sentinel left by an older cleaner: { _methodName: 'serverTimestamp' } or {}
    if ('_methodName' in value) return null
    const keys = Object.keys(value)
    if (keys.length === 0) return null

    const obj = value as {
      toDate?: () => Date
      seconds?: number
      nanoseconds?: number
      _seconds?: number
      _nanoseconds?: number
    }
    if (typeof obj.toDate === 'function') {
      try {
        const d = obj.toDate()
        if (d instanceof Date && !Number.isNaN(d.getTime())) return Timestamp.fromDate(d)
      } catch {
        /* ignore */
      }
    }
    const seconds = obj.seconds ?? obj._seconds
    const nanos = obj.nanoseconds ?? obj._nanoseconds ?? 0
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      return new Timestamp(seconds, nanos)
    }
  }
  return null
}

/** Client SDK has no createTime — use REST once to recover it for broken docs. */
async function fetchCreateTimeViaRest(docId: string): Promise<Timestamp | null> {
  try {
    const user = auth.currentUser
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
    if (!user || !projectId) return null
    const token = await user.getIdToken()
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${COLLECTIONS.ACTIVITY_LOGS}/${docId}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const json = (await res.json()) as { createTime?: string }
    if (!json.createTime) return null
    const d = new Date(json.createTime)
    return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d)
  } catch {
    return null
  }
}

/** Retention window for activity logs (Firestore TTL uses expireAt). */
const ACTIVITY_LOG_RETENTION_MONTHS = 2

function expireAtFrom(createdAt: Timestamp): Timestamp {
  const d = createdAt.toDate()
  d.setMonth(d.getMonth() + ACTIVITY_LOG_RETENTION_MONTHS)
  return Timestamp.fromDate(d)
}

async function mapActivityDoc(snap: QueryDocumentSnapshot): Promise<ActivityLog> {
  const data = (snap.data() ?? {}) as Record<string, unknown>
  let createdAt = coerceTimestamp(data.createdAt)
  let expireAt = coerceTimestamp(data.expireAt)

  if (!createdAt) {
    createdAt = await fetchCreateTimeViaRest(snap.id)
  }

  const resolvedCreatedAt = createdAt ?? Timestamp.fromMillis(0)
  if (!expireAt && resolvedCreatedAt.toMillis() > 0) {
    expireAt = expireAtFrom(resolvedCreatedAt)
  }

  const patch: Record<string, Timestamp> = {}
  if (!coerceTimestamp(data.createdAt) && resolvedCreatedAt.toMillis() > 0) {
    patch.createdAt = resolvedCreatedAt
  }
  if (!coerceTimestamp(data.expireAt) && expireAt) {
    patch.expireAt = expireAt
  }
  if (Object.keys(patch).length > 0) {
    void updateDoc(doc(db, COLLECTIONS.ACTIVITY_LOGS, snap.id), patch).catch(() => {
      /* best-effort heal */
    })
  }

  return {
    ...data,
    logId: snap.id,
    createdAt: resolvedCreatedAt,
    expireAt: expireAt ?? expireAtFrom(Timestamp.now()),
  } as ActivityLog
}

function logCreatedMs(log: ActivityLog): number {
  try {
    const ts = coerceTimestamp(log.createdAt)
    return ts ? ts.toMillis() : 0
  } catch {
    return 0
  }
}

export const activityLogRepository = {
  async create(input: ActivityLogInput): Promise<void> {
    // Use a real Timestamp (not serverTimestamp) so WHEN always has a value.
    // An older cleaner turned serverTimestamp into {} / {_methodName:...} in Firestore.
    const cleaned = cleanForFirestore(input) as Record<string, unknown>
    delete cleaned.createdAt
    delete cleaned.expireAt
    const createdAt = Timestamp.now()
    await addDoc(logsRef(), {
      ...cleaned,
      createdAt,
      expireAt: expireAtFrom(createdAt),
    })
  },

  /**
   * Fetch recent logs, then filter by type/date client-side.
   * Avoids composite-index requirements and empty results when older docs lack createdAt.
   */
  async listRecent(options?: {
    limitCount?: number
    type?: ActivityEventType
    from?: Date
    to?: Date
  }): Promise<ActivityLog[]> {
    const limitCount = options?.limitCount ?? 400
    const fetchLimit = Math.max(limitCount * 2, 500)

    let snaps: QueryDocumentSnapshot[] = []
    try {
      const snapshot = await getDocs(
        query(logsRef(), orderBy('createdAt', 'desc'), limit(fetchLimit))
      )
      snaps = snapshot.docs
      // Docs missing createdAt are omitted by orderBy — fall back so old/broken logs still show
      if (snaps.length === 0) {
        const fallback = await getDocs(query(logsRef(), limit(fetchLimit)))
        snaps = fallback.docs
      }
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      if (code === 'failed-precondition') {
        const snapshot = await getDocs(query(logsRef(), limit(fetchLimit)))
        snaps = snapshot.docs
      } else {
        throw err
      }
    }

    // Prefer unordered fetch when ordered results still have broken timestamps
    // (mixed map/timestamp createdAt values can still return docs).
    const hasBroken = snaps.some((s) => !coerceTimestamp(s.data()?.createdAt))
    if (hasBroken && snaps.length > 0) {
      // Also pull any docs orderBy skipped (missing createdAt entirely)
      const fallback = await getDocs(query(logsRef(), limit(fetchLimit)))
      const byId = new Map(fallback.docs.map((d) => [d.id, d]))
      for (const s of snaps) byId.set(s.id, s)
      snaps = [...byId.values()]
    }

    let docs = await Promise.all(snaps.map(mapActivityDoc))
    docs.sort((a, b) => logCreatedMs(b) - logCreatedMs(a))

    if (options?.type) {
      docs = docs.filter((l) => l.type === options.type)
    }

    if (options?.from || options?.to) {
      const fromMs = options.from?.getTime() ?? 0
      const toMs = options.to?.getTime() ?? Number.POSITIVE_INFINITY
      const inRange = docs.filter((l) => {
        const ms = logCreatedMs(l)
        if (!ms) return true
        return ms >= fromMs && ms <= toMs
      })
      docs = inRange.length > 0 ? inRange : docs
    }

    return docs.slice(0, limitCount)
  },
}

/** Fire-and-forget activity log using the signed-in user. Never throws to callers. */
export function logActivity(
  input: Omit<ActivityLogInput, 'actorUid' | 'actorName' | 'actorEmail' | 'actorRole'> & {
    actorUid?: string
    actorName?: string
    actorEmail?: string
    actorRole?: ActivityLogInput['actorRole']
  }
): void {
  const user = useAuthStore.getState().user
  const payload: ActivityLogInput = {
    ...input,
    actorUid: input.actorUid ?? user?.uid ?? 'unknown',
    actorName: input.actorName ?? (user?.displayName?.trim() || user?.email || 'Unknown user'),
    actorEmail: input.actorEmail ?? user?.email ?? '',
    actorRole: input.actorRole ?? user?.role ?? 'staff',
  }

  void activityLogRepository.create(payload).catch((err) => {
    console.warn('Failed to write activity log', err)
  })
}

export function formatActivityTime(createdAt?: Timestamp | { toDate?: () => Date }): string {
  try {
    const ts = coerceTimestamp(createdAt)
    if (!ts || ts.toMillis() <= 0) return '—'
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ts.toDate())
  } catch {
    return '—'
  }
}

export function activityLogToDate(createdAt?: Timestamp | { toDate?: () => Date }): Date | null {
  const ts = coerceTimestamp(createdAt)
  if (!ts || ts.toMillis() <= 0) return null
  return ts.toDate()
}
