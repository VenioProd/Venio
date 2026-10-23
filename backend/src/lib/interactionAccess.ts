import type { Request, Response } from 'express'
import mongoose from 'mongoose'
import { userHasPermission } from '../middleware/role.js'
import { PERMISSIONS } from './permissions.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import { isLeadOutOfScope } from './crmScope.js'
import type { InteractionSubjectType } from '../types/models/index.js'

interface ResolvedSubject {
  type: InteractionSubjectType
  id: mongoose.Types.ObjectId
  /** Adresse de contact par défaut, pré-remplie dans le composeur d'email. */
  contactEmail: string
  contactName: string
  label: string
}

// Les droits suivent le sujet, y compris pour les échanges saisis hors ligne.
export async function resolveSubject(
  req: Request,
  res: Response,
  mode: 'read' | 'write',
): Promise<ResolvedSubject | null> {
  const rawType = String(req.params.subjectType || '').toUpperCase()
  const { subjectId } = req.params

  if (rawType !== 'LEAD' && rawType !== 'CLIENT') {
    res.status(400).json({ error: 'Type de sujet inconnu' })
    return null
  }
  if (!mongoose.isValidObjectId(subjectId)) {
    res.status(400).json({ error: 'Identifiant invalide' })
    return null
  }

  if (rawType === 'LEAD') {
    const permission = mode === 'read' ? PERMISSIONS.VIEW_CRM : PERMISSIONS.MANAGE_CRM
    if (!(await userHasPermission(req, permission))) {
      res.status(403).json({ error: 'Forbidden' })
      return null
    }
    const lead = await Lead.findById(subjectId).select('company contactName contactEmail assignedTo createdBy')
    if (!lead || ((mode === 'write' || req.user!.role !== 'COMMERCIAL') && isLeadOutOfScope(req, lead))) {
      res.status(404).json({ error: 'Lead not found' })
      return null
    }
    return {
      type: 'LEAD',
      id: lead._id as mongoose.Types.ObjectId,
      contactEmail: lead.contactEmail || '',
      contactName: lead.contactName || '',
      label: lead.company,
    }
  }

  if (!(await userHasPermission(req, PERMISSIONS.MANAGE_CLIENTS))) {
    res.status(403).json({ error: 'Forbidden' })
    return null
  }
  const client = await User.findOne({ _id: subjectId, role: 'CLIENT' }).select('name email companyName ownerAdminId')
  if (!client) {
    res.status(404).json({ error: 'Client not found' })
    return null
  }
  // Même règle de périmètre que ensureClient() côté fiche client.
  if (req.user!.role !== 'SUPER_ADMIN' && client.ownerAdminId?.toString() !== req.user!.id) {
    res.status(404).json({ error: 'Client not found' })
    return null
  }
  return {
    type: 'CLIENT',
    id: client._id as mongoose.Types.ObjectId,
    contactEmail: client.email || '',
    contactName: client.name || '',
    label: client.companyName || client.name || '',
  }
}
