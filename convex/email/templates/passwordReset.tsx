import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { PASSWORD_RESET_EXPIRES_LABEL, emailConfig } from '../config'
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
      <Preview>
        Tu enlace para restablecer contraseña caduca en {PASSWORD_RESET_EXPIRES_LABEL}.
      </Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.brand}>{emailConfig.appName}</Text>
          </Section>
          <Heading style={styles.heading}>Restablece tu contraseña</Heading>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.copy}>
            Recibimos una solicitud para restablecer la contraseña de {userEmail}.
          </Text>
          <Text style={styles.copy}>
            Por seguridad, este enlace caduca en {PASSWORD_RESET_EXPIRES_LABEL} y
            solo puede usarse una vez.
          </Text>
          <Section style={styles.ctaSection}>
            <Button href={resetUrl} style={styles.button}>
              Restablecer contraseña
            </Button>
          </Section>
          <Section style={styles.fallbackBox}>
            <Text style={styles.fallbackLabel}>Si el botón no abre, usa este enlace:</Text>
            <Link href={resetUrl} style={styles.fallbackLink}>
              {resetUrl}
            </Link>
          </Section>
          <Hr style={styles.hr} />
          <Text style={styles.small}>
            Si no solicitaste este cambio, ignora este correo. Tu contraseña no se
            modificará.
          </Text>
          <Text style={styles.footer}>
            Litrito es un producto de{' '}
            <Link href="https://athas.mx" style={styles.footerLink}>
              athas
            </Link>
            .
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
    margin: '0 0 12px',
  },
  greeting: {
    color: emailTheme.charcoal,
    fontSize: '15px',
    fontWeight: 700,
    lineHeight: '1.5',
    margin: '0 0 10px',
  },
  copy: {
    color: emailTheme.body,
    fontSize: '15px',
    lineHeight: '1.6',
    margin: '0 0 14px',
  },
  ctaSection: {
    margin: '24px 0 14px',
    textAlign: 'center' as const,
  },
  button: {
    backgroundColor: emailTheme.brand,
    borderRadius: '999px',
    color: emailTheme.onBrand,
    display: 'inline-block',
    fontSize: '15px',
    fontWeight: 700,
    margin: '0 auto',
    padding: '13px 24px',
    textDecoration: 'none',
  },
  fallbackBox: {
    backgroundColor: emailTheme.canvasSoft,
    border: `1px solid ${emailTheme.line}`,
    borderRadius: '6px',
    margin: '0 0 22px',
    padding: '14px',
  },
  fallbackLabel: {
    color: emailTheme.body,
    fontSize: '12px',
    fontWeight: 700,
    lineHeight: '1.4',
    margin: '0 0 6px',
  },
  fallbackLink: {
    color: emailTheme.brandDark,
    fontSize: '12px',
    lineHeight: '1.5',
    wordBreak: 'break-all' as const,
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
  footer: {
    color: emailTheme.muted,
    fontSize: '12px',
    lineHeight: '1.5',
    margin: '14px 0 0',
    textAlign: 'center' as const,
  },
  footerLink: {
    color: emailTheme.brandDark,
    fontWeight: 700,
    textDecoration: 'none',
  },
}
