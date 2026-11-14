import type { SettledCall } from '../../../commercial/softphone/engine'
import type { CallOrigin, OwedCall } from '../../../commercial/softphone/shared'

/**
 * Délai avant de raccrocher quand le CRM se démonte : la fiche d'un lead (`RequirePermission`) et les
 * redirections des anciennes adresses remontent la coque, ce qui ne doit pas couper l'appel.
 */
export const LEAVE_GRACE_MS = 1000

export const isCrmPath = (path: string) => path === '/admin/crm' || path.startsWith('/admin/crm/')

export interface CallDockState {
  /** Écran d'où est parti le dernier appel. */
  origin: CallOrigin | null
  owed: OwedCall | null
  /** Barres d'appel montées qui montrent l'appel en cours. */
  shown: number
}

/**
 * État du dock d'appel, hors de React pour survivre au remontage de la coque du CRM. L'appel lui-même vit dans
 * le moteur du softphone, unique pour toute l'application.
 */
export class CallDockStore {
  private state: CallDockState = { origin: null, owed: null, shown: 0 }
  private readonly listeners = new Set<() => void>()
  private holders = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly graceMs = LEAVE_GRACE_MS) {}

  getSnapshot = () => this.state

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private update(change: Partial<CallDockState>) {
    this.state = { ...this.state, ...change }
    this.listeners.forEach((listener) => listener())
  }

  /** Écran affiché, lu au lancement d'un appel. */
  private place = { path: '', search: '' }

  locate(path: string, search: string) {
    this.place = { path, search }
  }

  begin(leadId: string, company: string | null) {
    this.update({ origin: { leadId, company, ...this.place } })
  }

  /** Un appel parti d'un écran connu se termine : son résultat lui est dû jusqu'à ce qu'il le prenne. */
  settle(call: SettledCall, owner: string) {
    const { origin } = this.state
    if (origin?.leadId === call.leadId) this.update({ owed: { call, origin, owner } })
  }

  take = (owed: OwedCall) => {
    if (this.state.owed !== owed) return false
    this.update({ owed: null })
    return true
  }

  dismiss = () => {
    if (this.state.owed) this.update({ owed: null })
  }

  show = () => {
    this.update({ shown: this.state.shown + 1 })
    let done = false
    return () => {
      if (done) return
      done = true
      this.update({ shown: this.state.shown - 1 })
    }
  }

  /** Une coque du CRM est montée. */
  hold() {
    this.holders += 1
    clearTimeout(this.timer)
  }

  /** La coque se démonte : `leave` ne s'exécute que si aucune autre ne l'a remplacée entre-temps. */
  release(leave: () => void) {
    this.holders -= 1
    if (this.holders > 0) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      if (this.holders > 0) return
      leave()
      this.update({ origin: null })
    }, this.graceMs)
  }
}

export const callDockStore = new CallDockStore()
