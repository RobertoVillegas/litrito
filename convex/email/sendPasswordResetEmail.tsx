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
    if (!isSmtpConfigured(emailConfig.smtp)) {
      console.warn(
        'Skipping password reset email: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM_EMAIL are required.',
      )
      return
    }

    const html = await render(<PasswordResetEmail {...args} />)
    const text = await render(<PasswordResetEmail {...args} />, { plainText: true })

    await sendSmtpEmail(emailConfig.smtp, {
      to: args.userEmail,
      subject: 'Restablece tu contraseña de Litrito',
      html,
      text,
    })
  },
})
