import { describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { buildSpecificationMarkdown } from '../lib/quoteSpecification.js'

const questionId = new mongoose.Types.ObjectId()
const optionalId = new mongoose.Types.ObjectId()

describe('buildSpecificationMarkdown', () => {
  it('restitue les réponses puis le périmètre retenu', () => {
    const markdown = buildSpecificationMarkdown({
      title: 'Refonte du site',
      questions: [{ _id: questionId, label: 'Quel est votre délai ?', order: 0 }],
      answers: [{ question: questionId, value: 'Trois mois' }],
      lines: [
        { _id: new mongoose.Types.ObjectId(), description: 'Conception', isOptional: false, order: 0 },
        { _id: optionalId, description: 'Rédaction', isOptional: true, order: 1 },
      ],
      selectedOptionalLineIds: [optionalId],
    } as never)

    expect(markdown).toContain('# Cahier des charges — Refonte du site')
    expect(markdown).toContain('## Quel est votre délai ?')
    expect(markdown).toContain('Trois mois')
    expect(markdown).toContain('- Conception')
    expect(markdown).toContain('- Rédaction')
  })

  it('signale explicitement une question restée sans réponse', () => {
    const markdown = buildSpecificationMarkdown({
      title: 'Site vitrine',
      questions: [{ _id: questionId, label: 'Budget ?', order: 0 }],
      answers: [],
      lines: [],
      selectedOptionalLineIds: [],
    } as never)

    expect(markdown).toContain('_Sans réponse_')
  })
})
