import { useSearchParams } from 'react-router-dom'
import { useCallback } from 'react'

export function useTabState(defaultTab: string, paramName = 'tab'): [string, (tab: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get(paramName) || defaultTab

  const setActiveTab = useCallback(
    (tab: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (tab === defaultTab) {
            next.delete(paramName)
          } else {
            next.set(paramName, tab)
          }
          return next
        },
        { replace: true },
      )
    },
    [defaultTab, paramName, setSearchParams],
  )

  return [activeTab, setActiveTab]
}
