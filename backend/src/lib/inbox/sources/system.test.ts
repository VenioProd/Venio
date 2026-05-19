import { describe, it, expect } from 'vitest'
import { getSystemItems } from './system.js'

describe('getSystemItems', () => {
  it('retourne [] en V1 (pas de Backup ni QualiopiSignature model)', async () => {
    const items = await getSystemItems()
    expect(items).toEqual([])
  })
})
