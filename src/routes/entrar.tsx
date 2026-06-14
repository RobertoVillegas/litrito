import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '../components/SignIn'

export const Route = createFileRoute('/entrar')({
  head: () => ({
    meta: [{ title: 'Entrar - Litrito' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: SignIn,
})
