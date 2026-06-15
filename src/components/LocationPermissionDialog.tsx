import { Dialog } from '@base-ui/react/dialog'
import { LocateFixed, MapPin, Settings, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import {
  useUserLocation,
  type LocationRequestIntent,
} from '#/lib/useUserLocation'
import type { PreciseLocationPermissionState } from '#/lib/location/service'

type LocationPermissionDialogProps = {
  open: boolean
  permission: PreciseLocationPermissionState
  onOpenChange: (open: boolean) => void
}

export function LocationPermissionDialog({
  open,
  permission,
  onOpenChange,
}: LocationPermissionDialogProps) {
  const userLoc = useUserLocation()
  const [requesting, setRequesting] = useState(false)
  const blocked =
    permission === 'denied' ||
    permission === 'insecure' ||
    permission === 'unsupported'

  const title = blocked
    ? 'Activa tu ubicación precisa'
    : 'Usar tu ubicación precisa'
  const description = blocked
    ? blockedDescription(permission)
    : 'Litrito la usa solo para ordenar estaciones cercanas y calcular distancias. Tu ubicación aproximada por ciudad seguirá funcionando si prefieres no compartirla.'

  async function handleConfirm() {
    if (blocked) return
    setRequesting(true)
    const result = await userLoc.requestPrecise()
    setRequesting(false)
    if (result.status === 'requesting') {
      onOpenChange(false)
      return
    }
    onOpenChange(true)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[1600] bg-ink/55 backdrop-blur-[2px] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[1601] w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-[8px] border border-line bg-white p-5 text-ink outline-none transition-[opacity,transform] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-brand text-white">
              <LocateFixed className="h-5 w-5" />
            </div>
            <Dialog.Close
              aria-label="Cerrar"
              className="-mr-1 -mt-1 rounded-[6px] p-1.5 text-body transition hover:bg-canvas-soft hover:text-ink"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <Dialog.Title className="font-display mt-4 text-3xl leading-none text-ink">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm font-semibold leading-6 text-body">
            {description}
          </Dialog.Description>

          <div className="mt-4 rounded-[6px] border border-line bg-canvas-soft p-3">
            <div className="flex gap-2 text-xs font-bold text-ink">
              {blocked ? (
                <Settings className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              ) : (
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              )}
              <div className="space-y-1.5">
                {blocked ? (
                  blockedSteps(permission).map((step) => <p key={step}>{step}</p>)
                ) : (
                  <>
                    <p>El navegador mostrará su propio aviso de permiso.</p>
                    <p>Si eliges “Bloquear”, puedes seguir usando búsqueda por ciudad o estado.</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-2">
            {!blocked && (
              <Button
                fullWidth
                className="justify-center"
                onClick={handleConfirm}
                disabled={requesting}
              >
                <LocateFixed className="h-4 w-4" />
                {requesting ? 'Solicitando…' : 'Continuar'}
              </Button>
            )}
            <Dialog.Close
              render={
                <Button
                  variant={blocked ? 'primary' : 'outline'}
                  fullWidth
                  className="justify-center"
                />
              }
            >
              {blocked ? 'Entendido' : 'Ahora no'}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function useLocationPermissionFlow() {
  const userLoc = useUserLocation()
  const [dialog, setDialog] = useState<{
    open: boolean
    permission: PreciseLocationPermissionState
  }>({ open: false, permission: 'unknown' })

  async function requestWithExplanation() {
    if (userLoc.hasPreciseLocation) {
      await userLoc.requestPrecise()
      return
    }
    const intent: LocationRequestIntent = await userLoc.preparePreciseRequest()
    if (intent.action === 'request') {
      await userLoc.requestPrecise()
      return
    }
    setDialog({ open: true, permission: intent.permission })
  }

  const dialogElement = (
    <LocationPermissionDialog
      open={dialog.open}
      permission={dialog.permission}
      onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
    />
  )

  return { requestWithExplanation, dialogElement }
}

function blockedDescription(permission: PreciseLocationPermissionState) {
  if (permission === 'insecure') {
    return 'Tu navegador solo permite ubicación precisa en HTTPS o localhost.'
  }
  if (permission === 'unsupported') {
    return 'Este navegador no expone geolocalización precisa para sitios web.'
  }
  return 'El navegador tiene bloqueado el permiso de ubicación para Litrito. Por privacidad, el sitio no puede volver a mostrar el aviso nativo hasta que cambies ese permiso.'
}

function blockedSteps(permission: PreciseLocationPermissionState) {
  if (permission === 'insecure') {
    return ['Abre Litrito usando HTTPS.', 'En desarrollo, localhost también es válido.']
  }
  if (permission === 'unsupported') {
    return ['Prueba con Chrome, Safari, Firefox o Edge actualizados.', 'También puedes buscar por estado, municipio o nombre de estación.']
  }
  return [
    'Abre los ajustes del sitio desde el candado o icono junto a la URL.',
    'Cambia Ubicación a Permitir.',
    'Vuelve a Litrito y toca “Usar mi ubicación” otra vez.',
  ]
}
