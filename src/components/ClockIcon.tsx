// Renders either an emoji or an uploaded image. The image is decorative; the
// button that opens the chooser carries the accessible name.

import { isImageIcon } from '../icons'

type ClockIconProps = {
  icon: string
  className?: string
}

export function ClockIcon({ icon, className }: ClockIconProps) {
  if (isImageIcon(icon)) {
    return <img className={className} src={icon} alt="" />
  }
  return (
    <span className={className} aria-hidden="true">
      {icon}
    </span>
  )
}
