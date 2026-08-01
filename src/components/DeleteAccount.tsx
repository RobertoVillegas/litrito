import { Dialog } from '@base-ui/react/dialog'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { MoreHorizontal, Trash2, X } from 'lucide-react'
import { requestAccountDeletion } from '#/features/community/transport/server-functions'
import { authClient } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { useToast } from '#/components/ui/toast'

// Account options trigger (a "···" button meant to sit next to "Cerrar sesión")
// that opens the delete-account modal. Deletion needs a type-your-email
// confirmation so it can't happen on a misclick; the backend defers the actual
// deletion 15 days.
export function DeleteAccount({ email }: { email: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const matches = confirm.trim().toLowerCase() === email.trim().toLowerCase()

  async function handleDelete() {
    if (!matches || submitting) return
    setSubmitting(true)
    try {
      await requestAccountDeletion()
      setOpen(false)
      // Leave the profile first so it never renders signed-out, then drop the
      // session. The success toast persists across the navigation.
      void navigate({ to: '/', replace: true })
      await authClient.signOut()
      toast.add({
        title: 'Eliminación programada',
        description:
          'Te enviamos un correo. Tienes 15 días para cancelar: solo inicia sesión de nuevo.',
        type: 'success',
      })
    } catch {
      setSubmitting(false)
      toast.add({
        title: 'No se pudo procesar la solicitud',
        description: 'Inténtalo de nuevo en un momento.',
        type: 'error',
      })
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setConfirm('')
      }}
    >
      <Dialog.Trigger
        aria-label="Opciones de cuenta"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[1600] bg-ink/55 backdrop-blur-[2px] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[1601] w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-[8px] border border-line bg-white p-5 text-ink outline-none transition-[opacity,transform] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-brand text-white">
              <Trash2 className="h-5 w-5" />
            </div>
            <Dialog.Close
              aria-label="Cerrar"
              className="-mr-1 -mt-1 rounded-[6px] p-1.5 text-body transition hover:bg-canvas-soft hover:text-ink"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <Dialog.Title className="font-display mt-4 text-3xl leading-none text-ink">
            Eliminar tu cuenta
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm font-semibold leading-6 text-body">
            Esto programará la eliminación permanente de tu cuenta y tus datos en 15
            días. Puedes cancelar antes iniciando sesión de nuevo.
          </Dialog.Description>

          <p className="mt-4 text-sm font-semibold leading-6 text-body">
            Para confirmar, escribe{' '}
            <code className="rounded-[4px] border border-line bg-canvas-soft px-1.5 py-0.5 font-mono text-[13px] text-ink">
              {email}
            </code>
          </p>
          <div className="mt-2">
            <Input
              id="delete-confirm"
              name="delete-confirm"
              type="email"
              autoComplete="off"
              label="Escribe tu correo para confirmar"
              hideLabel
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={email}
            />
          </div>

          <div className="mt-5 grid gap-2">
            <Button
              variant="primary"
              fullWidth
              className="justify-center"
              disabled={!matches || submitting}
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              {submitting ? 'Procesando…' : 'Eliminar mi cuenta'}
            </Button>
            <Dialog.Close render={<Button variant="outline" fullWidth className="justify-center" />}>
              Cancelar
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
