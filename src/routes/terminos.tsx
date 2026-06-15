import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import { SiteFooter } from '../components/SiteFooter'
import { buildSeoMeta } from '../lib/seo'
import { getConfiguredSiteOrigin } from '../lib/site-url'

const UPDATED_AT = '15 de junio de 2026'

export const Route = createFileRoute('/terminos')({
  head: () => {
    const title = 'Términos de servicio - Litrito'
    const description =
      'Reglas de uso de Litrito, disponibilidad, datos de precios, cuentas y limitación de responsabilidad.'
    const origin = getConfiguredSiteOrigin()
    const url = origin ? `${origin}/terminos` : undefined
    return {
      meta: buildSeoMeta({
        title,
        description,
        image: {
          title: 'Términos de servicio de Litrito.',
          subtitle: 'Reglas de uso para comparar precios de gasolina.',
        },
        url,
      }),
      ...(url ? { links: [{ rel: 'canonical', href: url }] } : {}),
    }
  },
  component: TermsPage,
})

function TermsPage() {
  return (
    <main className="min-h-screen">
      <LegalHero
        eyebrow="Términos"
        title="Términos de servicio"
        subtitle="Estas reglas explican cómo puedes usar Litrito y qué esperar de la información que mostramos."
      />

      <LegalBody>
        <p>
          Estos términos aplican al sitio y aplicación web Litrito, disponible en
          litrito.com. Al usar Litrito aceptas estos términos. Si no estás de
          acuerdo, no uses el servicio.
        </p>
        <p>
          Estos términos se rigen por las leyes federales aplicables de México.
          En materia de datos personales, el tratamiento se rige por nuestro aviso
          de privacidad y por la Ley Federal de Protección de Datos Personales en
          Posesión de los Particulares (LFPDPPP), cuando resulte aplicable.
        </p>

        <h2>Qué es Litrito</h2>
        <p>
          Litrito es una herramienta informativa para consultar y comparar precios
          de gasolina y diésel en México. Mostramos datos reportados por
          permisionarios y/o publicados por autoridades energéticas, junto con
          herramientas de búsqueda, mapa, favoritos y ordenamiento por precio o
          distancia.
        </p>

        <h2>Información de precios</h2>
        <p>
          Los precios se muestran de forma informativa. Aunque trabajamos para
          mantenerlos actualizados, pueden existir retrasos, errores de captura,
          cambios en estación o diferencias respecto al precio final cobrado. Antes
          de cargar combustible, verifica el precio directamente en la estación.
        </p>
        <p>
          Litrito no vende combustible, no opera estaciones y no garantiza que una
          estación mantenga disponibilidad, precio, horario o servicio.
        </p>

        <h2>Cuentas e inicio de sesión</h2>
        <p>
          Puedes usar ciertas funciones sin cuenta. Para guardar favoritos u otras
          preferencias podemos pedirte iniciar sesión con email y contraseña o,
          cuando esté disponible, con proveedores como Google o Facebook.
        </p>
        <p>
          Eres responsable de mantener segura tu cuenta y de la actividad que
          ocurra desde ella. Si detectas uso no autorizado, escríbenos a
          <a href="mailto:hola@athas.mx"> hola@athas.mx</a>.
        </p>
        <p>
          Puedes solicitar la eliminación de tu cuenta y datos en cualquier
          momento desde <Link to="/eliminar-datos">Eliminar tus datos</Link>.
        </p>

        <h2>Uso permitido</h2>
        <ul>
          <li>Usa Litrito para fines personales, informativos o de comparación legítima.</li>
          <li>No intentes vulnerar, sobrecargar, raspar masivamente o interferir con el servicio.</li>
          <li>No uses Litrito para publicar información falsa, abusiva o ilegal.</li>
          <li>No extraigas datos para crear un servicio competidor sin autorización.</li>
        </ul>

        <h2>Ubicación y mapas</h2>
        <p>
          Las funciones de ubicación y distancia son aproximadas. La ubicación
          precisa depende del permiso del navegador, de tu dispositivo y de redes
          disponibles. Las rutas o indicaciones externas pueden abrir servicios de
          terceros, sujetos a sus propios términos.
        </p>

        <h2>Disponibilidad</h2>
        <p>
          Podemos modificar, suspender o descontinuar partes de Litrito en cualquier
          momento. Intentamos mantener el servicio disponible, pero no garantizamos
          operación continua, libre de errores o sin interrupciones.
        </p>

        <h2>Propiedad intelectual</h2>
        <p>
          Litrito, su diseño, marca, interfaz y código pertenecen a Athas o a sus
          respectivos titulares. Los datos públicos de precios y estaciones
          conservan la naturaleza y atribución de sus fuentes originales.
        </p>

        <h2>Limitación de responsabilidad</h2>
        <p>
          Litrito se ofrece “tal cual” y “según disponibilidad”. En la máxima
          medida permitida por la ley, no somos responsables por pérdidas,
          decisiones de compra, gastos, daños indirectos o diferencias de precio
          derivadas del uso de la información mostrada.
        </p>

        <h2>Privacidad</h2>
        <p>
          El uso de datos personales se describe en nuestro{' '}
          <Link to="/privacidad">Aviso de privacidad</Link>. Ese aviso forma
          parte de estos términos y explica tus derechos ARCO, revocación de
          consentimiento, ubicación, cuenta e inicio de sesión con proveedores
          como Google o Facebook.
        </p>

        <h2>Ley aplicable</h2>
        <p>
          Estos términos y cualquier controversia relacionada con Litrito se
          interpretarán conforme a las leyes aplicables de México. Antes de
          cualquier disputa formal, buscaremos resolver dudas o reclamaciones por
          medio de <a href="mailto:hola@athas.mx">hola@athas.mx</a>.
        </p>

        <h2>Cambios a estos términos</h2>
        <p>
          Podemos actualizar estos términos cuando cambie el producto, la operación
          o la ley aplicable. La versión vigente estará publicada en esta página.
          Si sigues usando Litrito después de un cambio, entendemos que aceptas la
          versión actualizada.
        </p>

        <h2>Contacto</h2>
        <p>
          Para dudas sobre estos términos, privacidad o el funcionamiento de
          Litrito, escríbenos a <a href="mailto:hola@athas.mx">hola@athas.mx</a>.
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
            <FileText className="h-4 w-4" />
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
