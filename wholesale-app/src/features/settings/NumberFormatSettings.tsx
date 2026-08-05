import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Hash, RefreshCw, Save, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { settingsRepository, formatNumberPreview, DEFAULT_NUMBER_FORMAT } from '@/firebase/repositories/settingsRepository'
import type { NumberFormatConfig, NumberFormatSettings, YearFormat, SeparatorChar } from '@/types'

const YEAR_FORMAT_OPTIONS: { value: YearFormat; label: string }[] = [
  { value: 'YYYY', label: 'Full year (2026)' },
  { value: 'YY', label: 'Short year (26)' },
  { value: 'none', label: 'No year' },
]

const SEPARATOR_OPTIONS: { value: SeparatorChar; label: string }[] = [
  { value: '-', label: 'Hyphen  ( - )' },
  { value: '/', label: 'Slash  ( / )' },
  { value: '.', label: 'Dot  ( . )' },
  { value: '_', label: 'Underscore  ( _ )' },
  { value: '', label: 'None (no separator)' },
]

interface FormatSectionProps {
  label: string
  config: NumberFormatConfig
  onChange: (updated: NumberFormatConfig) => void
  onReset: () => void
}

function FormatSection({ label, config, onChange, onReset }: FormatSectionProps) {
  const preview = formatNumberPreview(config, config.startNumber)

  function set<K extends keyof NumberFormatConfig>(key: K, value: NumberFormatConfig[K]) {
    onChange({ ...config, [key]: value })
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <Hash className="h-4 w-4 text-indigo-500" />
        {label}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Prefix</Label>
          <Input
            value={config.prefix}
            onChange={(e) => set('prefix', e.target.value.toUpperCase())}
            placeholder="e.g. INV"
            maxLength={10}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Year Format</Label>
          <Select
            value={config.yearFormat}
            onValueChange={(v) => set('yearFormat', v as YearFormat)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_FORMAT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Separator</Label>
          <Select
            value={config.separator}
            onValueChange={(v) => set('separator', v as SeparatorChar)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEPARATOR_OPTIONS.map((opt) => (
                <SelectItem key={`sep-${opt.value}`} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Suffix <span className="text-gray-400 text-xs">(optional)</span></Label>
          <Input
            value={config.suffix}
            onChange={(e) => set('suffix', e.target.value)}
            placeholder="e.g. GST, A"
            maxLength={10}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Starting Number</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={config.startNumber}
            onChange={(e) => {
              const val = Math.max(1, parseInt(e.target.value) || 1)
              set('startNumber', val)
            }}
            className="max-w-[160px]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReset}
            className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset counter to start
          </Button>
        </div>
        <p className="text-xs text-gray-400">
          Current counter: <span className="font-mono font-medium text-gray-600 dark:text-gray-300">{config.currentNumber}</span>
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-3 flex items-center gap-3">
        <Eye className="h-4 w-4 text-indigo-500 shrink-0" />
        <div>
          <p className="text-xs text-indigo-500 dark:text-indigo-400 font-medium mb-0.5">Preview</p>
          <p className="font-mono font-semibold text-indigo-700 dark:text-indigo-300 text-sm tracking-wide">
            {preview}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function NumberFormatSettings() {
  const queryClient = useQueryClient()

  const { data: savedSettings, isLoading } = useQuery({
    queryKey: ['settings', 'numberFormat'],
    queryFn: () => settingsRepository.getNumberFormat(),
  })

  const [localSettings, setLocalSettings] = useState<NumberFormatSettings>(DEFAULT_NUMBER_FORMAT)

  useEffect(() => {
    if (savedSettings) setLocalSettings(savedSettings)
  }, [savedSettings])

  const saveMutation = useMutation({
    mutationFn: (settings: NumberFormatSettings) =>
      settingsRepository.saveNumberFormat(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'numberFormat'] })
    },
  })

  const updateBill = useCallback(
    (updated: NumberFormatConfig) =>
      setLocalSettings((prev) => ({ ...prev, bill: updated })),
    []
  )

  const updateOrder = useCallback(
    (updated: NumberFormatConfig) =>
      setLocalSettings((prev) => ({ ...prev, order: updated })),
    []
  )

  const updatePurchase = useCallback(
    (updated: NumberFormatConfig) =>
      setLocalSettings((prev) => ({ ...prev, purchase: updated })),
    []
  )

  const resetBillCounter = useCallback(() => {
    setLocalSettings((prev) => ({
      ...prev,
      bill: { ...prev.bill, currentNumber: prev.bill.startNumber },
    }))
  }, [])

  const resetOrderCounter = useCallback(() => {
    setLocalSettings((prev) => ({
      ...prev,
      order: { ...prev.order, currentNumber: prev.order.startNumber },
    }))
  }, [])

  const resetPurchaseCounter = useCallback(() => {
    setLocalSettings((prev) => ({
      ...prev,
      purchase: { ...prev.purchase, currentNumber: prev.purchase.startNumber },
    }))
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Number Format</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Configure how bill, order, and purchase invoice numbers are generated. Numbers are auto-incremented and stored in the database.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5 bg-white dark:bg-[#252d3d]/60 border-gray-200 dark:border-[#2a3040]">
          <FormatSection
            label="Bill Numbers"
            config={localSettings.bill}
            onChange={updateBill}
            onReset={resetBillCounter}
          />
        </Card>

        <Card className="p-5 bg-white dark:bg-[#252d3d]/60 border-gray-200 dark:border-[#2a3040]">
          <FormatSection
            label="Order Numbers"
            config={localSettings.order}
            onChange={updateOrder}
            onReset={resetOrderCounter}
          />
        </Card>

        <Card className="p-5 bg-white dark:bg-[#252d3d]/60 border-gray-200 dark:border-[#2a3040]">
          <FormatSection
            label="Purchase Invoice Numbers"
            config={localSettings.purchase}
            onChange={updatePurchase}
            onReset={resetPurchaseCounter}
          />
        </Card>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Saving will apply to all new bills, orders, and purchase invoices created after this point.
        </p>
        <Button
          onClick={() => saveMutation.mutate(localSettings)}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 ml-4"
        >
          {saveMutation.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Format
        </Button>
      </div>

      {saveMutation.isSuccess && (
        <p className="text-sm text-green-600 dark:text-green-400 text-center">
          Number format saved successfully.
        </p>
      )}
      {saveMutation.isError && (
        <p className="text-sm text-red-600 dark:text-red-400 text-center">
          Failed to save. Please try again.
        </p>
      )}
    </div>
  )
}
