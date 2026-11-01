import { Navigate, useLocation } from 'react-router-dom'

export default function LegacyAdminRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation()
  const [pathname, defaults] = to.split('?')
  let query = search
  if (defaults) {
    const params = new URLSearchParams(search)
    new URLSearchParams(defaults).forEach((value, key) => {
      if (!params.has(key)) params.set(key, value)
    })
    query = `?${params.toString()}`
  }
  return <Navigate to={`${pathname}${query}${hash}`} replace />
}
