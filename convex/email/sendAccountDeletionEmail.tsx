'use node'

import { render } from '@react-email/render'
import { v } from 'convex/values'
import { internalAction } from '../_generated/server'
import { emailConfig } from './config'
import { isSmtpConfigured, sendSmtpEmail } from './smtp'
import { AccountDeletionEmail } from './templates/accountDeletion'

declare const process: {
  env: {
    SITE_URL?: string
  }
}

function formatScheduledDate(scheduledAt: number): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(new Date(scheduledAt))
}

export const send = internalAction({
  args: {
    mode: v.union(v.literal('scheduled'), v.literal('completed')),
    userEmail: v.string(),
    userName: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const { smtp } = emailConfig
    if (!isSmtpConfigured(smtp)) {
      console.error(
        'Account deletion email NOT sent: SMTP is not configured in this Convex deployment.',
      )
      return
    }

    const siteUrl = process.env.SITE_URL ?? 'https://litrito.com'
    const props = {
      mode: args.mode,
      userEmail: args.userEmail,
      userName: args.userName,
      signInUrl: `${siteUrl}/entrar`,
      scheduledDateLabel:
        args.scheduledAt != null ? formatScheduledDate(args.scheduledAt) : undefined,
    }

    const html = await render(<AccountDeletionEmail {...props} />)
    const text = await render(<AccountDeletionEmail {...props} />, { plainText: true })
    const subject =
      args.mode === 'scheduled'
        ? 'Tu cuenta de Litrito se eliminará pronto'
        : 'Tu cuenta de Litrito fue eliminada'

    try {
      await sendSmtpEmail(smtp, {
        to: args.userEmail,
        subject,
        html,
        text,
      })
      console.info(`Account deletion (${args.mode}) email sent to ${args.userEmail}`)
    } catch (error) {
      console.error(
        `Failed to send account deletion email to ${args.userEmail}: ` +
          (error instanceof Error ? error.message : String(error)),
      )
      throw error
    }
  },
})
