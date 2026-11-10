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
