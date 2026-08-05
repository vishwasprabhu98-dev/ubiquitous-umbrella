import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface NumericInputProps {
  value: number
  onChange: (n: number) => void
  onBlur?: () => void
  name?: string
  className?: string
  placeholder?: string
  disabled?: boolean
}

/**
 * A text-based numeric input that:
 *  - Shows the decimal keyboard on mobile (inputMode="decimal")
 *  - Keeps intermediate states like "5." while typing
 *  - Syncs back to a number in RHF state on every keystroke
 *  - Re-syncs display when the value is changed externally (e.g. setValue from product select)
 */
export function NumericInput({ value, onChange, onBlur, name, className, placeholder = '0', disabled }: NumericInputProps) {
  const [text, setText] = useState(() => (value === 0 || value == null ? '' : String(value)))
  const externalRef = useRef(value)

  // When the parent/RHF sets a new value from outside (product select, reset, etc.)
  useEffect(() => {
    if (externalRef.current !== value) {
      externalRef.current = value
      setText(value === 0 || value == null ? '' : String(value))
    }
  }, [value])

  return (
    <input
      type="text"
      inputMode="decimal"
      name={name}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      onFocus={(e) => {
        // Select all so typing replaces the value (especially on mobile)
        e.target.select()
      }}
      onChange={(e) => {
        const raw = e.target.value
        // Allow digits, single leading minus, and at most one decimal point
        if (raw !== '' && !/^-?[0-9]*\.?[0-9]*$/.test(raw)) return
        setText(raw)
        externalRef.current = parseFloat(raw) || 0
        onChange(parseFloat(raw) || 0)
      }}
      onBlur={() => {
        const num = parseFloat(text)
        const normalized = isNaN(num) ? 0 : num
        externalRef.current = normalized
        setText(normalized === 0 ? '' : String(normalized))
        onChange(normalized)
        onBlur?.()
      }}
    />
  )
}
