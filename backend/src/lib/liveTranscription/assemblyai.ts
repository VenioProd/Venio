import WebSocket from 'ws'

/**
 * Transcription en continu d'AssemblyAI (Universal-Streaming v3), une séance
 * par voix : la doc demande une séance par canal. L'audio de Twilio part tel
 * quel (µ-law 8 kHz). La clé passe dans l'en-tête, jamais dans l'URL. Rien
 * n'est écrit sur disque ni dans les journaux.
 */

export interface LiveProviderConfig {
  url: string
  apiKey: string
  model: string
}

export interface ProviderTurn {
  /** Rang du tour dans la séance : un même tour est renvoyé, complété, jusqu'à sa fin. */
  order: number
  text: string
  endOfTurn: boolean
}

export interface ProviderStream {
  send(audio: Buffer): void
  /** `graceful` : demande la fin de séance au fournisseur ; sinon coupe tout de suite. */
  close(graceful: boolean): void
}

/** Point d'accès européen : l'audio et le texte restent dans l'UE (doc AssemblyAI, « Endpoints and data zones »). */
const DEFAULT_URL = 'wss://streaming.eu.assemblyai.com/v3/ws'
/** Modèle en continu qui comprend le français (anglais, espagnol, français, allemand, italien, portugais). */
const DEFAULT_MODEL = 'universal-streaming-multilingual'
/** Audio gardé en mémoire le temps que la séance s'ouvre ; au-delà, le plus ancien part. */
const MAX_QUEUED_CHUNKS = 100

export function liveProviderConfig(): LiveProviderConfig | null {
  const apiKey = process.env.ASSEMBLYAI_API_KEY ?? ''
  const url = (process.env.ASSEMBLYAI_STREAMING_URL || DEFAULT_URL).replace(/\/+$/, '')
  const model = process.env.LIVE_TRANSCRIPTION_MODEL || DEFAULT_MODEL
  if (!apiKey || !/^wss?:\/\/[^\s?#]+$/.test(url)) return null
  return { url, apiKey, model }
}

export function openProviderStream(
  config: LiveProviderConfig,
  handlers: { onTurn(turn: ProviderTurn): void; onEnd(code: string): void },
): ProviderStream {
  const params = new URLSearchParams({
    sample_rate: '8000',
    encoding: 'pcm_mulaw',
    speech_model: config.model,
    format_turns: 'true',
  })
  const socket = new WebSocket(`${config.url}?${params}`, {
    headers: { Authorization: config.apiKey },
    handshakeTimeout: 10_000,
  })
  const queue: Buffer[] = []
  let ended = false
  const end = (code: string) => {
    if (ended) return
    ended = true
    queue.length = 0
    handlers.onEnd(code)
  }

  socket.on('open', () => {
    for (const chunk of queue.splice(0)) socket.send(chunk)
  })
  socket.on('message', (data, isBinary) => {
    if (isBinary) return
    let message: { type?: unknown; turn_order?: unknown; transcript?: unknown; end_of_turn?: unknown }
    try {
      message = JSON.parse(String(data))
    } catch {
      return
    }
    if (message.type !== 'Turn' || typeof message.transcript !== 'string' || typeof message.turn_order !== 'number')
      return
    handlers.onTurn({ order: message.turn_order, text: message.transcript, endOfTurn: message.end_of_turn === true })
  })
  socket.on('close', (code) => end(`CLOSED_${code}`))
  socket.on('error', () => end('ERROR'))

  return {
    send(audio) {
      if (ended) return
      if (socket.readyState === WebSocket.OPEN) socket.send(audio)
      else if (socket.readyState === WebSocket.CONNECTING) {
        queue.push(audio)
        if (queue.length > MAX_QUEUED_CHUNKS) queue.shift()
      }
    },
    close(graceful) {
      queue.length = 0
      if (graceful && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'Terminate' }))
        socket.close(1000)
      } else socket.terminate()
    },
  }
}
