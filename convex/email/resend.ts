type SendEmailArgs = {
  from: string
  to: string
  subject: string
  html: string
  text: string
}

export async function sendResendEmail(apiKey: string, args: SendEmailArgs) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Resend email failed: ${details}`)
  }
}
