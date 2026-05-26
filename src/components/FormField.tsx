import React from 'react'

interface FormFieldProps {
  label: string
  /**
   * id of the form control inside `children`. When provided, the rendered
   * `<label>` uses `htmlFor` for an explicit a11y association — preferred
   * over the implicit (label-wraps-input) pattern.
   */
  htmlFor?: string
  error?: string
  required?: boolean
  children: React.ReactNode
}

const FormField: React.FC<FormFieldProps> = ({ label, htmlFor, error, required, children }) => {
  return (
    <div className={`form-field${error ? ' form-field--error' : ''}`}>
      <label className="form-field__label" htmlFor={htmlFor}>
        {label}
        {required && ' *'}
      </label>
      {children}
      {error && <p className="form-field__error">{error}</p>}
    </div>
  )
}

export default FormField
