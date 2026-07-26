import type { Types } from 'mongoose'
import type { IQuoteAnswer, IQuoteLine, IQuoteQuestion } from '../types/models/index.js'
import { resolveSelectedLines } from './quoteTotals.js'

export interface SpecificationInput {
  title: string
  questions: IQuoteQuestion[]
  answers: IQuoteAnswer[]
  lines: IQuoteLine[]
  selectedOptionalLineIds: (Types.ObjectId | string)[]
}

export function buildSpecificationMarkdown(input: SpecificationInput): string {
  const answerByQuestion = new Map(input.answers.map((answer) => [String(answer.question), answer.value]))
  const sections = [...input.questions]
    .sort((a, b) => a.order - b.order)
    .map((question) => {
      const value = answerByQuestion.get(String(question._id))?.trim()
      return `## ${question.label}\n\n${value || '_Sans réponse_'}`
    })

  const retained = resolveSelectedLines(input.lines, input.selectedOptionalLineIds)
    .sort((a, b) => a.order - b.order)
    .map((line) => `- ${line.description}`)

  const perimeter = retained.length > 0 ? retained.join('\n') : '_Aucune prestation retenue_'

  return [`# Cahier des charges — ${input.title}`, ...sections, '## Périmètre retenu', perimeter].join('\n\n') + '\n'
}
