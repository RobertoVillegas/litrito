import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { SiteFooter } from '../components/SiteFooter'
import { Button } from '../components/ui/button'
import { buildSeoMeta } from '../lib/seo'
import { getConfiguredSiteOrigin } from '../lib/site-url'

const UPDATED_AT = '14 de junio de 2026'
const CONTACT_EMAIL = 'hola@litrito.mx'

// Prefill a deletion request so the user only has to confirm and send.
const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  'Solicitud de eliminación de datos',
)}&body=${encodeURIComponent(
  'Hola, quiero solicitar la eliminación de mi cuenta y mis datos en Litrito.\n\n' +
    'Correo asociado a mi cuenta: \n' +
    'Método de inicio de sesión (email, Google o Facebook): \n',
)}`

export const Route = createFileRoute('/eliminar-datos')({
  head: () => {
    const title = 'Eliminar tus datos - Litrito'
    const description =
      'Cómo solicitar la eliminación de tu cuenta y tus datos personales en Litrito.'
    const origin = getConfiguredSiteOrigin()
    const url = origin ? `${origin}/eliminar-datos` : undefined
    return {
      meta: buildSeoMeta({
        title,
        description,
        image: {
          title: 'Eliminar tus datos en Litrito.',
          subtitle: 'Solicita borrar tu cuenta y tu información.',
        },
        url,
      }),
      ...(url ? { links: [{ rel: 'canonical', href: url }] } : {}),
    }
  },
  component: DeleteDataPage,
})

function DeleteDataPage() {
  return (
    <main className="min-h-screen">
      <LegalHero
        eyebrow="Datos"
        title="Eliminar tus datos"
        subtitle="Puedes pedir que borremos tu cuenta y los datos personales asociados a ella en cualquier momento."
      />

      <LegalBody>
        <p>
          Litrito guarda muy pocos datos personales: tu cuenta (nombre, correo e
          identificador), tus estaciones favoritas y datos técnicos básicos de
          uso. Si quieres que eliminemos esa información, sigue estos pasos.
        </p>

        <h2>Cómo solicitar la eliminación</h2>
        <ol>
          <li>
            Escríbenos a{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> desde el
            correo asociado a tu cuenta, o incluye datos suficientes para
            identificarte.
          </li>
          <li>
            Indica que deseas eliminar tu cuenta y tus datos, y con qué método
            iniciaste sesión (email, Google o Facebook).
          </li>
          <li>
            Podemos pedirte información adicional solo para confirmar tu
            identidad y proteger tu cuenta.
          </li>
        </ol>

        <div className="not-prose my-8">
          <Button render={<a href={MAILTO} />} variant="primary">
            <Trash2 className="h-4 w-4" />
            Solicitar eliminación de datos
          </Button>
        </div>

        <h2>Qué eliminamos</h2>
        <p>Al confirmar tu solicitud eliminamos:</p>
        <ul>
          <li>Tu cuenta y datos de perfil (nombre, correo, identificador).</li>
          <li>Tus estaciones favoritas y preferencias guardadas.</li>
          <li>
            La vinculación con tu proveedor de inicio de sesión social (Google o
            Facebook), si aplica.
          </li>
        </ul>

        <h2>Plazos</h2>
        <p>
          Atendemos las solicitudes en un plazo razonable, normalmente dentro de
          30 días naturales. Podemos conservar cierta información cuando sea
          necesario para cumplir obligaciones legales, resolver controversias o
          prevenir abuso, y la eliminaremos una vez que deje de ser necesaria.
        </p>

        <h2>Inicio de sesión con Google o Facebook</h2>
        <p>
          Si iniciaste sesión con Google o Facebook, eliminar tus datos en
          Litrito no borra tu cuenta de Google o Facebook. También puedes
          revocar el acceso de Litrito desde la configuración de aplicaciones de
          cada proveedor.
        </p>

        <p>
          Para más detalle sobre qué datos tratamos y tus derechos ARCO, consulta
          nuestro <Link to="/privacidad">aviso de privacidad</Link>.
        </p>

        <p className="text-sm font-bold text-body">Última actualización: {UPDATED_AT}.</p>
      </LegalBody>

      <SiteFooter />
    </main>
  )
}

function LegalHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle: string
}) {
  return (
    <section className="bg-ink text-on-dark">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white/60 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a Litrito
          </Link>
          <div className="eyebrow inline-flex shrink-0 items-center gap-2 rounded-[32px] bg-brand px-3 py-1.5 text-white">
            <Trash2 className="h-4 w-4" />
            {eyebrow}
          </div>
        </div>
        <h1 className="font-display mt-6 text-5xl text-white sm:text-7xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-lg font-light leading-8 text-white/70">
          {subtitle}
        </p>
      </div>
    </section>
  )
}

function LegalBody({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="prose prose-slate max-w-none prose-headings:font-display prose-headings:text-ink prose-a:font-semibold prose-a:text-brand prose-li:marker:text-brand">
        {children}
      </div>
    </section>
  )
}
