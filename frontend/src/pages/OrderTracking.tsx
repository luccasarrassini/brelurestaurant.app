import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCents } from '../lib/money'

type OrderItem = {
  id: string
  quantity: number
  price: number
  notes: string | null
  product: {
    name: string
  } | null
}

type TrackingOrder = {
  id: string
  order_number: number | null
  status: string
  total: number
  created_at: string
  tracking_token: string
  items: OrderItem[]
  restaurant: {
    name: string
    logo_url: string | null
  } | null
}

const statusSteps = [
  { key: 'pending', label: 'Recebido', icon: '📋' },
  { key: 'preparing', label: 'Em Preparo', icon: '🍳' },
  { key: 'ready', label: 'Pronto', icon: '✅' },
  { key: 'delivered', label: 'Entregue', icon: '🏠' },
]

function getStatusIndex(status: string): number {
  const aliases: Record<string, string> = {
    created: 'pending',
    paid: 'pending',
    out_for_delivery: 'ready',
    delivering: 'ready',
  }
  const normalized = aliases[status] ?? status
  const idx = statusSteps.findIndex((s) => s.key === normalized)
  return idx >= 0 ? idx : 0
}

export default function OrderTracking() {
  const { token } = useParams<{ token: string }>()
  const [order, setOrder] = useState<TrackingOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    async function fetchOrder() {
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(
          'id, status, total, created_at, tracking_token, restaurant:restaurants(name, logo_url), items:order_items(id, quantity, price, notes, product:products(name))',
        )
        .eq('tracking_token', token!)
        .single()

      if (fetchError || !data) {
        setError('Pedido não encontrado.')
        setLoading(false)
        return
      }

      setOrder(data as unknown as TrackingOrder)
      setLoading(false)
    }

    fetchOrder()
  }, [token])

  // Realtime updates
  useEffect(() => {
    if (!token) return

    const channel = supabase
      .channel(`tracking-${token}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `tracking_token=eq.${token}`,
        },
        (payload) => {
          setOrder((prev) => {
            if (!prev) return prev
            return { ...prev, ...payload.new } as TrackingOrder
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [token])

  if (loading) {
    return (
      <div className="tracking-page">
        <div className="tracking-loading">
          <div className="tracking-spinner" />
          <p>Carregando pedido...</p>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="tracking-page">
        <div className="tracking-error">
          <span className="tracking-error-icon">🔍</span>
          <h2>Pedido não encontrado</h2>
          <p>Verifique o link e tente novamente.</p>
        </div>
      </div>
    )
  }

  const currentStepIndex = getStatusIndex(order.status)
  const isDelivered = order.status === 'delivered'

  return (
    <div className="tracking-page">
      <header className="tracking-header">
        {order.restaurant?.logo_url && (
          <img
            src={order.restaurant.logo_url}
            alt={order.restaurant?.name ?? 'Restaurante'}
            className="tracking-logo"
          />
        )}
        <h1>{order.restaurant?.name ?? 'Restaurante'}</h1>
      </header>

      <div className="tracking-card">
        <h2>
          Pedido #{order.order_number ?? order.id.slice(0, 6)}
        </h2>
        <p className="tracking-date">
          Realizado às{' '}
          {new Date(order.created_at).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          de{' '}
          {new Date(order.created_at).toLocaleDateString('pt-BR')}
        </p>

        <div className="status-timeline">
          {statusSteps.map((step, index) => {
            const isActive = index === currentStepIndex
            const isCompleted = index < currentStepIndex || isDelivered
            return (
              <div
                key={step.key}
                className={`status-step${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}`}
              >
                <div className="status-step-icon">
                  {isCompleted ? '✓' : step.icon}
                </div>
                <span className="status-step-label">{step.label}</span>
                {index < statusSteps.length - 1 && (
                  <div className={`status-step-line${isCompleted ? ' completed' : ''}`} />
                )}
              </div>
            )
          })}
        </div>

        <div className="tracking-items">
          <h3>Itens do pedido</h3>
          <ul className="tracking-items-list">
            {order.items?.map((item) => (
              <li key={item.id} className="tracking-item">
                <span className="tracking-item-qty">{item.quantity}x</span>
                <span className="tracking-item-name">
                  {item.product?.name ?? 'Produto'}
                </span>
                {item.notes && (
                  <span className="tracking-item-notes">{item.notes}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="tracking-total">
          <strong>Total</strong>
          <strong>{formatCents(order.total)}</strong>
        </div>
      </div>

      <footer className="tracking-footer">
        <p>Powered by <strong>Brelu</strong></p>
      </footer>
    </div>
  )
}
