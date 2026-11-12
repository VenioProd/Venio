import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/I18nContext'
import { ADMIN_ROLES } from '../lib/permissions'

export default function NotFound() {
  const { user } = useAuth()
  const { t } = useI18n()
  return (
    <main style={{ maxWidth: 640, margin: '80px auto', padding: 24, fontWeight: 400 }}>
      <Helmet>
        <title>{t('shell.notFound.title')}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <h1 style={{ fontSize: 32, fontWeight: 600, textTransform: 'none' }}>{t('shell.notFound.title')}</h1>
      <p style={{ fontWeight: 400 }}>{t('shell.notFound.description')}</p>
      <p style={{ fontWeight: 400 }}>
        <Link to="/">{t('shell.notFound.home')}</Link>
      </p>
      {user && ADMIN_ROLES.includes(user.role) && (
        <p style={{ fontWeight: 400 }}>
          <Link to="/admin">{t('shell.nav.adminHome')}</Link>
        </p>
      )}
    </main>
  )
}
