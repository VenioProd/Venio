import { Component, type ReactNode } from 'react'
import { isChunkLoadError, recoverChunkError } from '../lib/chunkRecovery'
import { translate } from '../i18n'

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
          <h1>
            {this.state.isChunkError ? translate('shell.error.refreshTitle') : translate('shell.error.genericTitle')}
          </h1>
          <p>{this.state.isChunkError ? translate('shell.error.refreshText') : translate('shell.error.genericText')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '10px 18px', borderRadius: 'var(--r-md, 10px)', cursor: 'pointer' }}
          >
            {translate('shell.error.reload')}
          </button>
        </div>
      </div>
    )
  }
}
