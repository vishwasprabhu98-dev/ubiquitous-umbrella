import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/** Shared classes for large scrollable forms (bill / order) on iPhone Safari. */
export const mobileFormDialogClassName = cn(
  'flex flex-col gap-0 overflow-hidden p-0',
  // Mobile: bottom sheet — avoid top/translate centering (breaks scroll + keyboard on iOS)
  'max-sm:fixed max-sm:inset-x-0 max-sm:left-0 max-sm:top-auto max-sm:bottom-0',
  'max-sm:h-[min(94dvh,100%)] max-sm:max-h-[min(94dvh,100%)] max-sm:w-full max-sm:max-w-none',
  'max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl',
  'max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]',
  'max-sm:transition-[bottom,max-height] max-sm:duration-200 max-sm:ease-out',
  // Desktop: keep room to scroll inside
  'sm:max-h-[min(95dvh,900px)]'
)

export const mobileFormDialogBodyClassName =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] px-4 py-4 sm:px-6 space-y-6'

export const mobileFormDialogFooterClassName =
  'shrink-0 border-t border-border bg-background px-4 py-3 sm:px-6'

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    overlayClassName?: string
  }
>(({ className, children, overlayClassName, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-[51] grid w-[calc(100%-1.5rem)] max-w-lg gap-4 rounded-lg border border-border bg-background p-4 sm:p-6 text-foreground shadow-xl',
        // Mobile: top-anchored (not vertical-centered) — iOS Safari + keyboard break -translate-y-1/2 scroll
        'left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] -translate-x-1/2 translate-y-0',
        'max-h-[min(92dvh,calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]',
        'overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]',
        // Desktop: centered modal
        'sm:top-1/2 sm:-translate-y-1/2',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // Stack top→bottom on mobile (no reverse); row on desktop
      'flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-end',
      // Touch-friendly action buttons on mobile; compact on sm+
      '[&>button]:h-11 [&>button]:w-full [&>button]:text-sm sm:[&>button]:h-9 sm:[&>button]:w-auto',
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
