import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { SiteFooter } from '../components/SiteFooter'
import { buildSeoMeta } from '../lib/seo'
import { getConfiguredSiteOrigin } from '../lib/site-url'

const UPDATED_AT = '15 de junio de 2026'

export const Route = createFileRoute('/privacidad')({
  head: () => {
    const title = 'Aviso de privacidad - Litrito'
    const description =
      'Cómo Litrito usa datos de cuenta, ubicación, favoritos, analítica y proveedores de autenticación social.'
    const origin = getConfiguredSiteOrigin()
    const url = origin ? `${origin}/privacidad` : undefined
    return {
      meta: buildSeoMeta({
        title,
        description,
        image: {
          title: 'Aviso de privacidad de Litrito.',
          subtitle: 'Datos mínimos para comparar precios de gasolina.',
        },
        url,
      }),
      ...(url ? { links: [{ rel: 'canonical', href: url }] } : {}),
    }
  },
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <LegalHero
        eyebrow="Privacidad"
        title="Aviso de privacidad"
        subtitle="Explicamos qué datos usamos para operar Litrito, cómo los protegemos y qué control tienes sobre ellos."
      />

      <LegalBody>
        <p>
          Esta política aplica al sitio y aplicación web Litrito, disponible en
          litrito.com. Litrito es operado por Athas. Para dudas sobre privacidad
          puedes escribir a <a href="mailto:hola@athas.mx">hola@athas.mx</a>.
        </p>
        <p>
          Este aviso se emite conforme a la Ley Federal de Protección de Datos
          Personales en Posesión de los Particulares (LFPDPPP), su reglamento y
          demás disposiciones aplicables en México.
        </p>

        <h2>Responsable del tratamiento</h2>
        <p>
          Athas es responsable del tratamiento de los datos personales que se
          recaben a través de Litrito. Nuestro medio de contacto para privacidad
          y datos personales es <a href="mailto:hola@athas.mx">hola@athas.mx</a>.
        </p>

        <h2>Datos que recopilamos</h2>
        <p>
          Usamos la menor cantidad de datos posible para que Litrito funcione.
          Podemos tratar los siguientes datos:
        </p>
        <ul>
          <li>Datos de cuenta, como nombre, correo electrónico e identificador de usuario.</li>
          <li>Datos de inicio de sesión, incluyendo si entras con email, Google o Facebook.</li>
          <li>Favoritos guardados, como estaciones que marcas para consultarlas después.</li>
          <li>Ubicación aproximada por IP para mostrar resultados relevantes de forma inicial.</li>
          <li>Ubicación precisa solo cuando la autorizas en el navegador.</li>
          <li>Datos técnicos y de uso, como navegador, errores, páginas visitadas y eventos básicos.</li>
        </ul>

        <h2>Inicio de sesión con Google o Facebook</h2>
        <p>
          Si eliges iniciar sesión con Google o Facebook, esos proveedores nos
          comparten datos básicos necesarios para crear o acceder a tu cuenta,
          normalmente nombre, correo electrónico, foto de perfil e identificador
          del proveedor. No recibimos tu contraseña de Google o Facebook.
        </p>
        <p>
          El uso de Google o Facebook también está sujeto a sus propias políticas
          de privacidad y controles de cuenta.
        </p>

        <h2>Ubicación</h2>
        <p>
          Litrito puede usar una ubicación aproximada para ordenar o sugerir
          resultados cercanos. La ubicación precisa requiere permiso explícito
          del navegador. La usamos para centrar el mapa, ordenar estaciones por
          distancia y calcular distancias aproximadas.
        </p>
        <p>
          Puedes negar o revocar el permiso desde los ajustes del navegador. Si
          no compartes ubicación precisa, puedes seguir usando búsqueda por
          estado, municipio, estación o mapa.
        </p>

        <h2>Para qué usamos tus datos</h2>
        <p>Usamos tus datos para las siguientes finalidades primarias:</p>
        <ul>
          <li>Operar la cuenta, sesión y funciones guardadas.</li>
          <li>Mostrar estaciones, favoritos, precios y mapas.</li>
          <li>Ordenar resultados por cercanía cuando lo solicitas.</li>
          <li>Detectar errores, abuso, fallas de seguridad y problemas de rendimiento.</li>
        </ul>
        <p>También podemos usarlos para finalidades secundarias:</p>
        <ul>
          <li>Entender uso agregado de la aplicación para mejorar el producto.</li>
        </ul>
        <p>
          Puedes oponerte a finalidades secundarias escribiendo a
          <a href="mailto:hola@athas.mx"> hola@athas.mx</a>. Litrito seguirá
          funcionando, aunque algunas mediciones agregadas o mejoras podrían
          limitarse.
        </p>

        <h2>Servicios externos</h2>
        <p>
          Para operar Litrito usamos proveedores técnicos, por ejemplo hosting,
          base de datos/autenticación, mapas, analítica, monitoreo de errores,
          correo transaccional y proveedores de inicio de sesión social. Estos
          proveedores tratan datos solo en la medida necesaria para prestar sus
          servicios.
        </p>
        <p>
          Esos proveedores pueden encontrarse dentro o fuera de México. Cuando el
          tratamiento implique una transferencia de datos personales, la haremos
          conforme a la LFPDPPP y solo para las finalidades descritas en este
          aviso o cuando exista una base legal aplicable.
        </p>

        <h2>Datos públicos de precios</h2>
        <p>
          Los precios, estaciones, ubicaciones de estaciones y datos de
          combustibles provienen de fuentes públicas o reportes de permisionarios
          ante autoridades energéticas. Esa información no corresponde a datos
          personales de usuarios de Litrito.
        </p>

        <h2>Derechos ARCO y revocación</h2>
        <p>
          Conforme a la LFPDPPP, puedes ejercer tus derechos de acceso,
          rectificación, cancelación y oposición (ARCO), así como revocar tu
          consentimiento cuando sea aplicable. Para hacerlo, escríbenos a
          <a href="mailto:hola@athas.mx"> hola@athas.mx</a> desde el correo
          asociado a tu cuenta o incluyendo datos suficientes para identificarte.
        </p>
        <p>
          Para atender tu solicitud podemos pedir información adicional para
          confirmar tu identidad y proteger tu cuenta. Responderemos conforme a
          los plazos previstos por la legislación mexicana aplicable.
        </p>

        <h2>Conservación y eliminación</h2>
        <p>
          Conservamos datos de cuenta mientras mantengas una cuenta activa o
          mientras sean necesarios para seguridad, operación o cumplimiento. Si
          solicitas la eliminación de tu cuenta o datos, podemos conservar cierta
          información cuando sea necesario para cumplir obligaciones legales,
          resolver controversias o prevenir abuso.
        </p>

        <h2>Seguridad</h2>
        <p>
          Aplicamos medidas razonables para proteger la información, incluyendo
          autenticación, controles de acceso y monitoreo de errores. Ningún
          sistema conectado a internet puede garantizar seguridad absoluta.
        </p>

        <h2>Cambios</h2>
        <p>
          Podemos actualizar este aviso cuando cambie Litrito o sus proveedores.
          Publicaremos la versión vigente en esta página con su fecha de
          actualización.
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
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-white/60 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a Litrito
        </Link>
        <div className="eyebrow mt-8 inline-flex items-center gap-2 rounded-[32px] bg-brand px-3 py-1.5 text-white">
          <ShieldCheck className="h-4 w-4" />
          {eyebrow}
        </div>
        <h1 className="font-display mt-4 text-5xl text-white sm:text-7xl">{title}</h1>
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
