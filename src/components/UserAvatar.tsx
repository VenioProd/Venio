import { useState } from 'react'

interface UserAvatarProps {
  name: string
  avatarUrl?: string
  size?: number
  className?: string
  style?: React.CSSProperties
}

const UserAvatar = ({ name, avatarUrl, size = 36, className, style }: UserAvatarProps) => {
  const [imgError, setImgError] = useState(false)
  const initial = (name || '?').charAt(0).toUpperCase()

  const baseStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style,
  }

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={className}
        style={{ ...baseStyle, objectFit: 'cover' }}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div className={className} style={baseStyle}>
      {initial}
    </div>
  )
}

export default UserAvatar
