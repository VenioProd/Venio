import { describe, expect, it } from 'vitest'
import type { IndexDefinition, IndexOptions } from 'mongoose'
import {
  EducationActivityLog,
  EducationAiGeneration,
  EducationAssignment,
  EducationClass,
  EducationDocument,
  EducationNote,
  EducationSession,
  EducationStudent,
  EducationSubmission,
  EducationTemplate,
} from './education/index.js'

type IndexKey = IndexDefinition

function hasIndex(model: { schema: { indexes: () => [IndexKey, IndexOptions][] } }, keys: IndexKey): boolean {
  return model.schema.indexes().some(([declared]) => JSON.stringify(declared) === JSON.stringify(keys))
}

const educationModels = [
  EducationActivityLog,
  EducationAiGeneration,
  EducationAssignment,
  EducationClass,
  EducationDocument,
  EducationNote,
  EducationSession,
  EducationStudent,
  EducationSubmission,
  EducationTemplate,
]

describe('Education workspace query index contracts', () => {
  it('keeps the indexes for cross-class calendars and attendance recalculation', () => {
    expect(hasIndex(EducationSession, { owner: 1, deletedAt: 1, date: 1 })).toBe(true)
    expect(hasIndex(EducationSession, { owner: 1, 'attendance.studentId': 1, deletedAt: 1 })).toBe(true)
  })

  it('keeps the indexes for dashboard deadlines and student-wide submission reads', () => {
    expect(hasIndex(EducationAssignment, { owner: 1, deletedAt: 1, status: 1, deadline: 1 })).toBe(true)
    expect(hasIndex(EducationSubmission, { owner: 1, studentId: 1, deletedAt: 1 })).toBe(true)
  })

  it('keeps the backup collection inventory aligned with the Mongoose models', () => {
    expect(educationModels.map((model) => model.collection.collectionName).sort()).toEqual([
      'educationactivitylogs',
      'educationaigenerations',
      'educationassignments',
      'educationclasses',
      'educationdocuments',
      'educationnotes',
      'educationsessions',
      'educationstudents',
      'educationsubmissions',
      'educationtemplates',
    ])
  })

  it('does not duplicate index key definitions in the education models', () => {
    for (const model of educationModels) {
      const indexes = model.schema.indexes().map(([keys]) => JSON.stringify(keys))
      expect(new Set(indexes), `${model.modelName} declares duplicate index keys`).toHaveLength(indexes.length)
    }
  })
})
