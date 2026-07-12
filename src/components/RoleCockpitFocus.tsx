import { useEffect } from 'react'
import { ArrowRight, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { trackAdminEvent } from '../lib/adminAnalytics'
import { getRoleCockpit, getRoleCockpitNavigation } from '../lib/adminNavigation'

/** A compact, role-aware starting point above the configurable workspace. */
export default function RoleCockpitFocus() {
  const { user } = useAuth()
  const cockpit = getRoleCockpit(user)
  const priorities = getRoleCockpitNavigation(user)

  useEffect(() => {
    if (user?.role) trackAdminEvent('admin_cockpit_viewed', 'workspace')
  }, [user?.role])

  return (
    <section className="role-cockpit-focus" aria-labelledby="role-cockpit-title">
      <div className="role-cockpit-focus__intro">
        <Compass size={19} aria-hidden />
        <div>
          <p className="role-cockpit-focus__eyebrow">Priorités de votre rôle</p>
          <h2 id="role-cockpit-title">{cockpit.title}</h2>
          <p>{cockpit.description}</p>
        </div>
      </div>
      <div className="role-cockpit-focus__actions" aria-label="Accès prioritaires">
        {priorities.map((item) => (
          <Link key={item.id} to={item.screen} className="role-cockpit-focus__action">
            <span>{item.label}</span>
            <ArrowRight size={15} aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  )
}
