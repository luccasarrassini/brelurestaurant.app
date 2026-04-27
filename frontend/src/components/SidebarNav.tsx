import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'

/* ─── NavItem ─── */
export interface NavItemProps {
  label: string
  path: string
  icon: LucideIcon
}

export function NavItem({ label, path, icon: Icon }: NavItemProps) {
  const location = useLocation()
  return (
    <Link
      to={path}
      className={clsx('nav-item', location.pathname === path && 'active')}
    >
      <Icon size={20} />
      {label}
    </Link>
  )
}

/* ─── NavGroup (collapsible) ─── */
export interface NavGroupProps {
  label: string
  icon: LucideIcon
  basePath: string
  children: NavItemProps[]
}

export function NavGroup({ label, icon: Icon, basePath, children }: NavGroupProps) {
  const location = useLocation()
  const isActive = location.pathname.startsWith(basePath)
  const [expanded, setExpanded] = useState(isActive)

  return (
    <div className="nav-group">
      <button
        type="button"
        className={clsx('nav-item nav-group-toggle', isActive && 'active')}
        onClick={() => setExpanded(prev => !prev)}
      >
        <Icon size={20} />
        {label}
        <ChevronDown
          size={16}
          className={clsx('nav-chevron', expanded && 'expanded')}
        />
      </button>

      {expanded && (
        <div className="nav-subitems">
          {children.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={clsx('nav-subitem', location.pathname === item.path && 'active')}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
