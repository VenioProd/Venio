import type { ILead } from '../types/models/index.js'

export function toRepLead(lead: ILead) {
  return {
    _id: lead._id,
    company: lead.company,
    contactName: lead.contactName,
    contactEmail: lead.contactEmail,
    contactPhone: lead.contactPhone,
    source: lead.source,
    project: lead.project,
    callList: lead.callList,
    lastCallOutcome: lead.lastCallOutcome,
    lastCallAt: lead.lastCallAt,
    doNotCall: lead.doNotCall,
    phoneInvalid: lead.phoneInvalid,
    // Les leads antérieurs à l'import n'ont pas ce champ, et la file passe par un aggregate sans défauts.
    extraInfo: lead.extraInfo ?? {},
    status: lead.status,
    priority: lead.priority,
    budget: lead.budget,
    nextActionAt: lead.nextActionAt,
    lastContactAt: lead.lastContactAt,
    // Après le passage, l'équipe reprend les notes : l'externe ne voit plus que les siennes.
    notes: lead.closingHandoff ? (lead.closingHandoff.repNotes ?? '') : lead.notes,
    serviceType: lead.serviceType,
    leadTemperature: lead.leadTemperature,
    lostReason: lead.lostReason,
    lostComment: lead.lostComment,
    handedOffAt: lead.closingHandoff?.at ?? null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  }
}
