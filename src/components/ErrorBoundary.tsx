import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  isChunkError: boolean
}

const RELOAD_FLAG = 'venio:chunk-reload-attempted'

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false
  const message = (err as { message?: string }).message || String(err)
  const name = (err as { name?: string }).name || ''
  return (
    name === 'ChunkLoadError' ||
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  )
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunkError: false }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, isChunkError: isChunkLoadError(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Best-effort logging without leaking PII to console in prod.
    if (typeof console !== 'undefined' && console.error) {
      console.error('[ErrorBoundary]', error, info.componentStack)
    }

    if (isChunkLoadError(error)) {
      let alreadyReloaded = false
      try { alreadyReloaded = window.sessionStorage.getItem(RELOAD_FLAG) === '1' } catch { /* noop */ }
      if (!alreadyReloaded) {
        try { window.sessionStorage.setItem(RELOAD_FLAG, '1') } catch { /* noop */ }
        window.location.reload()
      }
    }
  }

  handleRetry = (): void => {
    try { window.sessionStorage.removeItem(RELOAD_FLAG) } catch { /* noop */ }
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.state.isChunkError) {
      // Reload is in flight — render a minimal placeholder so the user
      // isn't staring at a pure-black document during the swap.
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-primary, #0a0a0a)',
            color: 'var(--text-primary, #e5e7eb)',
            fontFamily: 'system-ui, sans-serif',
            padding: '2rem',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, opacity: 0.7 }}>Mise à jour de l'application…</div>
          </div>
        </div>
      )
    }

    if (this.props.fallback) return this.props.fallback

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary, #0a0a0a)',
          color: 'var(--text-primary, #e5e7eb)',
          fontFamily: 'system-ui, sans-serif',
          padding: '2rem',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, marginBottom: 12 }}>Une erreur est survenue</h1>
          <p style={{ fontSize: 14, opacity: 0.75, marginBottom: 24 }}>
            Désolé, l'interface a rencontré un problème. Vous pouvez recharger la page pour réessayer.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.06)',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Recharger
          </button>
        </div>
      </div>
    )
  }
}
