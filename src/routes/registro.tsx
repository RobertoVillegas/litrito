import { createFileRoute } from '@tanstack/react-router'
import { SignUp } from '../components/SignUp'

export const Route = createFileRoute('/registro')({
  head: () => ({
    meta: [{ title: 'Crear cuenta - Litrito' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: SignUp,
})
