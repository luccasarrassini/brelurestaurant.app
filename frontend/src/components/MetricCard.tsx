import type { LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'

type MetricCardProps = {
  title: string
  value: string | number
  icon: LucideIcon
  color: 'teal' | 'orange' | 'gray' | 'blue' | 'purple' | 'red' | 'green'
}

export default function MetricCard({ title, value, icon: Icon, color }: MetricCardProps) {
  return (
    <div className={clsx('metric-card', `metric-${color}`)}>
      <div className="flex-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="metric-card-label">{title}</p>
          <h3 className="metric-card-value">{value}</h3>
        </div>
        <div style={{ 
          width: 44, height: 44, borderRadius: 12, 
          display: 'grid', placeItems: 'center',
          background: color === 'teal' ? 'var(--emerald-50)' : 
                     color === 'orange' ? 'var(--amber-50)' : 
                     color === 'blue' ? 'var(--sky-50)' : 
                     color === 'gray' ? 'var(--violet-50)' :
                     color === 'green' ? 'var(--emerald-50)' :
                     color === 'red' ? 'var(--rose-50)' :
                     color === 'purple' ? 'var(--violet-50)' : 'var(--gray-100)',
          color: color === 'teal' ? 'var(--emerald-500)' :
                 color === 'orange' ? 'var(--amber-600)' :
                 color === 'blue' ? 'var(--sky-500)' :
                 color === 'gray' ? 'var(--violet-500)' :
                 color === 'green' ? 'var(--emerald-500)' :
                 color === 'red' ? 'var(--rose-500)' :
                 color === 'purple' ? 'var(--violet-500)' : 'var(--gray-500)',
          transition: 'transform 0.3s',
        }}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  )
}
