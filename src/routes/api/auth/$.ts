import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: () =>
        new Response('Auth is not enabled for the Litrito MVP yet.', {
          status: 501,
        }),
      POST: () =>
        new Response('Auth is not enabled for the Litrito MVP yet.', {
          status: 501,
        }),
    },
  },
})
