import mongoose, { Schema } from 'mongoose'

/**
 * Verrous et curseurs des tâches planifiées du CRM, en base plutôt qu'en
 * mémoire : ils survivent aux redémarrages et valent pour toutes les instances.
 *
 * - **Verrou** : un document par occurrence (`crm-scheduler:<tâche>:<jour Europe/Paris>`).
 *   La clé est l'`_id` : l'insertion est atomique, la seconde instance reçoit
 *   une erreur de doublon (11000) et s'abstient. Expire seul (index TTL).
 * - **Curseur** : compteur monotone (`$inc` en upsert), ex. le round-robin des
 *   assignations. Sans `expiresAt`, il n'expire jamais.
 *
 * Même principe que `automation/models/AutomationLock` (insertion unique +
 * TTL), dans une collection à part : les verrous du planificateur CRM ne se
 * mêlent pas au journal du moteur d'automatisations.
 */
export interface ISchedulerLock {
  _id: string
  scope: 'lock' | 'cursor'
  seq: number
  createdAt: Date
  expiresAt: Date | null
}

const SchedulerLockSchema = new Schema<ISchedulerLock>(
  {
    _id: { type: String, required: true },
    scope: { type: String, enum: ['lock', 'cursor'], required: true },
    seq: { type: Number, default: 0 },
    createdAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, default: null },
  },
  { versionKey: false },
)

// TTL : un verrou disparaît à son échéance ; un curseur (expiresAt null) jamais.
SchedulerLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const SchedulerLock = mongoose.model<ISchedulerLock>('SchedulerLock', SchedulerLockSchema)

export default SchedulerLock

/**
 * Prend le verrou `key` pour `ttlMs`. Rend `true` à une seule des exécutions
 * concurrentes (toutes instances confondues), `false` aux autres et à toute
 * exécution ultérieure tant que le verrou n'a pas expiré.
 */
export async function acquireSchedulerLock(key: string, ttlMs: number, now: Date = new Date()): Promise<boolean> {
  try {
    // L'échéance part de l'horloge réelle : un `now` simulé dans le passé ne doit pas créer un verrou déjà expiré.
    const from = Math.max(now.getTime(), Date.now())
    await SchedulerLock.create({ _id: key, scope: 'lock', createdAt: now, expiresAt: new Date(from + ttlMs) })
    return true
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false
    throw err
  }
}

/** Libère un verrou (l'occurrence pourra être rejouée). */
export async function releaseSchedulerLock(key: string): Promise<void> {
  await SchedulerLock.deleteOne({ _id: key, scope: 'lock' })
}

/** Avance atomiquement le curseur `key` et rend sa nouvelle valeur (1, 2, 3…). */
export async function nextSchedulerCursor(key: string): Promise<number> {
  const doc = await SchedulerLock.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 }, $setOnInsert: { scope: 'cursor', expiresAt: null, createdAt: new Date() } },
    { upsert: true, new: true },
  ).lean()
  return doc!.seq
}
