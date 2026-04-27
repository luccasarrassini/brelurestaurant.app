import { Link, useLocation } from 'react-router-dom'
import { useAdmin } from './AdminContext'
import { NavItem, NavGroup } from './SidebarNav'
import { 
  LayoutDashboard, 
  UtensilsCrossed, 
  Truck, 
  ChefHat, 
  Settings, 
  Bell, 
  HelpCircle,
  Flame,
  BarChart3,
  FileText,
  ClipboardList,
  BookOpen
} from 'lucide-react'
import { clsx } from 'clsx'

type AdminLayoutProps = {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export default function AdminLayout({ title, actions, children }: AdminLayoutProps) {
  const { restaurants, selectedRestaurantId, setSelectedRestaurantId } = useAdmin()
  const location = useLocation()

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-badge">
            <Flame size={22} />
          </div>
          <span className="brand-name">Brelu</span>
        </div>

        <nav className="nav-section">
          <NavGroup
            label="Dashboard"
            icon={LayoutDashboard}
            basePath="/dashboard"
            children={[
              { label: 'Dashboard diário', path: '/dashboard', icon: BarChart3 },
              { label: 'Relatório de pedidos', path: '/dashboard/orders', icon: FileText },
            ]}
          />

          <NavGroup
            label="Cozinha"
            icon={ChefHat}
            basePath="/kitchen"
            children={[
              { label: 'Meus Pedidos', path: '/kitchen', icon: ClipboardList },
            ]}
          />
          <NavGroup
            label="Gestão de cardápio"
            icon={UtensilsCrossed}
            basePath="/menu"
            children={[
              { label: 'Cardápio', path: '/menu', icon: BookOpen },
            ]}
          />
          <NavItem label="Entregadores" path="/deliveries/drivers" icon={Truck} />
        </nav>

        <div className="sidebar-footer">
          <Link to="/settings" className={clsx('nav-item', location.pathname === '/settings' && 'active')}>
            <Settings size={20} />
            Configurações
          </Link>
          <div className="nav-item" style={{ cursor: 'pointer' }}>
            <HelpCircle size={20} />
            Ajuda
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="top-bar">
          <div className="top-bar-actions">
            <div style={{ position: 'relative', cursor: 'pointer' }}>
              <Bell size={20} color="var(--gray-400)" />
              <span style={{ 
                position: 'absolute', top: -5, right: -5, 
                background: 'linear-gradient(135deg, var(--rose-500), var(--rose-600))', 
                color: '#fff', fontSize: '10px', width: 18, height: 18, 
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, boxShadow: '0 2px 6px rgba(244,63,94,0.3)'
              }}>2</span>
            </div>

            <div className="user-profile">
              <img 
                src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop" 
                alt="User" 
                className="avatar" 
              />
            </div>

            <select
              className="button-ghost"
              style={{ padding: '8px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
              value={selectedRestaurantId ?? ''}
              onChange={(event) => setSelectedRestaurantId(event.target.value)}
            >
              {restaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
          </div>
        </header>

        <main className="content-wrapper">
          <header className="mb-4 flex-between">
            <div>
              <h1>{title}</h1>
            </div>
            <div className="flex gap-3">
              {actions}
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  )
}
