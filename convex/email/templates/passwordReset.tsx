import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { emailConfig } from '../config'
import { emailTheme } from './theme'

export type PasswordResetEmailProps = {
  resetUrl: string
  userEmail: string
  userName?: string | null
}

export function PasswordResetEmail({
  resetUrl,
  userEmail,
  userName,
}: PasswordResetEmailProps) {
  const greeting = userName ? `Hola, ${userName}` : 'Hola'

  return (
    <Html lang="es">
      <Head />
      <Preview>Restablece tu contraseña de {emailConfig.appName}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.brand}>{emailConfig.appName}</Text>
          </Section>
          <Heading style={styles.heading}>{greeting}</Heading>
          <Text style={styles.copy}>
            Recibimos una solicitud para restablecer la contraseña de {userEmail}.
          </Text>
          <Text style={styles.copy}>
            Usa este enlace para crear una nueva contraseña. Por seguridad, el
            enlace expira pronto.
          </Text>
          <Button href={resetUrl} style={styles.button}>
            Restablecer contraseña
          </Button>
          <Hr style={styles.hr} />
          <Text style={styles.small}>
            Si no solicitaste este cambio, puedes ignorar este correo.
          </Text>
          <Text style={styles.small}>
            Si el botón no funciona, abre este enlace: {resetUrl}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const styles = {
  body: {
    backgroundColor: emailTheme.canvasSoft,
    color: emailTheme.body,
    fontFamily: emailTheme.fontFamily,
    margin: 0,
    padding: '32px 12px',
  },
  container: {
    backgroundColor: emailTheme.canvas,
    border: `1px solid ${emailTheme.line}`,
    borderRadius: '6px',
    margin: '0 auto',
    maxWidth: '560px',
    padding: '32px',
  },
  header: {
    marginBottom: '24px',
  },
  brand: {
    color: emailTheme.brand,
    fontSize: '18px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    margin: 0,
    textTransform: 'uppercase' as const,
  },
  heading: {
    color: emailTheme.charcoal,
    fontSize: '26px',
    fontWeight: 800,
    lineHeight: '1.15',
    margin: '0 0 16px',
  },
  copy: {
    color: emailTheme.body,
    fontSize: '15px',
    lineHeight: '1.6',
    margin: '0 0 14px',
  },
  button: {
    backgroundColor: emailTheme.brand,
    borderRadius: '999px',
    color: emailTheme.onBrand,
    display: 'inline-block',
    fontSize: '15px',
    fontWeight: 700,
    margin: '14px 0 20px',
    padding: '12px 20px',
    textDecoration: 'none',
  },
  hr: {
    borderColor: emailTheme.line,
    margin: '12px 0 18px',
  },
  small: {
    color: emailTheme.body,
    fontSize: '12px',
    lineHeight: '1.5',
    margin: '0 0 10px',
  },
}
