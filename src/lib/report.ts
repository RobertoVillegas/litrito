import { logger, errorFields } from '#/lib/logger'

// Report an error to Sentry through a DYNAMIC import so the ~30 KB (gzip) browser
// SDK stays out of the initial bundle — it only loads when something actually
// errors (or after idle, when instrument.client warms it up). The structured log
// is written synchronously first so we never lose the record if the SDK import
// fails or Sentry is disabled. Safe to call before Sentry.init(): captureException
// is a no-op until the SDK is initialized.
export function captureError(
  error: unknown,
  options?: {
    logMessage?: string
    tags?: Record<string, string>
    extra?: Record<string, unknown>
  },
) {
  logger.error(options?.logMessage ?? 'error captured', {
    ...options?.tags,
    ...options?.extra,
    ...errorFields(error),
  })
  void import('@sentry/tanstackstart-react')
    .then((Sentry) =>
      Sentry.captureException(error, {
        tags: options?.tags,
        extra: options?.extra,
      }),
    )
    .catch(() => undefined)
}
