import React from 'react'

interface FormFieldProps {
  label: string
  error?: string
  required?: boolean
  /** Id du champ : relie le libellé à l'input (clic sur le libellé, lecteurs d'écran). */
  htmlFor?: string
  children: React.ReactNode
}

const FormField: React.FC<FormFieldProps> = ({ label, error, required, htmlFor, children }) => {
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
