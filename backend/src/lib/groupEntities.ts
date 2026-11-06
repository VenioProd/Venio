/**
 * Entités du Groupe Venio : la société qui porte une affaire.
 *
 * À ne pas confondre avec `Lead.project` (produit ou chantier concerné :
 * Artosera, Vigno…) ni avec les filiales du dossier SUPER_ADMIN
 * (`Subsidiary`, documents libres identifiés par un slug et reliés au CRM
 * par `leadProject`). Ici, une liste fermée : le périmètre CRM des
 * utilisateurs s'exprime dans ces valeurs.
 *
 *  - VENIO : maison mère (communication, conseil) — valeur par défaut ;
 *  - CREATIO : contenus pédagogiques ;
 *  - DECISIO : avocats ;
 *  - FORMATIO : formation continue (Qualiopi) ;
 *  - ARROW : SaaS pédagogique.
 */
export const GROUP_ENTITIES = ['VENIO', 'CREATIO', 'DECISIO', 'FORMATIO', 'ARROW'] as const
export type GroupEntity = (typeof GROUP_ENTITIES)[number]
export const DEFAULT_GROUP_ENTITY: GroupEntity = 'VENIO'

export function isGroupEntity(value: unknown): value is GroupEntity {
  return typeof value === 'string' && (GROUP_ENTITIES as readonly string[]).includes(value)
}

/**
 * Entité déduite du projet d'un lead. Seul Arrow est une entité à part
 * entière ; Artosera, Vigno, « autre » et le projet vide sont portés par Venio.
 */
export function entityFromProject(project: unknown): GroupEntity {
  return project === 'ARROW' ? 'ARROW' : DEFAULT_GROUP_ENTITY
}

/** Liste d'entités nettoyée : valeurs connues, sans doublon, dans l'ordre du groupe. */
export function normalizeEntityList(value: unknown): GroupEntity[] {
  if (!Array.isArray(value)) return []
  const wanted = new Set(value.filter(isGroupEntity))
  return GROUP_ENTITIES.filter((entity) => wanted.has(entity))
}

/**
 * Condition MongoDB sur `Lead.entity` pour un ensemble d'entités. Un lead
 * sans entité (antérieur à la migration 007) compte comme VENIO, la valeur
 * par défaut : `$in: [null]` couvre aussi le champ absent.
 */
export function entityCondition(entities: readonly GroupEntity[]): { $in: Array<GroupEntity | null> } {
  return { $in: entities.includes(DEFAULT_GROUP_ENTITY) ? [...entities, null] : [...entities] }
}

/** Entité effective d'un lead (absente → VENIO). */
export function leadEntityOf(lead: { entity?: unknown } | null | undefined): GroupEntity {
  return isGroupEntity(lead?.entity) ? lead!.entity : DEFAULT_GROUP_ENTITY
}
