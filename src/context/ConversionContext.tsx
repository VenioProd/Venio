import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import BookingModal from '../components/conversion/BookingModal'
import CallbackModal from '../components/conversion/CallbackModal'

interface ConversionContextValue {
  openBooking: () => void
  openCallback: () => void
}

const noop = () => {}

// Hors provider, les ouvertures sont des no-op : un composant monté en dehors
// de l'arbre public (admin, espace client, test isolé) ne doit pas faire
// planter la page pour un bouton de conversion inerte.
const ConversionContext = createContext<ConversionContextValue>({ openBooking: noop, openCallback: noop })

type OpenModal = 'booking' | 'callback' | null

export function ConversionProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [openModal, setOpenModal] = useState<OpenModal>(null)

  const openBooking = useCallback(() => setOpenModal('booking'), [])
  const openCallback = useCallback(() => setOpenModal('callback'), [])
  const close = useCallback(() => setOpenModal(null), [])

  const value = useMemo<ConversionContextValue>(() => ({ openBooking, openCallback }), [openBooking, openCallback])

  return (
    <ConversionContext.Provider value={value}>
      {children}
      {/* Montage conditionnel : au repos, aucun champ des modales n'existe dans
          le DOM, sinon les libellés homonymes de la page Contact se dédoublent. */}
      {openModal === 'booking' && <BookingModal onClose={close} />}
      {openModal === 'callback' && <CallbackModal onClose={close} />}
    </ConversionContext.Provider>
  )
}

export function useConversion(): ConversionContextValue {
  return useContext(ConversionContext)
}
