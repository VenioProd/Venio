import { useCallback, useEffect, useState } from 'react'
import {
  getExternalSource,
  listExternalTransactions,
} from '@/services/accounting'
import type {
  IExternalSource,
  IExternalTransaction,
} from '@/types/accounting'
import type { InfoForm, TxFilters } from './types'

interface UseExternalSourceReturn {
  source: IExternalSource | null
  loading: boolean
  error: string
  setError: (e: string) => void
  success: string
  setSuccess: (s: string) => void
  edit: InfoForm | null
  setEdit: (f: InfoForm | null) => void
  reload: () => Promise<void>
  transactions: IExternalTransaction[]
  txTotal: number
  txLoading: boolean
  txFilters: TxFilters
  setTxFilters: (f: TxFilters) => void
  reloadTransactions: () => Promise<void>
}

const DEFAULT_TX_FILTERS: TxFilters = {
  status: '',
  externalId: '',
  from: '',
  to: '',
  page: 1,
  limit: 50,
}

export function useExternalSource(id: string | undefined): UseExternalSourceReturn {
  const [source, setSource] = useState<IExternalSource | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [edit, setEdit] = useState<InfoForm | null>(null)

  const [transactions, setTransactions] = useState<IExternalTransaction[]>([])
  const [txTotal, setTxTotal] = useState(0)
  const [txLoading, setTxLoading] = useState(false)
  const [txFilters, setTxFilters] = useState<TxFilters>(DEFAULT_TX_FILTERS)

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const s = await getExternalSource(id)
      setSource(s)
      setEdit({
        description: s.description || '',
        autoValidateAll: !!s.autoValidateAll,
        rateLimitPerMin: s.rateLimitPerMin || 60,
        defaultJournalCode: s.defaultJournalCode || '',
        defaultCustomerAccount: s.defaultCustomerAccount || '',
        defaultRevenueAccount: s.defaultRevenueAccount || '',
        defaultExpenseAccount: s.defaultExpenseAccount || '',
        defaultBankAccount: s.defaultBankAccount || '',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    reload()
  }, [reload])

  const reloadTransactions = useCallback(async () => {
    if (!source) return
    setTxLoading(true)
    try {
      const r = await listExternalTransactions({
        sourceSlug: source.slug,
        status: txFilters.status || undefined,
        externalId: txFilters.externalId || undefined,
        from: txFilters.from || undefined,
        to: txFilters.to || undefined,
        page: txFilters.page,
        limit: txFilters.limit,
      })
      setTransactions(r.transactions || [])
      setTxTotal(r.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setTxLoading(false)
    }
  }, [source, txFilters])

  return {
    source,
    loading,
    error,
    setError,
    success,
    setSuccess,
    edit,
    setEdit,
    reload,
    transactions,
    txTotal,
    txLoading,
    txFilters,
    setTxFilters,
    reloadTransactions,
  }
}
