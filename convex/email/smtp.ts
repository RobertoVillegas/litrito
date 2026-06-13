'use node'

import nodemailer from 'nodemailer'

export type SmtpConfig = {
  host?: string
  port?: number
  user?: string
  pass?: string
  secure?: boolean
  fromEmail?: string
  fromName?: string
}

type SendEmailArgs = {
  to: string
  subject: string
  html: string
  text: string
}

export function isSmtpConfigured(config: SmtpConfig) {
  return Boolean(config.host && config.port && config.user && config.pass && config.fromEmail)
}

export async function sendSmtpEmail(config: SmtpConfig, args: SendEmailArgs) {
  if (!isSmtpConfigured(config)) {
    throw new Error(
      'SMTP email is not configured. Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL.',
    )
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  })

  await transporter.sendMail({
    from: formatFrom(config.fromEmail!, config.fromName),
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  })
}

function formatFrom(email: string, name?: string) {
  if (!name) return email
  return `"${name.replaceAll('"', '\\"')}" <${email}>`
}
