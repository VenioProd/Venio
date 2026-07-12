interface Props {
  text: string
  onTextChange: (text: string) => void
  onClose: () => void
  onSubmit: () => void
}

export default function CommentModal({ text, onTextChange, onClose, onSubmit }: Props) {
  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div
        className="confirm-modal confirm-modal--info"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="confirm-modal__header">
          <h2 className="confirm-modal__title">Commentaire pour le stagiaire</h2>
          <button className="confirm-modal__close" onClick={onClose} type="button" aria-label="Fermer">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="confirm-modal__body">
          <div className="ticket-form-field">
            <label>Votre commentaire</label>
            <textarea
              rows={4}
              placeholder="Ecrivez votre retour sur le rapport..."
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="confirm-modal__footer">
          <button className="confirm-modal__btn confirm-modal__btn--cancel" onClick={onClose} type="button">
            Annuler
          </button>
          <button
            className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--info"
            onClick={onSubmit}
            type="button"
          >
            Envoyer
          </button>
        </div>
      </div>
    </div>
  )
}
