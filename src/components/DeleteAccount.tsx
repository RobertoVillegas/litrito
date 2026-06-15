import { Dialog } from '@base-ui/react/dialog'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useState } from 'react'
import { MoreHorizontal, Trash2, X } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { authClient } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { useToast } from '#/components/ui/toast'

// Self-service account deletion. Kept behind a reveal ("Opciones avanzadas") and
// a type-your-email confirmation so it can't be triggered by a misclick. The
// actual deletion is deferred 15 days by the backend; this only schedules it.
export function DeleteAccount({ email }: { email: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const requestDeletion = useMutation(api.accountDeletion.request)
  const [revealed, setRevealed] = useState(false)
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const matches = confirm.trim().toLowerCase() === email.trim().toLowerCase()

  async function handleDelete() {
    if (!matches || submitting) return
    setSubmitting(true)
    try {
      await requestDeletion({})
      await authClient.signOut()
      toast.add({
        title: 'Eliminación programada',
        description:
          'Te enviamos un correo. Tienes 15 días para cancelar: solo inicia sesión de nuevo.',
        type: 'success',
      })
      void navigate({ to: '/', replace: true })
    } catch {
      setSubmitting(false)
      toast.add({
        title: 'No se pudo procesar la solicitud',
        description: 'Inténtalo de nuevo en un momento.',
        type: 'error',
      })
    }
  }

  if (!revealed) {
    return (
      <div className="pt-8">
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-body/60 transition hover:text-body"
        >
          <MoreHorizontal className="h-4 w-4" />
          Opciones avanzadas
        </button>
      </div>
    )
  }

  return (
    <div className="mt-8 rounded-[6px] border border-line border-l-4 border-l-brand bg-canvas-soft p-4">
      <h3 className="font-display text-lg text-ink">Zona de peligro</h3>
      <p className="mt-1 text-sm leading-6 text-body">
        Eliminar tu cuenta borra de forma permanente tu perfil y tus favoritos. Hay un
        periodo de 15 días para cancelar antes de que se complete.
      </p>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger
          render={
            <Button variant="outline-red" className="mt-3">
              <Trash2 className="h-4 w-4" />
              Eliminar mi cuenta
            </Button>
          }
        />
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

            <div className="mt-4">
              <Input
                id="delete-confirm"
                name="delete-confirm"
                type="email"
                autoComplete="off"
                label={`Escribe ${email} para confirmar`}
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
    </div>
  )
}
