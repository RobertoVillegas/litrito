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
import { emailConfig } from '../config'
import { emailTheme } from './theme'

export type AccountDeletionEmailProps = {
  mode: 'scheduled' | 'completed'
  userEmail: string
  userName?: string | null
  scheduledDateLabel?: string
  signInUrl: string
}

export function AccountDeletionEmail({
  mode,
  userEmail,
  userName,
  scheduledDateLabel,
  signInUrl,
}: AccountDeletionEmailProps) {
  const greeting = userName ? `Hola, ${userName}` : 'Hola'
  const scheduled = mode === 'scheduled'

  return (
    <Html lang="es">
      <Head />
      <Preview>
        {scheduled
          ? `Tu cuenta de Litrito se eliminará el ${scheduledDateLabel}.`
          : 'Tu cuenta de Litrito y tus datos se eliminaron.'}
      </Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.brand}>{emailConfig.appName}</Text>
          </Section>
          <Heading style={styles.heading}>
            {scheduled ? 'Eliminación de cuenta programada' : 'Tu cuenta fue eliminada'}
          </Heading>
          <Text style={styles.greeting}>{greeting}</Text>

          {scheduled ? (
            <>
              <Text style={styles.copy}>
                Recibimos una solicitud para eliminar la cuenta de {userEmail}. Tu
                cuenta y tus datos (favoritos y preferencias) se eliminarán de forma
                permanente el <strong>{scheduledDateLabel}</strong>.
              </Text>
              <Text style={styles.copy}>
                Si fue un error, puedes cancelar en cualquier momento antes de esa
                fecha: solo inicia sesión y pulsa “Cancelar eliminación”.
              </Text>
              <Section style={styles.ctaSection}>
                <Button href={signInUrl} style={styles.button}>
                  Iniciar sesión para cancelar
                </Button>
              </Section>
              <Section style={styles.fallbackBox}>
                <Text style={styles.fallbackLabel}>Si el botón no abre, usa este enlace:</Text>
                <Link href={signInUrl} style={styles.fallbackLink}>
                  {signInUrl}
                </Link>
              </Section>
            </>
          ) : (
            <>
              <Text style={styles.copy}>
                La cuenta de {userEmail} y los datos asociados se eliminaron de forma
                permanente, según tu solicitud.
              </Text>
              <Text style={styles.copy}>
                Si quieres volver a usar Litrito en el futuro, puedes crear una cuenta
                nueva cuando gustes.
              </Text>
            </>
          )}

          <Hr style={styles.hr} />
          {scheduled && (
            <Text style={styles.small}>
              Si no solicitaste esto, inicia sesión y cancela la eliminación de
              inmediato.
            </Text>
          )}
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
