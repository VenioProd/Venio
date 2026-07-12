import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { trackPublicEvent } from '../lib/publicAnalytics'

/**
 * First-party, aggregate-only measurement for the public site. It does not
 * create or read cookies, local storage, identifiers, referrers or query
 * parameters. The server stores a daily counter only.
 */
export default function PublicAnalytics() {
  const location = useLocation()

  useEffect(() => {
    trackPublicEvent('page_view')
  }, [location.pathname])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const cta = target.closest<HTMLElement>('[data-analytics-cta]')?.dataset.analyticsCta
      if (cta) trackPublicEvent('cta_click', cta)
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return null
}
