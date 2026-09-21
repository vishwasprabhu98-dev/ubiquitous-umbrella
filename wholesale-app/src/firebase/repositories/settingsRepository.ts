import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore'
import { db } from '@/firebase/config'
import { COLLECTIONS } from '@/firebase/collections'
import type {
  CatalogFilter,
  CatalogFiltersSettings,
  NumberFormatSettings,
  NumberFormatConfig,
  ShopProfile,
} from '@/types'

const SETTINGS_DOC_ID = 'numberFormat'
const SHOP_PROFILE_DOC_ID = 'shopProfile'
const CATALOG_FILTERS_DOC_ID = 'catalogFilters'

export const DEFAULT_SHOP_PROFILE: ShopProfile = {
  name: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  gstNumber: '',
  phone: '',
  email: '',
  upiId: '',
  compositionGstRate: 1,
}

const shopProfileDocRef = () => doc(db, COLLECTIONS.SETTINGS, SHOP_PROFILE_DOC_ID)
const catalogFiltersDocRef = () => doc(db, COLLECTIONS.SETTINGS, CATALOG_FILTERS_DOC_ID)

export const DEFAULT_CATALOG_FILTERS: CatalogFiltersSettings = {
  filters: [],
}

function normalizeCatalogFilters(
  raw: Partial<CatalogFiltersSettings> | undefined
): CatalogFiltersSettings {
  const filters = (raw?.filters ?? [])
    .map((f, index): CatalogFilter | null => {
      if (!f || typeof f !== 'object') return null
      const id = typeof f.id === 'string' ? f.id.trim() : ''
      const label = typeof f.label === 'string' ? f.label.trim() : ''
      if (!id || !label) return null
      return {
        id,
        label,
        sortOrder:
          typeof f.sortOrder === 'number' && Number.isFinite(f.sortOrder)
            ? f.sortOrder
            : index,
      }
    })
    .filter((f): f is CatalogFilter => f != null)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  return { filters }
}

export const DEFAULT_NUMBER_FORMAT: NumberFormatSettings = {
  bill: {
    prefix: 'INV',
    yearFormat: 'YYYY',
    separator: '-',
    startNumber: 1,
    currentNumber: 1,
    suffix: '',
  },
  order: {
    prefix: 'ORD',
    yearFormat: 'YYYY',
    separator: '-',
    startNumber: 1,
    currentNumber: 1,
    suffix: '',
  },
  purchase: {
    prefix: 'PIN',
    yearFormat: 'YYYY',
    separator: '-',
    startNumber: 1,
    currentNumber: 1,
    suffix: '',
  },
}

export function formatNumberPreview(config: NumberFormatConfig, overrideNumber?: number): string {
  const sep = config.separator
  const year = new Date().getFullYear()
  const yearStr =
    config.yearFormat === 'YYYY'
      ? String(year)
      : config.yearFormat === 'YY'
        ? String(year).slice(-2)
        : null

  const num = overrideNumber ?? config.currentNumber
  const numStr = String(num).padStart(6, '0')

  const parts: string[] = []
  if (config.prefix) parts.push(config.prefix)
  if (yearStr) parts.push(yearStr)
  parts.push(numStr)
  if (config.suffix) parts.push(config.suffix)

  return parts.join(sep)
}

const settingsDocRef = () => doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC_ID)

export const settingsRepository = {
  async getNumberFormat(): Promise<NumberFormatSettings> {
    const snapshot = await getDoc(settingsDocRef())
    if (!snapshot.exists()) return DEFAULT_NUMBER_FORMAT
    const data = snapshot.data() as Partial<NumberFormatSettings>
    return {
      bill: data.bill ?? DEFAULT_NUMBER_FORMAT.bill,
      order: data.order ?? DEFAULT_NUMBER_FORMAT.order,
      purchase: data.purchase ?? DEFAULT_NUMBER_FORMAT.purchase,
    }
  },

  async saveNumberFormat(settings: NumberFormatSettings): Promise<void> {
    await setDoc(settingsDocRef(), settings)
  },

  async generateAndIncrementBillNumber(): Promise<string> {
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(settingsDocRef())
      const settings: NumberFormatSettings = snapshot.exists()
        ? (snapshot.data() as NumberFormatSettings)
        : DEFAULT_NUMBER_FORMAT

      const config = settings.bill
      const number = formatNumberPreview(config)

      transaction.set(settingsDocRef(), {
        ...settings,
        bill: { ...config, currentNumber: config.currentNumber + 1 },
      })

      return number
    })
  },

  async getShopProfile(): Promise<ShopProfile> {
    const snapshot = await getDoc(shopProfileDocRef())
    if (!snapshot.exists()) return DEFAULT_SHOP_PROFILE
    return { ...DEFAULT_SHOP_PROFILE, ...(snapshot.data() as ShopProfile) }
  },

  async saveShopProfile(profile: ShopProfile): Promise<void> {
    await setDoc(shopProfileDocRef(), profile)
  },

  async getCatalogFilters(): Promise<CatalogFiltersSettings> {
    const snapshot = await getDoc(catalogFiltersDocRef())
    if (!snapshot.exists()) return DEFAULT_CATALOG_FILTERS
    return normalizeCatalogFilters(snapshot.data() as Partial<CatalogFiltersSettings>)
  },

  async saveCatalogFilters(settings: CatalogFiltersSettings): Promise<void> {
    await setDoc(catalogFiltersDocRef(), normalizeCatalogFilters(settings))
  },

  async generateAndIncrementOrderNumber(): Promise<string> {
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(settingsDocRef())
      const settings: NumberFormatSettings = snapshot.exists()
        ? (snapshot.data() as NumberFormatSettings)
        : DEFAULT_NUMBER_FORMAT

      const config = settings.order
      const number = formatNumberPreview(config)

      transaction.set(settingsDocRef(), {
        ...settings,
        order: { ...config, currentNumber: config.currentNumber + 1 },
      })

      return number
    })
  },

  async generateAndIncrementPurchaseNumber(): Promise<string> {
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(settingsDocRef())
      const settings: NumberFormatSettings = snapshot.exists()
        ? ({
            ...DEFAULT_NUMBER_FORMAT,
            ...(snapshot.data() as NumberFormatSettings),
            purchase:
              (snapshot.data() as NumberFormatSettings).purchase ?? DEFAULT_NUMBER_FORMAT.purchase,
          })
        : DEFAULT_NUMBER_FORMAT

      const config = settings.purchase
      const number = formatNumberPreview(config)

      transaction.set(settingsDocRef(), {
        ...settings,
        purchase: { ...config, currentNumber: config.currentNumber + 1 },
      })

      return number
    })
  },
}
