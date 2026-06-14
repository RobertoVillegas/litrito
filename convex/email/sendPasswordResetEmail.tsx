'use node'

import { render } from '@react-email/render'
import { v } from 'convex/values'
import { internalAction } from '../_generated/server'
import { emailConfig } from './config'
import { isSmtpConfigured, sendSmtpEmail } from './smtp'
import { PasswordResetEmail } from './templates/passwordReset'

export const send = internalAction({
  args: {
    resetUrl: v.string(),
    userEmail: v.string(),
    userName: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const { smtp } = emailConfig
    if (!isSmtpConfigured(smtp)) {
      console.error(
        'Password reset email NOT sent: SMTP is not configured in this Convex deployment. ' +
          'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM_EMAIL via `npx convex env set`. ' +
          `Currently present -> host:${Boolean(smtp.host)} port:${smtp.port ?? 'unset'} ` +
          `user:${Boolean(smtp.user)} pass:${Boolean(smtp.pass)} fromEmail:${Boolean(smtp.fromEmail)}`,
      )
      return
    }

    console.info(
      `Sending password reset email to ${args.userEmail} via ${smtp.host}:${smtp.port} ` +
        `(secure=${smtp.secure ?? smtp.port === 465})`,
    )

    const html = await render(<PasswordResetEmail {...args} />)
    const text = await render(<PasswordResetEmail {...args} />, { plainText: true })

    try {
      await sendSmtpEmail(smtp, {
        to: args.userEmail,
        subject: 'Restablece tu contraseña de Litrito',
        html,
        text,
      })
      console.info(`Password reset email sent to ${args.userEmail}`)
    } catch (error) {
      // Surface the real SMTP failure instead of letting better-auth swallow it
      // behind a generic 200 response.
      console.error(
        `Failed to send password reset email to ${args.userEmail}: ` +
          (error instanceof Error ? error.message : String(error)),
      )
      throw error
    }
  },
})
