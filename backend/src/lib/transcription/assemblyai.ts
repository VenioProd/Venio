import type { TranscriptSegment } from '../../models/CallTranscript.js'

/**
 * AssemblyAI par `fetch`, sans SDK. Point d'accès européen par défaut : les
 * fichiers traités en Europe ne servent pas à l'entraînement (documentation
 * « Data retention and model training »). L'API n'a pas de paramètre de refus
 * d'entraînement par requête ; le reste se règle dans le tableau de bord du
 * compte (Data Controls). `DELETE /v2/transcript/:id` efface aussi le fichier
 * déposé par `/v2/upload`.
 */
const DEFAULT_BASE_URL = 'https://api.eu.assemblyai.com'

export class ProviderError extends Error {
  constructor(
    public code: string,
    public httpStatus: number | null = null,
  ) {
    super(httpStatus ? `${code} (HTTP ${httpStatus})` : code)
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.ASSEMBLYAI_API_KEY?.trim())
}

function baseUrl(): string {
  return (process.env.ASSEMBLYAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

async function call<T>(method: string, path: string, code: string, body?: Buffer | object): Promise<T> {
  const headers: Record<string, string> = { Authorization: process.env.ASSEMBLYAI_API_KEY!.trim() }
  let payload: string | Uint8Array | undefined
  if (Buffer.isBuffer(body)) {
    headers['Content-Type'] = 'application/octet-stream'
    payload = new Uint8Array(body)
  } else if (body) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let res: Response
  try {
    res = await fetch(`${baseUrl()}${path}`, { method, headers, body: payload, signal: AbortSignal.timeout(60_000) })
  } catch {
    throw new ProviderError(`${code}_NETWORK`)
  }
  // Le corps d'une erreur peut citer la requête : on ne garde que le statut.
  if (!res.ok) throw new ProviderError(code, res.status)
  return (await res.json()) as T
}

/** Envoie l'audio en mémoire, sans passer par le disque. */
export async function uploadAudio(audio: Buffer): Promise<string> {
  const { upload_url } = await call<{ upload_url: string }>('POST', '/v2/upload', 'UPLOAD_FAILED', audio)
  return upload_url
}

export async function submitJob(input: { audioUrl: string; language: string; channels: 1 | 2 }): Promise<string> {
  const body: Record<string, unknown> = { audio_url: input.audioUrl, language_code: input.language }
  // Deux canaux : un locuteur par canal. Mono : diarisation, deux voix attendues.
  if (input.channels === 2) body.multichannel = true
  else Object.assign(body, { speaker_labels: true, speakers_expected: 2 })
  const { id } = await call<{ id: string }>('POST', '/v2/transcript', 'SUBMIT_FAILED', body)
  return id
}

export interface ProviderUtterance {
  speaker?: string | null
  channel?: string | null
  start: number
  end: number
  text: string
}

export interface ProviderJob {
  status: 'queued' | 'processing' | 'completed' | 'error'
  error?: string | null
  audio_duration?: number | null
  utterances?: ProviderUtterance[] | null
}

export function getJob(id: string): Promise<ProviderJob> {
  return call<ProviderJob>('GET', `/v2/transcript/${encodeURIComponent(id)}`, 'POLL_FAILED')
}

export async function deleteJob(id: string): Promise<void> {
  await call('DELETE', `/v2/transcript/${encodeURIComponent(id)}`, 'DELETE_FAILED')
}

/**
 * Deux canaux : AssemblyAI numérote les canaux à partir de 1 (« 1 » à gauche),
 * `repChannel` à partir de 0. Sans `channel`, le `speaker` porte le numéro du canal.
 * Mono : rien ne dit qui parle. Sur un appel sortant, le prospect décroche et
 * parle le premier : la première voix entendue est donc tenue pour le prospect.
 */
export function toSegments(utterances: ProviderUtterance[], channels: 1 | 2, repChannel: 0 | 1): TranscriptSegment[] {
  const firstSpeaker = utterances[0]?.speaker ?? null
  return utterances.map((utterance) => {
    let isRep: boolean
    if (channels === 2) {
      const channel = Number.parseInt(String(utterance.channel ?? utterance.speaker ?? ''), 10)
      isRep = channel - 1 === repChannel
    } else {
      isRep = utterance.speaker !== firstSpeaker
    }
    return {
      speaker: isRep ? 'REP' : 'PROSPECT',
      startMs: Math.max(0, Math.round(utterance.start)),
      endMs: Math.max(0, Math.round(utterance.end)),
      text: String(utterance.text ?? ''),
    }
  })
}
