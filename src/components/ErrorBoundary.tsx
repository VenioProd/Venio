import { Component, type ReactNode } from 'react'
import { isChunkLoadError, recoverChunkError } from '../lib/chunkRecovery'

export default class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; isChunkError: boolean }
> {
  state = { hasError: false, isChunkError: false }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, isChunkError: isChunkLoadError(error) }
  }

  componentDidCatch(error: unknown) {
    recoverChunkError(error)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback
    return (
      <div
        role="alert"
        style={{
          minHeight: '70vh',
          display: 'grid',
          placeItems: 'center',
          padding: 32,
          color: 'var(--text-primary)',
          background: 'var(--bg-primary)',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <h1>{this.state.isChunkError ? 'La page doit être actualisée' : 'Une erreur est survenue'}</h1>
          <p>
            {this.state.isChunkError
              ? 'Une nouvelle version est disponible ou la connexion a été interrompue.'
              : 'Rechargez la page pour réessayer.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '10px 18px', borderRadius: 'var(--r-md, 10px)', cursor: 'pointer' }}
          >
            Recharger
          </button>
        </div>
      </div>
    )
  }
}
