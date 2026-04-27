import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { useAdmin } from '../components/AdminContext'
import MetricCard from '../components/MetricCard'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import {
  ShoppingBag,
  Clock,
  DollarSign,
  Truck,
} from 'lucide-react'
import { formatCents } from '../lib/money'
import { supabase } from '../lib/supabase'

interface OrdersByHour {
  hour: string
  count: number
}

interface DeliveryDistribution {
  name: string
  value: number
}

export default function Dashboard() {
  const { selectedRestaurantId } = useAdmin()

  const [ordersByHour, setOrdersByHour] = useState<OrdersByHour[]>([])
  const [deliveryDistribution, setDeliveryDistribution] = useState<DeliveryDistribution[]>([])
  const [dashboardMetrics, setDashboardMetrics] = useState({
    todayOrdersCount: 0,
    pendingOrdersCount: 0,
    todayRevenue: 0,
    todayDeliveryFees: 0
  })

  const loadDashboardData = useCallback(async () => {
    if (!selectedRestaurantId) return
    const todayBegin = new Date(); todayBegin.setHours(0,0,0,0)
    const { data: todayOrders } = await supabase
      .from('orders')
      .select('delivery_type, created_at, status, total, delivery_fee')
      .eq('restaurant_id', selectedRestaurantId)
      .gte('created_at', todayBegin.toISOString())
      .neq('status', 'cancelled')

    const dist: Record<string, number> = { delivery: 0, pickup: 0, dine_in: 0 }
    const hourCounts: Record<string, number> = {}

    let todayOrdersCount = 0
    let pendingOrdersCount = 0
    let todayRevenue = 0
    let todayDeliveryFees = 0

    todayOrders?.forEach(o => {
      todayOrdersCount++
      if (o.status === 'pending') pendingOrdersCount++
      todayRevenue += Number(o.total) || 0
      todayDeliveryFees += Number(o.delivery_fee) || 0

      const type = o.delivery_type || 'dine_in'
      if (dist[type] !== undefined) dist[type]++
      
      const hourStr = `${new Date(o.created_at).getHours()}h`
      hourCounts[hourStr] = (hourCounts[hourStr] || 0) + 1
    })

    setDashboardMetrics({ todayOrdersCount, pendingOrdersCount, todayRevenue, todayDeliveryFees })

    setDeliveryDistribution([
      { name: 'Delivery', value: dist.delivery },
      { name: 'Retirada', value: dist.pickup },
      { name: 'Local', value: dist.dine_in }
    ].filter(d => d.value > 0))

    const chartData = Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour))
    setOrdersByHour(chartData)
  }, [selectedRestaurantId])

  // Realtime for metrics
  useEffect(() => {
    if (!selectedRestaurantId) return
    loadDashboardData()

    const channel = supabase
      .channel(`dashboard-metrics-${selectedRestaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${selectedRestaurantId}`,
        },
        () => loadDashboardData(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadDashboardData, selectedRestaurantId])

  return (
    <AdminLayout title="Dashboard Diário">
      <div className="metrics-grid">
        <MetricCard title="Pedidos de Hoje" value={dashboardMetrics.todayOrdersCount} icon={ShoppingBag} color="teal" />
        <MetricCard title="Pedidos Pendentes" value={dashboardMetrics.pendingOrdersCount} icon={Clock} color="orange" />
        <MetricCard title="Faturamento" value={formatCents(dashboardMetrics.todayRevenue)} icon={DollarSign} color="gray" />
        <MetricCard title="Taxa de Entrega" value={formatCents(dashboardMetrics.todayDeliveryFees)} icon={Truck} color="blue" />
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Vendas Diárias</h3></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ordersByHour}>
                <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: 'var(--gray-500)', fontSize: 11 }} />
                <YAxis hide />
                <Tooltip cursor={{ fill: 'var(--gray-50)' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)' }} />
                <Bar dataKey="count" fill="var(--blue-600)" radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-body flex-center" style={{ minHeight: '340px' }}>
            {deliveryDistribution.length > 0 ? (
              <div className="flex w-full items-center">
                <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={deliveryDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={4}>
                        {deliveryDistribution.map((e, idx) => <Cell key={idx} fill={e.name === 'Delivery' ? '#1b74e4' : e.name === 'Retirada' ? '#f59e0b' : '#ef4444'} stroke="none" />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {['Delivery', 'Retirada', 'Local'].map(n => (
                    <div key={n} className="flex-center gap-2">
                      <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: n === 'Delivery' ? '#1b74e4' : n === 'Retirada' ? '#f59e0b' : '#ef4444' }} />
                      <span className="text-xs font-medium">{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-gray-400">Sem dados.</p>}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
