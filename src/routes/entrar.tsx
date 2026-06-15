import { createFileRoute } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import { SignIn } from '../components/SignIn'

export const Route = createFileRoute('/entrar')({
  head: () => ({
    meta: [{ title: 'Entrar - Litrito' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  // Prefetch which social providers are enabled so the buttons render in the
  // SSR HTML instead of flashing in after the client query resolves.
  loader: async ({ context }) => {
    const social = await context.queryClient.ensureQueryData(
      context.convexQueryClient.queryOptions(api.auth.socialProvidersEnabled, {}),
    )
    return { social }
  },
  component: SignInRoute,
})

function SignInRoute() {
  const { social } = Route.useLoaderData()
  return <SignIn socialInitial={social} />
}
