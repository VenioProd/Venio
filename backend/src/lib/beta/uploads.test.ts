import { describe, expect, it } from 'vitest'
import {
  BETA_MAX_ATTACHMENTS_PER_RUN,
  BETA_MAX_ATTACHMENT_BYTES,
  BETA_MAX_BYTES_PER_TESTER,
  checkAttachmentQuota,
  detectImageMimeType,
} from './uploads.js'

const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)])
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)])
const gif = () => Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(64)])
const webp = () =>
  Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1'), Buffer.alloc(64)])

describe('detectImageMimeType', () => {
  it('reconnait les formats matriciels acceptes', () => {
    expect(detectImageMimeType(png())).toBe('image/png')
    expect(detectImageMimeType(jpeg())).toBe('image/jpeg')
    expect(detectImageMimeType(gif())).toBe('image/gif')
    expect(detectImageMimeType(webp())).toBe('image/webp')
  })

  it('refuse un SVG, meme annonce comme une image', () => {
    expect(detectImageMimeType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull()
  })

  it('refuse du HTML deguise en capture', () => {
    expect(detectImageMimeType(Buffer.from('<!DOCTYPE html><script>alert(1)</script>'))).toBeNull()
  })

  it('refuse un fichier dont seule l extension pretend etre une image', () => {
    expect(detectImageMimeType(Buffer.from('nimporte quel contenu'))).toBeNull()
    expect(detectImageMimeType(Buffer.alloc(0))).toBeNull()
    expect(detectImageMimeType(Buffer.from([0x89, 0x50]))).toBeNull()
  })

  it('ne se laisse pas berner par un RIFF qui n est pas du WebP', () => {
    const riffWave = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.alloc(4),
      Buffer.from('WAVE', 'latin1'),
      Buffer.alloc(64),
    ])
    expect(detectImageMimeType(riffWave)).toBeNull()
  })
})

describe('checkAttachmentQuota', () => {
  const ok = { runAttachmentCount: 0, testerTotalBytes: 0 }

  it('laisse passer une capture ordinaire', () => {
    expect(checkAttachmentQuota({ ...ok, incomingBytes: 200_000 })).toEqual({ ok: true })
  })

  it('refuse une capture trop lourde', () => {
    const result = checkAttachmentQuota({ ...ok, incomingBytes: BETA_MAX_ATTACHMENT_BYTES + 1 })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/volumineux/i)
  })

  it('refuse au dela du nombre de pieces jointes par retour', () => {
    const result = checkAttachmentQuota({
      runAttachmentCount: BETA_MAX_ATTACHMENTS_PER_RUN,
      testerTotalBytes: 0,
      incomingBytes: 1000,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/pieces jointes|pièces jointes/i)
  })

  it('refuse quand le testeur a epuise son enveloppe sur la campagne', () => {
    const result = checkAttachmentQuota({
      runAttachmentCount: 0,
      testerTotalBytes: BETA_MAX_BYTES_PER_TESTER,
      incomingBytes: 1000,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/quota/i)
  })

  it('compte la piece entrante dans l enveloppe, pas seulement l existant', () => {
    const result = checkAttachmentQuota({
      runAttachmentCount: 0,
      testerTotalBytes: BETA_MAX_BYTES_PER_TESTER - 10,
      incomingBytes: 1000,
    })
    expect(result.ok).toBe(false)
  })
})
