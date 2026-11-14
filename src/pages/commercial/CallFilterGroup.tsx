/** Au-delà, les gélules prendraient trop de place : le filtre redevient une liste déroulante. */
const MAX_PILLS = 8

/**
 * Filtre de la file d'appels de l'équipe (refonte du CRM) : des gélules à choix unique, avec « tout »
 * en premier. Aucun compteur : la file est paginée, le client ne connaît pas le total par valeur.
 */
export default function CallFilterGroup({
  label,
  allLabel,
  values,
  value,
  onChange,
}: {
  label: string
  allLabel: string
  values: string[]
  value: string
  onChange: (value: string) => void
}) {
  if (!values.length) return null
  if (values.length > MAX_PILLS)
    return (
      <label className="crm-desk-select">
        <span>{label}</span>
        <select className="portal-input" value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{allLabel}</option>
          {values.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
    )
  return (
    <div className="crm-desk-pills" role="group" aria-label={label}>
      {['', ...values].map((item) => (
        <button
          type="button"
          key={item || '__all'}
          className="crm-desk-pill"
          aria-pressed={value === item}
          onClick={() => value !== item && onChange(item)}
        >
          {item || allLabel}
        </button>
      ))}
    </div>
  )
}
