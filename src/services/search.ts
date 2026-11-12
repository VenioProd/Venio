import { apiFetch } from '../lib/api'

export interface SearchResult {
  type: 'project' | 'client' | 'task' | 'lead'
  id: string
  title: string
  subtitle: string
  link: string
}

export async function globalSearch(q: string): Promise<SearchResult[]> {
  const res = (await apiFetch(`/api/admin/search?q=${encodeURIComponent(q)}`)) as { results: SearchResult[] }
  return res.results
}
