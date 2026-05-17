import mongoose from 'mongoose'
import type { IAgentToken } from '../types/models/index.js'

/**
 * AgentToken : Personal Access Token utilisé par les agents externes
 * (Kuro, intégrations tierces) pour appeler /api/v1/agent/*.
 *
 * Sécurité :
 *   - tokenHash : bcrypt du secret entier — JAMAIS la clé en clair en base.
 *   - prefix    : "vno_pat_" + 4 chars discriminants (12 chars en clair),
 *                 permet le lookup rapide à la requête et l'affichage UI
 *                 (ex "vno_pat_a1b2…").
 *   - Le secret est affiché UNE SEULE FOIS à la création
 *     (POST /api/admin/agent-tokens), puis n'est plus jamais récupérable.
 *
 * Scopes : tableau de strings whitelisté (cf. lib/agent/scopes.ts). Pas de
 * lien vers un user — un token agent est indépendant des comptes humains.
 *
 * Cycle de vie :
 *   - status = 'ACTIVE' à la création
 *   - status = 'REVOKED' via POST /api/admin/agent-tokens/:id/revoke
 *   - expiresAt optionnel (null = jamais)
 *
 * On garde les tokens révoqués en base (pas de delete) pour traçabilité
 * audit log.
 */
const agentTokenSchema = new mongoose.Schema<IAgentToken>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    prefix: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, select: false },
    scopes: {
      type: [String],
      default: [],
      validate: {
        validator: (arr: unknown) => Array.isArray(arr) && arr.length > 0,
        message: 'Au moins un scope est requis',
      },
    },
    rateLimitPerMin: { type: Number, default: 120, min: 1, max: 10000 },
    status: {
      type: String,
      enum: ['ACTIVE', 'REVOKED'],
      default: 'ACTIVE',
      index: true,
    },
    expiresAt: { type: Date, default: null },

    // Stats / dernière utilisation
    lastUsedAt: { type: Date, default: null },
    lastUsedIp: { type: String, default: '' },
    lastUsedUserAgent: { type: String, default: '' },
    totalRequests: { type: Number, default: 0 },
    totalMutations: { type: Number, default: 0 },

    // Traçabilité admin
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: '', maxlength: 1000 },
  },
  { timestamps: true }
)

// Lookup rapide à la requête : (prefix, status) → 1 candidat normalement
agentTokenSchema.index({ prefix: 1, status: 1 })
// Ménage des expirés
agentTokenSchema.index({ status: 1, expiresAt: 1 })
// Liste admin la plus récente d'abord
agentTokenSchema.index({ createdAt: -1 })

export default mongoose.model<IAgentToken>('AgentToken', agentTokenSchema)
