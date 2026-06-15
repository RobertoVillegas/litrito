import { Toast } from '@base-ui/react/toast'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '#/lib/utils'

// Hook to trigger toasts from anywhere inside <ToastProvider>:
//   const toast = useToast()
//   toast.add({ title: 'Listo', description: '…', type: 'success' })
export const useToast = Toast.useToastManager

// Wrap the app once (in __root) so any descendant can call useToast(), and so the
// viewport renders in a portal above everything.
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed bottom-4 right-4 z-[2000] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

const ACCENT: Record<string, string> = {
  success: 'border-l-4 border-l-emerald-500',
  error: 'border-l-4 border-l-brand',
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      className={cn(
        'flex items-start gap-3 rounded-[8px] border border-line bg-white px-4 py-3 shadow-lg',
        'data-[ending]:opacity-0 data-[starting]:opacity-0 transition-opacity',
        toast.type && ACCENT[toast.type],
      )}
    >
      <Toast.Content className="min-w-0 flex-1">
        <Toast.Title className="text-sm font-semibold text-ink" />
        <Toast.Description className="mt-0.5 text-sm text-body" />
      </Toast.Content>
      <Toast.Close
        aria-label="Cerrar"
        className="-mr-1 shrink-0 rounded-[6px] p-1 text-body transition-colors hover:bg-canvas-soft hover:text-ink"
      >
        <X className="h-4 w-4" />
      </Toast.Close>
    </Toast.Root>
  ))
}
