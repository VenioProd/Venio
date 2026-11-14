import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions'
import { softphone, type Softphone } from '../../../commercial/softphone/engine'
import { SharedSoftphoneContext, type SharedSoftphone } from '../../../commercial/softphone/shared'
import { useLeaveGuard, useSoftphoneSession } from '../../../commercial/softphone/useSoftphone'
import { TEAM_CALL_DESK_PREFIX } from '../teamDeskApi'
import { callDockStore, isCrmPath, type CallDockStore } from './callDockStore'
import CrmCallDock from './CrmCallDock'

/**
 * Softphone unique du CRM de l'équipe, posé dans sa coque : le poste d'appel et la fiche d'un lead le
 * consomment, l'appel survit au passage d'un écran à l'autre et le dock le montre ailleurs.
 * Quitter le CRM pendant un appel demande confirmation, puis raccroche (comme quitter l'écran d'appel avant).
 * Seul qui peut appeler (`manage_crm`) lit la configuration de la téléphonie.
 */
export default function CrmCallProvider({
  children,
  engine = softphone,
  store = callDockStore,
}: {
  children: ReactNode
  engine?: Softphone
  store?: CallDockStore
}) {
  const { user } = useAuth()
  const enabled = hasPermission(user, PERMISSIONS.MANAGE_CRM)
  const userId = user?._id ?? ''
  const session = useSoftphoneSession(TEAM_CALL_DESK_PREFIX, engine, enabled)
  const location = useLocation()
  useEffect(() => {
    store.locate(location.pathname, location.search)
  }, [store, location.pathname, location.search])
  const busy = useSyncExternalStore(engine.subscribe, () => engine.getSnapshot().phase !== 'idle')
  useLeaveGuard(enabled && busy, (link) => isCrmPath(link.pathname))
  const stored = useSyncExternalStore(store.subscribe, () => store.getSnapshot().owed)
  const owed = stored?.owner === userId ? stored : null
  const origin = useSyncExternalStore(store.subscribe, () => store.getSnapshot().origin)

  useEffect(() => {
    if (!enabled) return
    store.hold()
    return () =>
      store.release(() => {
        if (engine.busy) engine.hangup()
      })
  }, [enabled, engine, store])

  useEffect(() => {
    if (!enabled) return
    let previous = engine.getSnapshot().lastCall
    return engine.subscribe(() => {
      const last = engine.getSnapshot().lastCall
      if (last && last !== previous) store.settle(last, userId)
      previous = last
    })
  }, [enabled, engine, store, userId])

  const start = useCallback(
    (leadId: string, mode: 'power' | undefined, company: string | null) => {
      if (engine.busy) return
      store.begin(leadId, company)
      void engine.start(leadId, TEAM_CALL_DESK_PREFIX, mode)
    },
    [engine, store],
  )
  const value = useMemo<SharedSoftphone | null>(
    () =>
      enabled
        ? { engine, session, path: location.pathname, origin, owed, start, take: store.take, show: store.show }
        : null,
    [enabled, engine, session, location.pathname, origin, owed, start, store],
  )

  return (
    <SharedSoftphoneContext.Provider value={value}>
      {children}
      {value && <CrmCallDock shared={value} store={store} />}
    </SharedSoftphoneContext.Provider>
  )
}
