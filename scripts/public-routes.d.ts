/** Déclaration de types pour `public-routes.js`, seule source des pages publiques indexables. */
export declare const SITE_URL: string

export interface PublicRoute {
  /** Chemin servi, chaîne vide pour la racine. */
  path: string
  priority: string
  changefreq: string
  /** Titre annoncé aux moteurs, indépendant de celui du composant. */
  title: string
  description: string
  /** Doit être une phrase réellement présente sur la page. */
  h1: string
  content: string
}

export declare const publicRoutes: PublicRoute[]
