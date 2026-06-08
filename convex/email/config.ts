declare const process: {
  env: {
    RESEND_API_KEY?: string
    RESEND_FROM_EMAIL?: string
  }
}

export const emailConfig = {
  appName: 'Litrito',
  resendApiKey: process.env.RESEND_API_KEY,
  fromEmail: process.env.RESEND_FROM_EMAIL,
}
