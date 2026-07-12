import type { Request, Response } from 'express'

/**
 * Terminal handler for the API namespace. It must run after every API router
 * and before static/SPA handlers so an unknown API URL can never become a
 * successful HTML navigation response.
 */
export default function apiNotFound(req: Request, res: Response): void {
  res.status(404).json({
    error: 'API endpoint not found',
    code: 'API_NOT_FOUND',
    path: req.path,
  })
}
