/**
 * Cache mémoire de l'audio relayé par Venio : le lecteur demande l'audio par
 * plages (Safari en enchaîne plusieurs), et chaque plage relisait l'audio entier
 * chez l'opérateur. Rien sur disque. Borné en taille totale et en durée, vidé
 * dès que l'audio est effacé ou que le prospect s'oppose (`dropCachedAudio`).
 * Un seul processus : les gardes de la route (état en base) passent avant toute
 * lecture du cache, donc une instance qui n'a pas reçu l'effacement ne sert rien.
 */

export const AUDIO_CACHE_MAX_BYTES = 64 * 1024 * 1024
export const AUDIO_CACHE_TTL_MS = 5 * 60_000

interface Entry {
  sid: string
  audio: Buffer
  expiresAt: number
}

const entries = new Map<string, Entry>()
const loading = new Map<string, { sid: string; promise: Promise<Buffer> }>()
let bytes = 0

function remove(callId: string) {
  const entry = entries.get(callId)
  if (!entry) return
  bytes -= entry.audio.length
  entries.delete(callId)
}

/** Efface les entrées expirées, puis les plus anciennes jusqu'à tenir dans la borne. */
function trim(now: number) {
  for (const [callId, entry] of entries) if (entry.expiresAt <= now) remove(callId)
  for (const callId of entries.keys()) {
    if (bytes <= AUDIO_CACHE_MAX_BYTES) break
    remove(callId)
  }
}

/** L'audio de l'appel : en cache, sinon chargé (une seule lecture même si plusieurs plages arrivent ensemble). */
export async function cachedAudio(callId: string, sid: string, load: () => Promise<Buffer>): Promise<Buffer> {
  trim(Date.now())
  const hit = entries.get(callId)
  if (hit?.sid === sid) {
    // Réinsérée en dernier : l'éviction retire d'abord les moins récemment lues.
    entries.delete(callId)
    entries.set(callId, hit)
    return hit.audio
  }
  if (hit) remove(callId)
  const pending = loading.get(callId)
  if (pending?.sid === sid) return pending.promise
  const promise = load()
  const slot = { sid, promise }
  loading.set(callId, slot)
  try {
    const audio = await promise
    // Effacé ou contesté pendant la lecture : on sert cette requête, on ne garde rien.
    if (loading.get(callId) === slot && audio.length <= AUDIO_CACHE_MAX_BYTES) {
      const now = Date.now()
      entries.set(callId, { sid, audio, expiresAt: now + AUDIO_CACHE_TTL_MS })
      bytes += audio.length
      trim(now)
    }
    return audio
  } finally {
    if (loading.get(callId) === slot) loading.delete(callId)
  }
}

/** L'audio de cet appel a été effacé ou contesté : plus rien n'en reste en mémoire. */
export function dropCachedAudio(callId: unknown): void {
  const id = String(callId)
  remove(id)
  loading.delete(id)
}

/** Tests. */
export function resetAudioCache(): void {
  entries.clear()
  loading.clear()
  bytes = 0
}
