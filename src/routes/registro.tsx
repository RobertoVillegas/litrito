import { createFileRoute } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import { SignUp } from '../components/SignUp'

export const Route = createFileRoute('/registro')({
  head: () => ({
    meta: [{ title: 'Crear cuenta - Litrito' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  // Prefetch which social providers are enabled so the buttons render in the
  // SSR HTML instead of flashing in after the client query resolves.
  loader: async ({ context }) => {
    const social = await context.queryClient.ensureQueryData(
      context.convexQueryClient.queryOptions(api.auth.socialProvidersEnabled, {}),
    )
    return { social }
  },
  component: SignUpRoute,
})

function SignUpRoute() {
  const { social } = Route.useLoaderData()
  return <SignUp socialInitial={social} />
}
