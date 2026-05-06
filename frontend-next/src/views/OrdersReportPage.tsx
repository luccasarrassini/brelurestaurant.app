import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { useAdmin } from '../components/AdminContext'
import MetricCard from '../components/MetricCard'
import { 
  fetchOrdersForRestaurant, 
  updateOrderStatus, 
  fetchOrderPayments,
  type OrderSummary
} from '../api/admin'
import { fetchProfilesByIds, type Profile } from '../api/profiles'
import { Printer, ShoppingBag, XCircle, DollarSign, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import { formatCents } from '../lib/money'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import { DateRangePicker } from '../components/DateRangePicker'

const analysisStatuses = ['pending', 'created', 'paid']

function buildAddress(delivery: OrderSummary['deliveries']) {
  const item = delivery?.[0]
  if (!item || item.delivery_type !== 'delivery') return null
  const parts = [
    item.street,
    item.number ? `, ${item.number}` : '',
    item.neighborhood ? ` - ${item.neighborhood}` : '',
    item.city ? `, ${item.city}` : '',
  ]
  return parts.filter(Boolean).join('')
}

function getOrderNumber(order: OrderSummary) {
  return order.order_number ?? Number.parseInt(order.id.slice(0, 6), 16)
}

function paymentMethodLabel(method: string) {
  const map: Record<string, string> = {
    pix: 'PIX',
    card: 'Cartão',
    cash: 'Dinheiro',
    split: 'Dividido',
    other: 'Outro',
  }
  return map[method] ?? method
}

function nextStatus(current: string | null) {
  if (!current || analysisStatuses.includes(current)) return 'preparing'
  if (current === 'preparing') return 'ready'
  if (current === 'ready') return 'out_for_delivery'
  if (current === 'out_for_delivery' || current === 'delivering') return 'delivered'
  return current
}

function statusLabel(s: string | null) {
  const map: Record<string, string> = {
    pending: 'Em análise', created: 'Em análise', paid: 'Em análise',
    preparing: 'Em produção',
    ready: 'Pronto', out_for_delivery: 'Pronto',
    delivered: 'Finalizado',
    cancelled: 'Cancelado',
  }
  return map[s ?? ''] ?? s ?? '—'
}

export default function OrdersReportPage() {
  const { selectedRestaurantId } = useAdmin()
  const { pushToast } = useToast()

  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [selectedOrder, setSelectedOrder] = useState<OrderSummary | null>(null)
  const [selectedOrderPayments, setSelectedOrderPayments] = useState<Array<{id: string; method: string; amount_cents: number; change_cents: number}>>([])
  const [showCancelDrawer, setShowCancelDrawer] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' })

  // Filtros
  const [filterPayment, setFilterPayment] = useState<string>('all')
  const [filterDelivery, setFilterDelivery] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Paginação
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const loadOrders = useCallback(async () => {
    if (!selectedRestaurantId) return
    // Load ALL orders for the period (no limit) — pagination is client-side
    const result = await fetchOrdersForRestaurant(selectedRestaurantId, undefined, dateRange.start || undefined, dateRange.end || undefined)
    if (result.error) {
      console.error(result.error)
      return
    }
    const loaded = result.data ?? []
    setOrders(loaded as unknown as OrderSummary[])
    const ids = Array.from(new Set(loaded.map(o => o.customer_id).filter(Boolean))) as string[]
    if (ids.length > 0) {
      const pResult = await fetchProfilesByIds(ids)
      if (!pResult.error) {
        const map = Object.fromEntries((pResult.data ?? []).map(p => [p.user_id, p]))
        setProfiles(map)
      }
    }
  }, [selectedRestaurantId, dateRange.start, dateRange.end])

  useEffect(() => {
    if (!selectedRestaurantId) return
    const channel = supabase
      .channel(`orders-report-${selectedRestaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${selectedRestaurantId}` },
        () => loadOrders(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadOrders, selectedRestaurantId])

  useEffect(() => {
    if (selectedRestaurantId) loadOrders()
  }, [selectedRestaurantId, loadOrders])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filterPayment, filterDelivery, filterStatus, searchQuery, dateRange, pageSize])

  // Filtered orders (client-side)
  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return orders.filter(o => {
      // Payment filter
      if (filterPayment !== 'all') {
        const directMethod = (o as any).payment_method as string | null
        const joinedMethods = o.payments?.map(p => p.method) ?? []
        const allMethods = directMethod ? [directMethod, ...joinedMethods] : joinedMethods
        if (!allMethods.includes(filterPayment)) return false
      }
      // Delivery filter
      if (filterDelivery !== 'all') {
        const directType = (o as any).delivery_type as string | null
        const joinedType = o.deliveries?.[0]?.delivery_type
        const dtype = directType || joinedType
        if (dtype !== filterDelivery) return false
      }
      // Status filter
      if (filterStatus !== 'all') {
        const status = o.status ?? ''
        if (filterStatus === 'analysis' && !analysisStatuses.includes(status)) return false
        if (filterStatus === 'preparing' && status !== 'preparing') return false
        if (filterStatus === 'ready' && status !== 'ready' && status !== 'out_for_delivery') return false
        if (filterStatus === 'delivered' && status !== 'delivered') return false
        if (filterStatus === 'cancelled' && status !== 'cancelled') return false
      }
      // Search filter
      if (q) {
        const orderNum = String(o.order_number ?? Number.parseInt(o.id.slice(0, 6), 16))
        const cName = (o.customer_name ?? (o.customer_id ? profiles[o.customer_id]?.name : '') ?? '').toLowerCase()
        if (!orderNum.includes(q) && !cName.includes(q)) return false
      }
      return true
    })
  }, [orders, filterPayment, filterDelivery, filterStatus, searchQuery, profiles])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedOrders = filteredOrders.slice((safePage - 1) * pageSize, safePage * pageSize)

  // Page numbers to show
  const pageNumbers = useMemo(() => {
    const pages: number[] = []
    const maxVisible = 5
    let start = Math.max(1, safePage - Math.floor(maxVisible / 2))
    const end = Math.min(totalPages, start + maxVisible - 1)
    start = Math.max(1, end - maxVisible + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }, [safePage, totalPages])

  // Metrics from ALL filtered orders (not just current page)
  const metrics = useMemo(() => {
    let totalOrders = 0
    let cancelledOrders = 0
    let totalRevenue = 0
    filteredOrders.forEach(o => {
      totalOrders++
      if (o.status === 'cancelled') {
        cancelledOrders++
      } else {
        totalRevenue += Number(o.total) || 0
      }
    })
    return { totalOrders, cancelledOrders, totalRevenue }
  }, [filteredOrders])

  async function handleStatusChange(orderId: string, status: string) {
    const result = await updateOrderStatus(orderId, status)
    if (result.error) {
      pushToast('Erro ao atualizar status')
      return
    }
    setOrders(prev => prev.map(order => (order.id === orderId ? { ...order, status } : order)))
    pushToast('Status atualizado')
  }

  async function handlePrint(order: OrderSummary | null) {
    if (!order) return
    window.open(`/order/${order.id}/print`, '_blank', 'width=450,height=600')
    await supabase.from('orders').update({ printed: true }).eq('id', order.id)
    loadOrders()
    pushToast('Enviado para impressão')
  }

  const handleCancelOrder = async () => {
    if (!selectedOrder) return
    const { error } = await supabase.from('orders').update({ status: 'cancelled', cancel_reason: cancelReason }).eq('id', selectedOrder.id)
    if (error) pushToast('Erro ao cancelar')
    else {
      pushToast('Pedido cancelado')
      setSelectedOrder(null)
      setShowCancelDrawer(false)
      loadOrders()
    }
  }

  return (
    <AdminLayout title="Relatório de Pedidos">
      {/* Date picker */}
      <div className="flex gap-4 mb-6 flex-wrap items-center">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Metric cards */}
      <div className="metrics-grid mb-6">
        <MetricCard title="Total de Pedidos" value={metrics.totalOrders} icon={ShoppingBag} color="teal" />
        <MetricCard title="Pedidos Cancelados" value={metrics.cancelledOrders} icon={XCircle} color="orange" />
        <MetricCard title="Faturamento Total" value={formatCents(metrics.totalRevenue)} icon={DollarSign} color="gray" />
      </div>

      {/* Single card with filters + table + pagination */}
      <div className="card">
        <div className="card-header">
          <div className="report-filters">
            <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} className="report-select">
              <option value="all">Pagamento</option>
              <option value="pix">PIX</option>
              <option value="card">Cartão</option>
              <option value="cash">Dinheiro</option>
            </select>

            <select value={filterDelivery} onChange={e => setFilterDelivery(e.target.value)} className="report-select">
              <option value="all">Entrega</option>
              <option value="delivery">Delivery</option>
              <option value="pickup">Retirada</option>
              <option value="dine_in">Local</option>
            </select>

            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="report-select">
              <option value="all">Status</option>
              <option value="analysis">Em análise</option>
              <option value="preparing">Em produção</option>
              <option value="ready">Pronto</option>
              <option value="delivered">Finalizado</option>
              <option value="cancelled">Cancelado</option>
            </select>

            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1) }} className="report-select">
              <option value="10">10 linhas</option>
              <option value="20">20 linhas</option>
              <option value="50">50 linhas</option>
              <option value="100">100 linhas</option>
            </select>

            <div className="report-search-box">
              <Search size={16} className="report-search-icon" />
              <input
                type="text"
                placeholder="Buscar"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="report-search-input"
              />
            </div>
          </div>
        </div>

        {/* Pagination - top of card */}
        {totalPages > 1 && (
          <div className="pagination" style={{ borderTop: 'none', borderBottom: '1px solid var(--gray-100)', marginTop: 0, marginBottom: 0, padding: '12px 20px' }}>
            <span className="pagination-info">
              {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, filteredOrders.length)} de {filteredOrders.length}
            </span>
            <div className="pagination-controls">
              <button type="button" className="pagination-btn" disabled={safePage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
                <ChevronLeft size={16} />
              </button>
              {pageNumbers[0] > 1 && (
                <>
                  <button type="button" className="pagination-btn" onClick={() => setCurrentPage(1)}>1</button>
                  {pageNumbers[0] > 2 && <span className="pagination-dots">…</span>}
                </>
              )}
              {pageNumbers.map(n => (
                <button key={n} type="button" className={clsx('pagination-btn', n === safePage && 'active')} onClick={() => setCurrentPage(n)}>
                  {n}
                </button>
              ))}
              {pageNumbers[pageNumbers.length - 1] < totalPages && (
                <>
                  {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && <span className="pagination-dots">…</span>}
                  <button type="button" className="pagination-btn" onClick={() => setCurrentPage(totalPages)}>{totalPages}</button>
                </>
              )}
              <button type="button" className="pagination-btn" disabled={safePage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="card-body">
          <div className="table-container" style={{ border: 'none' }}>
            <table className="modern-table">
              <thead><tr>
                <th style={{ background: 'transparent' }}>Nº</th>
                <th style={{ background: 'transparent' }}>Cliente</th>
                <th style={{ background: 'transparent' }}>Valor</th>
                <th style={{ background: 'transparent' }}>Status</th>
                <th style={{ background: 'transparent' }}>Hora</th>
              </tr></thead>
              <tbody>
                {paginatedOrders.map(o => {
                  const cName = o.customer_name ?? (o.customer_id ? profiles[o.customer_id]?.name : null) ?? 'Cliente Novo'
                  const date = o.created_at ? new Date(o.created_at) : new Date()
                  return (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={async () => { setSelectedOrder(o); const res = await fetchOrderPayments(o.id); setSelectedOrderPayments(res.data ?? []) }}>
                      <td className="font-bold text-gray-600">#{getOrderNumber(o)}</td>
                      <td className="font-bold text-gray-900">{cName}</td>
                      <td className="font-bold text-gray-900">{formatCents(o.total)}</td>
                      <td><span className={clsx('badge', `badge-${o.status}`)} style={{ textTransform: 'capitalize' }}>{statusLabel(o.status)}</span></td>
                      <td className="text-gray-500 font-medium">
                        <div className="flex items-center gap-3">
                          {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          <button 
                            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600 transition-colors"
                            onClick={(e) => { e.stopPropagation(); handlePrint(o) }}
                            title="Imprimir Pedido"
                          >
                            <Printer size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredOrders.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-400)' }}>Nenhum pedido encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedOrder && (
        <div className="modal-backdrop">
          <div className="modal large">
            <div className="modal-header">
              <h3>Pedido #{getOrderNumber(selectedOrder)}</h3>
              <button type="button" onClick={() => setSelectedOrder(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="order-grid">
                <div className="info-col">
                  <h4>Status: {statusLabel(selectedOrder.status)}</h4>
                  <p>Total: {formatCents(selectedOrder.total)}</p>
                  <p>Cliente: {selectedOrder.customer_name ?? (selectedOrder.customer_id ? profiles[selectedOrder.customer_id]?.name : null) ?? 'Cliente Novo'}</p>
                  <p>Endereço: {buildAddress(selectedOrder.deliveries) ?? 'Retirada / Balcão'}</p>
                  {selectedOrder.deliveries?.[0]?.delivery_type === 'delivery' && (
                    <p>Taxa de entrega: {formatCents(selectedOrder.deliveries[0].fee_cents)}</p>
                  )}
                  <div style={{ marginTop: '8px' }}>
                    <strong>Pagamento:</strong>
                    {selectedOrderPayments.length > 0 ? (
                      <ul style={{ margin: '4px 0', paddingLeft: '16px' }}>
                        {selectedOrderPayments.map(p => (
                          <li key={p.id}>{paymentMethodLabel(p.method)} — {formatCents(p.amount_cents)}</li>
                        ))}
                      </ul>
                    ) : (
                      <span style={{ color: 'var(--rose-500)', marginLeft: '8px' }}>⚠️ Nenhum pagamento registrado</span>
                    )}
                  </div>
                </div>
                <div className="items-col">
                   {selectedOrder.order_items?.map(i => (
                     <div key={i.id} className="item-row">
                       <span>{i.quantity}x {i.name_snapshot}</span>
                       <span>{formatCents(i.price_cents_snapshot * i.quantity)}</span>
                     </div>
                   ))}
                </div>
              </div>
              <div className="modal-footer mt-4 gap-2">
                <button className="button-secondary flex-center gap-2" onClick={() => handlePrint(selectedOrder)}>
                  <Printer size={18} /> Imprimir Pedido
                </button>
                <button className="button-secondary" onClick={() => handleStatusChange(selectedOrder.id, nextStatus(selectedOrder.status))}>Avançar Status</button>
                <button className="button-danger" onClick={() => setShowCancelDrawer(true)}>Cancelar Pedido</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCancelDrawer && selectedOrder && (
        <div className="drawer">
          <div className="drawer-header"><h3>Cancelar Pedido</h3><button type="button" onClick={() => setShowCancelDrawer(false)}>✕</button></div>
          <div className="drawer-body p-4">
            <textarea className="w-full border p-2 mb-4" placeholder="Motivo do cancelamento..." value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
            <button className="button-danger w-full" onClick={handleCancelOrder}>Confirmar Cancelamento</button>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
