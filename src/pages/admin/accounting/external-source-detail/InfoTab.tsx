import type { IExternalSource } from '../../../../types/accounting'
import type { InfoForm } from './types'
import { formatDateTime } from './helpers'

interface InfoTabProps {
  source: IExternalSource
  infoForm: InfoForm
  setInfoForm: (f: InfoForm) => void
  onSave: () => void
  saving: boolean
}

export default function InfoTab({ source, infoForm, setInfoForm, onSave, saving }: InfoTabProps) {
  return (
    <>
      <div className="accounting-kpi-grid">
        <div className="accounting-kpi">
          <div className="label">Total reçu</div>
          <div className="value">{Number(source.totalIngested || 0).toLocaleString('fr-FR')}</div>
        </div>
        <div className="accounting-kpi">
          <div className="label">Rejetées</div>
          <div className="value" style={{ color: source.totalRejected ? '#f87171' : undefined }}>
            {Number(source.totalRejected || 0).toLocaleString('fr-FR')}
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">Doublons</div>
          <div className="value" style={{ color: source.totalDuplicates ? '#fbbf24' : undefined }}>
            {Number(source.totalDuplicates || 0).toLocaleString('fr-FR')}
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">Dernière activité</div>
          <div className="value" style={{ fontSize: '0.95rem' }}>
            {formatDateTime(source.lastSeenAt)}
          </div>
        </div>
      </div>

      <section className="accounting-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Informations & mappings</h2>

        <div className="accounting-form">
          <div className="accounting-form-field full">
            <label>Description</label>
            <textarea
              className="portal-input"
              rows={2}
              value={infoForm.description}
              onChange={(e) => setInfoForm({ ...infoForm, description: e.target.value })}
            />
          </div>
          <div className="accounting-form-field full">
            <label
              style={{
                textTransform: 'none',
                letterSpacing: 0,
                fontSize: '0.88rem',
              }}
            >
              <input
                type="checkbox"
                checked={infoForm.autoValidateAll}
                onChange={(e) => setInfoForm({ ...infoForm, autoValidateAll: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              Auto-valider toutes les écritures de cette source
            </label>
            <span
              style={{
                fontSize: '0.74rem',
                color: 'rgba(251,191,36,0.85)',
                marginTop: 2,
              }}
            >
              ⚠ Si activé, toutes les écritures arrivent validées sans revue manuelle.
            </span>
          </div>
          <div className="accounting-form-field">
            <label>Rate limit (req/min)</label>
            <input
              type="number"
              min="1"
              className="portal-input"
              value={infoForm.rateLimitPerMin}
              onChange={(e) => setInfoForm({ ...infoForm, rateLimitPerMin: e.target.value })}
            />
          </div>
          <div className="accounting-form-field">
            <label>Journal par défaut</label>
            <input
              className="portal-input"
              value={infoForm.defaultJournalCode}
              onChange={(e) => setInfoForm({ ...infoForm, defaultJournalCode: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="accounting-form-field">
            <label>Compte client</label>
            <input
              className="portal-input"
              value={infoForm.defaultCustomerAccount}
              onChange={(e) => setInfoForm({ ...infoForm, defaultCustomerAccount: e.target.value })}
            />
          </div>
          <div className="accounting-form-field">
            <label>Compte produit</label>
            <input
              className="portal-input"
              value={infoForm.defaultRevenueAccount}
              onChange={(e) => setInfoForm({ ...infoForm, defaultRevenueAccount: e.target.value })}
            />
          </div>
          <div className="accounting-form-field">
            <label>Compte charge</label>
            <input
              className="portal-input"
              value={infoForm.defaultExpenseAccount}
              onChange={(e) => setInfoForm({ ...infoForm, defaultExpenseAccount: e.target.value })}
            />
          </div>
          <div className="accounting-form-field">
            <label>Compte banque</label>
            <input
              className="portal-input"
              value={infoForm.defaultBankAccount}
              onChange={(e) => setInfoForm({ ...infoForm, defaultBankAccount: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button className="portal-button" onClick={onSave} disabled={saving}>
            {saving ? 'Enregistrement…' : '✓ Enregistrer'}
          </button>
        </div>
      </section>

      <section className="accounting-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Endpoints API</h2>
        <p
          style={{
            color: 'rgba(255,255,255,0.65)',
            fontSize: '0.85rem',
            marginTop: 0,
          }}
        >
          Le site tiers doit utiliser le slug <span className="code">{source.slug}</span> dans toutes les URL.
        </p>

        <div
          style={{
            background: 'rgba(15,15,20,0.7)',
            border: '1px solid rgba(204, 255, 0, 0.2)',
            borderRadius: 10,
            padding: 14,
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            fontSize: '0.82rem',
            color: 'rgba(255,255,255,0.85)',
            lineHeight: 1.8,
          }}
        >
          <div>
            <span style={{ color: '#4ade80' }}>POST</span> https://venio.paris/api/external/
            {source.slug}/entries
          </div>
          <div>
            <span style={{ color: 'var(--primary)' }}>GET&nbsp;</span> https://venio.paris/api/external/
            {source.slug}/entries/{'{externalId}'}
          </div>
          <div>
            <span style={{ color: 'var(--primary)' }}>GET&nbsp;</span> https://venio.paris/api/external/
            {source.slug}/entries?from=&to=
          </div>
          <div>
            <span style={{ color: 'var(--primary)' }}>GET&nbsp;</span> https://venio.paris/api/external/
            {source.slug}/ping
          </div>
        </div>

        <h3
          style={{
            margin: '20px 0 10px 0',
            fontSize: '0.85rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'rgba(204, 255, 0, 0.85)',
          }}
        >
          Headers requis
        </h3>
        <table className="accounting-table">
          <thead>
            <tr>
              <th>Header</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="code">X-Api-Key</td>
              <td>Clé API de la source (préfixe actuel : {source.apiKeyPrefix || '—'}…)</td>
            </tr>
            <tr>
              <td className="code">X-Venio-Signature</td>
              <td>HMAC-SHA256 du body brut, signé avec le secret webhook</td>
            </tr>
            <tr>
              <td className="code">X-Venio-Timestamp</td>
              <td>Timestamp Unix (s) inclus dans le calcul de la signature (anti-replay)</td>
            </tr>
            <tr>
              <td className="code">Idempotency-Key</td>
              <td>Identifiant unique de la requête côté tiers (anti-doublon)</td>
            </tr>
          </tbody>
        </table>

        {source.rotatedAt && (
          <p
            style={{
              marginTop: 14,
              fontSize: '0.78rem',
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            Dernière rotation de clé : {formatDateTime(source.rotatedAt)}
          </p>
        )}
      </section>
    </>
  )
}
