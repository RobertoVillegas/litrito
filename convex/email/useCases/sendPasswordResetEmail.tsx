import { render } from '@react-email/render'
import { emailConfig } from '../config'
import { sendResendEmail } from '../resend'
import {
  PasswordResetEmail,
  type PasswordResetEmailProps,
} from '../templates/passwordReset'

export async function sendPasswordResetEmail(props: PasswordResetEmailProps) {
  const { resendApiKey, fromEmail } = emailConfig

  if (!resendApiKey || !fromEmail) {
    console.warn(
      'Skipping password reset email: RESEND_API_KEY and RESEND_FROM_EMAIL are required.',
    )
    return
  }

  const html = await render(<PasswordResetEmail {...props} />)
  const text = await render(<PasswordResetEmail {...props} />, { plainText: true })

  await sendResendEmail(resendApiKey, {
    from: fromEmail,
    to: props.userEmail,
    subject: 'Restablece tu contraseña de Litrito',
    html,
    text,
  })
}
