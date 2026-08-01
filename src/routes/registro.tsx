import { createFileRoute } from '@tanstack/react-router'
import { SignUp } from '../components/SignUp'
import { getSocialProviders } from '../lib/auth-server'

export const Route = createFileRoute('/registro')({
  head: () => ({
    meta: [{ title: 'Crear cuenta - Litrito' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  // Prefetch which social providers are enabled so the buttons render in the
  // SSR HTML instead of flashing in after the client query resolves.
  loader: async () => ({ social: await getSocialProviders() }),
  component: SignUpRoute,
})

function SignUpRoute() {
  const { social } = Route.useLoaderData()
  return <SignUp socialInitial={social} />
}
