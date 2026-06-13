declare const process: {
  env: {
    SMTP_HOST?: string
    SMTP_PORT?: string
    SMTP_USER?: string
    SMTP_PASS?: string
    SMTP_SECURE?: string
    SMTP_FROM_EMAIL?: string
    SMTP_FROM_NAME?: string
    EMAIL_FROM?: string
    EMAIL_FROM_NAME?: string
  }
}

function parsePort(value?: string) {
  const port = Number(value)
  return Number.isFinite(port) && port > 0 ? port : undefined
}

function parseBoolean(value?: string) {
  if (value == null || value === '') return undefined
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export const emailConfig = {
  appName: 'Litrito',
  smtp: {
    host: process.env.SMTP_HOST,
    port: parsePort(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    secure: parseBoolean(process.env.SMTP_SECURE),
    fromEmail: process.env.SMTP_FROM_EMAIL ?? process.env.EMAIL_FROM,
    fromName: process.env.SMTP_FROM_NAME ?? process.env.EMAIL_FROM_NAME ?? 'Litrito',
  },
}
