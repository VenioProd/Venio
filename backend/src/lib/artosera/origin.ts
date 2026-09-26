import cors from 'cors'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

/**
 * Le site vitrine artosera.com poste la sélection d'un prospect sur
 * `POST /api/artosera/devis`. C'est la seule route que ces origines peuvent
 * appeler en cross-origin : le CORS global de l'application reste limité à
 * `CORS_ORIGIN` (venio.paris), avec credentials.
 */
export const ARTOSERA_SITE_ORIGINS: readonly string[] = ['https://artosera.com', 'https://www.artosera.com']

/**
 * Destinataire imposé aux envois venus du site : la page est publique et
 * ouverte à tous, laisser le navigateur choisir l'adresse ferait de la route
 * un relais d'envoi vers n'importe qui.
 */
export const ARTOSERA_SITE_RECIPIENT = 'contact@venio.paris'

/** Chemin, vu depuis l'application, de la seule route ouverte au site. */
export const ARTOSERA_SITE_PATH = '/api/artosera/devis'

export function isArtoseraSiteOrigin(origin: unknown): origin is string {
  return typeof origin === 'string' && ARTOSERA_SITE_ORIGINS.includes(origin)
}

/**
 * CORS propre à la route : origines du site uniquement, POST JSON, sans
 * credentials (le site n'a aucune session Venio à transmettre).
 */
const siteCors = cors({
  origin: [...ARTOSERA_SITE_ORIGINS],
  methods: ['POST'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
  maxAge: 600,
})

/** Applique le CORS du site aux seules requêtes qui en viennent. */
export function artoseraSiteCors(req: Request, res: Response, next: NextFunction): void {
  if (!isArtoseraSiteOrigin(req.headers.origin)) return next()
  siteCors(req, res, next)
}

/**
 * Le CORS global répond lui-même aux préflights et poserait
 * `Access-Control-Allow-Origin: <CORS_ORIGIN>` avec credentials. Pour la route
 * du site appelée depuis artosera.com, on le laisse passer afin que le router
 * applique `artoseraSiteCors`. Toutes les autres requêtes, y compris celles
 * de venio.paris sur cette même route, gardent le CORS global inchangé.
 */
export function withArtoseraSiteCorsBypass(globalCors: RequestHandler): RequestHandler {
  return (req, res, next) => {
    const onSitePath = req.path.replace(/\/+$/, '').toLowerCase() === ARTOSERA_SITE_PATH
    if (onSitePath && isArtoseraSiteOrigin(req.headers.origin)) return next()
    return globalCors(req, res, next)
  }
}
