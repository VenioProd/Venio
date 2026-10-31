import React from 'react'
import type { ContactsTabProps } from './types'
import { useI18n } from '../../../context/I18nContext'

const ContactsTab: React.FC<ContactsTabProps> = ({
  contacts,
  contactDraft,
  setContactDraft,
  addContact,
  removeContact,
  saving,
}) => {
  const { t } = useI18n()
  return (
    <div className="portal-list">
      <form onSubmit={addContact} className="portal-grid">
        <input
          className="portal-input"
          placeholder={t('adminAccess.clientDetail.firstName')}
          value={contactDraft.firstName}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setContactDraft({ ...contactDraft, firstName: event.target.value })
          }
          required
        />
        <input
          className="portal-input"
          placeholder={t('adminAccess.clientDetail.lastName')}
          value={contactDraft.lastName}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setContactDraft({ ...contactDraft, lastName: event.target.value })
          }
        />
        <input
          className="portal-input"
          placeholder={t('adminAccess.clientDetail.email')}
          type="email"
          value={contactDraft.email}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setContactDraft({ ...contactDraft, email: event.target.value })
          }
        />
        <input
          className="portal-input"
          placeholder={t('adminAccess.clientDetail.phone')}
          value={contactDraft.phone}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setContactDraft({ ...contactDraft, phone: event.target.value })
          }
        />
        <button type="submit" className="portal-button" disabled={saving}>
          {t('adminAccess.clientDetail.add')}
        </button>
      </form>

      <div className="admin-list">
        {contacts.map((contact) => (
          <div key={contact._id} className="admin-list-item">
            <div className="admin-list-item-content">
              <h3 className="admin-list-item-title">
                {contact.firstName} {contact.lastName}
              </h3>
              <p className="admin-list-item-subtitle">
                {contact.email || t('adminAccess.clientDetail.emailMissing')}
                {contact.phone ? ` • ${contact.phone}` : ''}
              </p>
            </div>
            <div className="admin-list-item-actions">
              <button
                type="button"
                className="portal-button secondary"
                onClick={() => removeContact(contact._id)}
                disabled={saving}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ContactsTab
