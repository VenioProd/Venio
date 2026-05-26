/** Extrait un message lisible depuis une valeur unknown attrapée dans un catch. */
export function getErrorMessage(err: unknown, fallback = 'Erreur'): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return fallback
}
