import { useCallback, useState } from 'react'
import { translate } from '../i18n'

// ── Validator types ──────────────────────────────────────────────

interface RequiredRule {
  type: 'required'
  message?: string
}

interface EmailRule {
  type: 'email'
  message?: string
}

interface MinLengthRule {
  type: 'minLength'
  value: number
  message?: string
}

interface MaxLengthRule {
  type: 'maxLength'
  value: number
  message?: string
}

interface PatternRule {
  type: 'pattern'
  value: RegExp
  message?: string
}

export type ValidationRule = RequiredRule | EmailRule | MinLengthRule | MaxLengthRule | PatternRule

export type ValidationSchema<T extends string = string> = Record<T, ValidationRule[]>

export interface UseFormValidationReturn<T extends string = string> {
  errors: Record<T, string>
  validate: (data: Record<T, unknown>) => boolean
  validateField: (name: T, value: unknown) => boolean
  clearError: (name: T) => void
  clearAll: () => void
  isValid: boolean
}

// ── Default error messages ───────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function runRule(rule: ValidationRule, value: unknown): string | null {
  const str = typeof value === 'string' ? value : String(value ?? '')

  switch (rule.type) {
    case 'required':
      if (str.trim().length === 0) {
        return rule.message ?? translate('shell.validation.required')
      }
      break
    case 'email':
      if (str.length > 0 && !EMAIL_REGEX.test(str)) {
        return rule.message ?? translate('shell.validation.email')
      }
      break
    case 'minLength':
      if (str.length > 0 && str.length < rule.value) {
        return rule.message ?? translate('shell.validation.minLength', { count: rule.value })
      }
      break
    case 'maxLength':
      if (str.length > rule.value) {
        return rule.message ?? translate('shell.validation.maxLength', { count: rule.value })
      }
      break
    case 'pattern':
      if (str.length > 0 && !rule.value.test(str)) {
        return rule.message ?? translate('shell.validation.pattern')
      }
      break
  }
  return null
}

// ── Hook ─────────────────────────────────────────────────────────

export function useFormValidation<T extends string>(schema: ValidationSchema<T>): UseFormValidationReturn<T> {
  const [errors, setErrors] = useState<Record<T, string>>({} as Record<T, string>)

  const validateField = useCallback(
    (name: T, value: unknown): boolean => {
      const rules = schema[name]
      if (!rules) return true

      for (const rule of rules) {
        const errorMessage = runRule(rule, value)
        if (errorMessage) {
          setErrors((prev) => ({ ...prev, [name]: errorMessage }))
          return false
        }
      }

      setErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
      return true
    },
    [schema],
  )

  const validate = useCallback(
    (data: Record<T, unknown>): boolean => {
      const nextErrors = {} as Record<T, string>
      let valid = true

      for (const name of Object.keys(schema) as T[]) {
        const rules = schema[name]
        for (const rule of rules) {
          const errorMessage = runRule(rule, data[name])
          if (errorMessage) {
            nextErrors[name] = errorMessage
            valid = false
            break
          }
        }
      }

      setErrors(nextErrors)
      return valid
    },
    [schema],
  )

  const clearError = useCallback((name: T) => {
    setErrors((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setErrors({} as Record<T, string>)
  }, [])

  const isValid = Object.keys(errors).length === 0

  return { errors, validate, validateField, clearError, clearAll, isValid }
}
