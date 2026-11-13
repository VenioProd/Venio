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
    // Lot P ; absents des leads antérieurs (la file passe par un aggregate sans défauts).
    phoneCountry: lead.phoneCountry ?? '',
    businessContact: lead.businessContact ?? false,
    callUnreachableAt: lead.callUnreachableAt ?? null,
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
    // Champs de l'analyse d'appel : absents des leads antérieurs, et la file passe par un aggregate sans défauts.
    qualification: {
      need: lead.qualification?.need ?? '',
      timeline: lead.qualification?.timeline ?? '',
      decisionMaker: lead.qualification?.decisionMaker ?? '',
      objections: lead.qualification?.objections ?? [],
      competitors: lead.qualification?.competitors ?? [],
    },
    lastCallAnalysisAt: lead.lastCallAnalysisAt ?? null,
    // `call` : l'appel dont l'analyse a posé la retenue, pour ouvrir directement la bonne analyse.
    callHold: lead.callHold
      ? { at: lead.callHold.at, reason: lead.callHold.reason, call: lead.callHold.call ?? null }
      : null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  }
}
