import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '../components/SignIn'
import { getSocialProviders } from '../lib/auth-server'

export const Route = createFileRoute('/entrar')({
  head: () => ({
    meta: [{ title: 'Entrar - Litrito' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  // Prefetch which social providers are enabled so the buttons render in the
  // SSR HTML instead of flashing in after the client query resolves.
  loader: async () => ({ social: await getSocialProviders() }),
  component: SignInRoute,
})

function SignInRoute() {
  const { social } = Route.useLoaderData()
  return <SignIn socialInitial={social} />
}
