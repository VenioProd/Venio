import { useState, useEffect, ReactNode } from 'react'

interface Props { left: ReactNode; right: ReactNode }

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

const TwoColumnGrid = ({ left, right }: Props) => {
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState<'left' | 'right'>('left')

  if (!isMobile) {
    return (
      <div className="dash-twocol">
        <div className="dash-twocol__col">{left}</div>
        <div className="dash-twocol__col">{right}</div>
      </div>
    )
  }

  return (
    <div className="dash-twocol-mobile">
      <div className="dash-twocol-mobile__tabs">
        <button
          type="button"
          className={`dash-twocol-mobile__tab${activeTab === 'left' ? ' dash-twocol-mobile__tab--active' : ''}`}
          onClick={() => setActiveTab('left')}
        >Action</button>
        <button
          type="button"
          className={`dash-twocol-mobile__tab${activeTab === 'right' ? ' dash-twocol-mobile__tab--active' : ''}`}
          onClick={() => setActiveTab('right')}
        >Analytics</button>
      </div>
      <div>{activeTab === 'left' ? left : right}</div>
    </div>
  )
}

export default TwoColumnGrid
