import nodemailer from 'nodemailer'

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;')

export async function sendPasswordResetEmail(input: {
  email: string
  name: string
  url: string
}) {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const fromEmail = process.env.SMTP_FROM_EMAIL
  if (!host || !user || !pass || !fromEmail) {
    throw new Error('SMTP no está configurado para recuperación de contraseña')
  }
  const transporter = nodemailer.createTransport({
    host, port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user, pass },
  })
  const fromName = process.env.SMTP_FROM_NAME ?? 'Litrito'
  const safeUrl = escapeHtml(input.url)
  await transporter.sendMail({
    from: `"${fromName.replaceAll('"', '\\"')}" <${fromEmail}>`,
    to: input.email,
    subject: 'Restablece tu contraseña de Litrito',
    text: `Hola, ${input.name}. Restablece tu contraseña (válido por 1 hora): ${input.url}`,
    html: `<p>Hola, ${escapeHtml(input.name)}.</p><p>Recibimos una solicitud para restablecer tu contraseña.</p><p><a href="${safeUrl}">Restablecer contraseña</a></p><p>El enlace caduca en 1 hora.</p>`,
  })
}
