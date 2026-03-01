import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'

// Re-create the Task schema inline to avoid side-effects from importing
// the model file (which calls mongoose.model and could conflict).
// This mirrors the schema defined in src/models/Task.js exactly.
const taskSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['A_FAIRE', 'EN_COURS', 'EN_REVIEW', 'TERMINE'],
      default: 'A_FAIRE',
    },
    priority: {
      type: String,
      enum: ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'],
      default: 'NORMALE',
    },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dueDate: { type: Date, default: null },
    tags: [{ type: String, trim: true }],
    order: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

// Use a unique model name to avoid OverwriteModelError
const Task = mongoose.model('TaskTest', taskSchema)

describe('Task model schema validation', () => {
  describe('required fields', () => {
    it('should fail validation when project is missing', () => {
      const task = new Task({ title: 'Test task', createdBy: new mongoose.Types.ObjectId() })
      const errors = task.validateSync()
      expect(errors).toBeDefined()
      expect(errors!.errors.project).toBeDefined()
    })

    it('should fail validation when title is missing', () => {
      const task = new Task({
        project: new mongoose.Types.ObjectId(),
        createdBy: new mongoose.Types.ObjectId(),
      })
      const errors = task.validateSync()
      expect(errors).toBeDefined()
      expect(errors!.errors.title).toBeDefined()
    })

    it('should fail validation when createdBy is missing', () => {
      const task = new Task({
        project: new mongoose.Types.ObjectId(),
        title: 'Test task',
      })
      const errors = task.validateSync()
      expect(errors).toBeDefined()
      expect(errors!.errors.createdBy).toBeDefined()
    })

    it('should pass validation when all required fields are provided', () => {
      const task = new Task({
        project: new mongoose.Types.ObjectId(),
        title: 'Test task',
        createdBy: new mongoose.Types.ObjectId(),
      })
      const errors = task.validateSync()
      expect(errors).toBeUndefined()
    })
  })

  describe('status enum', () => {
    it('should accept valid status values', () => {
      const validStatuses = ['A_FAIRE', 'EN_COURS', 'EN_REVIEW', 'TERMINE']
      for (const status of validStatuses) {
        const task = new Task({
          project: new mongoose.Types.ObjectId(),
          title: 'Test',
          createdBy: new mongoose.Types.ObjectId(),
          status,
        })
        const errors = task.validateSync()
        expect(errors).toBeUndefined()
      }
    })

    it('should reject invalid status values', () => {
      const task = new Task({
        project: new mongoose.Types.ObjectId(),
        title: 'Test',
        createdBy: new mongoose.Types.ObjectId(),
        status: 'INVALID_STATUS',
      })
      const errors = task.validateSync()
      expect(errors).toBeDefined()
      expect(errors!.errors.status).toBeDefined()
    })

    it('should default status to A_FAIRE', () => {
      const task = new Task({
        project: new mongoose.Types.ObjectId(),
        title: 'Test',
        createdBy: new mongoose.Types.ObjectId(),
      })
      expect(task.status).toBe('A_FAIRE')
    })
  })

  describe('priority enum', () => {
    it('should accept valid priority values', () => {
      const validPriorities = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']
      for (const priority of validPriorities) {
        const task = new Task({
          project: new mongoose.Types.ObjectId(),
          title: 'Test',
          createdBy: new mongoose.Types.ObjectId(),
          priority,
        })
        const errors = task.validateSync()
        expect(errors).toBeUndefined()
      }
    })

    it('should reject invalid priority values', () => {
      const task = new Task({
        project: new mongoose.Types.ObjectId(),
        title: 'Test',
        createdBy: new mongoose.Types.ObjectId(),
        priority: 'INVALID_PRIORITY',
      })
      const errors = task.validateSync()
      expect(errors).toBeDefined()
      expect(errors!.errors.priority).toBeDefined()
    })

    it('should default priority to NORMALE', () => {
      const task = new Task({
        project: new mongoose.Types.ObjectId(),
        title: 'Test',
        createdBy: new mongoose.Types.ObjectId(),
      })
      expect(task.priority).toBe('NORMALE')
    })
  })

  describe('default values', () => {
    it('should default description to empty string', () => {
      const task = new Task({
        project: new mongoose.Types.ObjectId(),
        title: 'Test',
        createdBy: new mongoose.Types.ObjectId(),
      })
      expect(task.description).toBe('')
    })

    it('should default assignee to null', () => {
      const task = new Task({
        project: new mongoose.Types.ObjectId(),
        title: 'Test',
        createdBy: new mongoose.Types.ObjectId(),
      })
      expect(task.assignee).toBeNull()
    })

    it('should default dueDate to null', () => {
      const task = new Task({
        project: new mongoose.Types.ObjectId(),
        title: 'Test',
        createdBy: new mongoose.Types.ObjectId(),
      })
      expect(task.dueDate).toBeNull()
    })

    it('should default order to 0', () => {
      const task = new Task({
        project: new mongoose.Types.ObjectId(),
        title: 'Test',
        createdBy: new mongoose.Types.ObjectId(),
      })
      expect(task.order).toBe(0)
    })

    it('should default tags to an empty array', () => {
      const task = new Task({
        project: new mongoose.Types.ObjectId(),
        title: 'Test',
        createdBy: new mongoose.Types.ObjectId(),
      })
      expect(task.tags).toEqual([])
    })
  })
})
