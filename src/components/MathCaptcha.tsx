import { useState, useEffect } from 'react'
import { useI18n } from '../context/I18nContext'
import './MathCaptcha.css'

interface MathCaptchaProps {
  onVerify: (verified: boolean) => void
}

const MathCaptcha = ({ onVerify }: MathCaptchaProps) => {
  const { t } = useI18n()
  const [num1, setNum1] = useState<number>(0)
  const [num2, setNum2] = useState<number>(0)
  const [answer, setAnswer] = useState<string>('')
  const [isValid, setIsValid] = useState<boolean>(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    generateQuestion()
  }, [])

  const generateQuestion = () => {
    const isTestMode = import.meta.env.MODE === 'test' && import.meta.env.VITE_CONTACT_FORM_MODE === 'test'
    const n1 = isTestMode ? 2 : Math.floor(Math.random() * 10) + 1
    const n2 = isTestMode ? 3 : Math.floor(Math.random() * 10) + 1
    setNum1(n1)
    setNum2(n2)
    setAnswer('')
    setIsValid(false)
    setError('')
    onVerify(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAnswer(value)

    const correctAnswer = num1 + num2
    if (value === '' || value === null) {
      setIsValid(false)
      onVerify(false)
      setError('')
    } else if (parseInt(value) === correctAnswer) {
      setIsValid(true)
      onVerify(true)
      setError('')
    } else {
      setIsValid(false)
      onVerify(false)
      setError(t('pubForms.captcha.wrongAnswer'))
    }
  }

  return (
    <div className="math-captcha">
      <div className="captcha-question">
        <span className="captcha-label">{t('pubForms.captcha.prompt')}</span>
        <span className="captcha-numbers">
          {num1} + {num2} = ?
        </span>
        <button
          type="button"
          className="captcha-refresh"
          onClick={generateQuestion}
          aria-label={t('pubForms.captcha.newQuestion')}
        >
          ↻
        </button>
      </div>
      <div className="captcha-input-wrapper">
        <input
          type="number"
          className={`captcha-input ${error ? 'error' : ''} ${isValid ? 'valid' : ''}`}
          aria-label={t('pubForms.captcha.answerAria')}
          value={answer}
          onChange={handleChange}
          placeholder={t('pubForms.captcha.answerPlaceholder')}
          required
          min="0"
        />
        {error && <span className="captcha-error">{error}</span>}
        {isValid && <span className="captcha-success">✓</span>}
      </div>
    </div>
  )
}

export default MathCaptcha
