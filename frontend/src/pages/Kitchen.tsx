import { fetchCategories, fetchProducts, type Category, type Product } from '../api/catalog'
import {
  createOrder,
  type CartItemInput,
  type OrderPaymentInput,
  type PdvOrderInput
} from '../api/orders'
import {
  fetchCustomersByPhone,
  fetchCustomerAddresses,
  upsertCustomer,
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  type Customer,
  type CustomerAddress
} from '../api/customers'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { useAdmin } from '../components/AdminContext'
import { fetchOrdersForRestaurant, updateOrderStatus, type OrderSummary } from '../api/admin'
import { fetchProfilesByIds, type Profile } from '../api/profiles'
import { formatCents, toCents } from '../lib/money'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import { 
  Clock, 
  ChevronRight, 
  Check, 
  ChefHat, 
  Bell, 
  AlertCircle,
  Search,
  History,
  Plus,
  Truck,
  PackageOpen
} from 'lucide-react'
import { clsx } from 'clsx'

type KdsColumn = {
  key: string
  label: string
  statuses: string[]
}

const kdsColumns: KdsColumn[] = [
  { key: 'pending', label: 'Pendente', statuses: ['pending', 'created', 'paid'] },
  { key: 'preparing', label: 'Em Preparo', statuses: ['preparing'] },
  { key: 'ready', label: 'Pronto', statuses: ['ready', 'out_for_delivery'] },
]

const STUCK_THRESHOLD_MINUTES = 12
const TIMER_INTERVAL_MS = 30_000

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function formatPhone(value: string) {
  const digits = normalizePhone(value).slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`
}

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


function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    osc.frequency.value = 880
    osc.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
    setTimeout(() => ctx.close(), 500)
  } catch {
    // AudioContext not available
  }
}



function getMinutesSince(createdAt: string | null, now: number): number {
  if (!createdAt) return 0
  return Math.floor((now - new Date(createdAt).getTime()) / 60_000)
}

function formatTime(isoStr: string | null): string {
  if (!isoStr) return '--:--'
  return new Date(isoStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function nextStatus(current: string | null): string {
  if (!current || ['pending', 'created', 'paid'].includes(current)) return 'preparing'
  if (current === 'preparing') return 'ready'
  if (current === 'ready') return 'delivered'
  return current
}

function nextStatusLabel(current: string | null): string {
  if (!current || ['pending', 'created', 'paid'].includes(current)) return 'Iniciar Preparo'
  if (current === 'preparing') return 'Marcar Pronto'
  if (current === 'ready') return 'Entregue'
  return 'Avançar'
}

export default function Kitchen() {
  const { selectedRestaurantId } = useAdmin()
  const { pushToast } = useToast()
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})

  const [pdvOpen, setPdvOpen] = useState(false)
  const [pdvStep, setPdvStep] = useState<'categories' | 'items'>('categories')
  const [pdvTab, setPdvTab] = useState<'counter' | 'tables'>('counter')
  
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [categorySearch, setCategorySearch] = useState('')
  const [cartItems, setCartItems] = useState<CartItemInput[]>([])
  const [orderNotes, setOrderNotes] = useState('')

  const [customerPhone, setCustomerPhone] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([])
  const [customerAddresses, setCustomerAddresses] = useState<CustomerAddress[]>([])

  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup' | 'dine_in'>('delivery')
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [addressForm, setAddressForm] = useState({
    postal_code: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    complement: '',
  })

  const [payments, setPayments] = useState<OrderPaymentInput[]>([])
  const [showPaymentDrawer, setShowPaymentDrawer] = useState(false)
  const [nfRequested, setNfRequested] = useState(false)

  const [selectedOrder, setSelectedOrder] = useState<OrderSummary | null>(null)
  const [selectedOrderPayments, setSelectedOrderPayments] = useState<Array<{id: string; method: string; amount_cents: number; change_cents: number}>>([])
  const [showCancelDrawer, setShowCancelDrawer] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showDrafts, setShowDrafts] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const previousOrderIdsRef = useRef<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement | null>(null)

  // ── Filtros KDS ──
  const [kdsSearch, setKdsSearch] = useState('')
  const [kdsDeliveryFilter, setKdsDeliveryFilter] = useState<'all' | 'delivery' | 'pickup'>('all')

  const loadOrders = useCallback(async () => {
    if (!selectedRestaurantId) return
    setLoading(true)
    const result = await fetchOrdersForRestaurant(selectedRestaurantId)
    if (result.error) {
      setLoading(false)
      return
    }
    const loadedOrders = result.data ?? []
    setOrders(loadedOrders as unknown as OrderSummary[])

    const ids = Array.from(
      new Set(loadedOrders.map((o) => o.customer_id).filter(Boolean)),
    ) as string[]
    if (ids.length > 0) {
      const profilesResult = await fetchProfilesByIds(ids)
      if (!profilesResult.error) {
        const map = new Map(profilesResult.data?.map((p) => [p.user_id, p]))
        setProfiles(Object.fromEntries(map))
      }
    }
    setLoading(false)
  }, [selectedRestaurantId])

  useEffect(() => {
    loadOrders()
    if (!selectedRestaurantId) return

      const loadCatalog = async () => {
        setCatalogLoading(true)
        const [cats, prods] = await Promise.all([
          fetchCategories(selectedRestaurantId),
          fetchProducts(selectedRestaurantId)
        ])
        if (!cats.error) setCategories(cats.data ?? [])
        if (!prods.error) setProducts(prods.data ?? [])
        setCatalogLoading(false)
      }
      loadCatalog()


    const channel = supabase
      .channel(`orders-kitchen-${selectedRestaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${selectedRestaurantId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            beep()
          }
          loadOrders()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadOrders, selectedRestaurantId])

  useEffect(() => {
    const currentIds = new Set(orders.map((o) => o.id))
    const prevIds = previousOrderIdsRef.current

    if (prevIds.size > 0) {
      for (const id of currentIds) {
        if (!prevIds.has(id)) {
          beep()
          break
        }
      }
    }
    previousOrderIdsRef.current = currentIds
  }, [orders])

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TIMER_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, OrderSummary[]>()
    kdsColumns.forEach((col) => map.set(col.key, []))

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const searchLower = kdsSearch.toLowerCase().trim()

    orders
      .filter((o) => {
        if (!o.created_at) return false
        const created = new Date(o.created_at)
        return created >= todayStart
      })
      .filter((o) => o.status !== 'cancelled' && o.status !== 'delivered')
      .filter((o) => {
        // Filtro de tipo de entrega
        const dtype = o.deliveries?.[0]?.delivery_type
        if (kdsDeliveryFilter === 'delivery') return dtype === 'delivery'
        if (kdsDeliveryFilter === 'pickup') return dtype === 'pickup' || dtype === 'dine_in' || !dtype
        return true
      })
      .filter((o) => {
        // Filtro de busca por cliente ou número
        if (!searchLower) return true
        const orderNum = String(o.order_number ?? Number.parseInt(o.id.slice(0, 6), 16))
        const customerName = (o.customer_name ?? (o.customer_id ? profiles[o.customer_id]?.name : '') ?? '').toLowerCase()
        return orderNum.includes(searchLower) || customerName.includes(searchLower)
      })
      .forEach((order) => {
        const status = order.status ?? 'pending'
        for (const col of kdsColumns) {
          if (col.statuses.includes(status)) {
            map.get(col.key)?.push(order)
            return
          }
        }
        map.get('pending')?.push(order)
      })

    return map
  }, [orders, kdsSearch, kdsDeliveryFilter, profiles])

  function resetPdv() {
    setPdvStep('categories')
    setSelectedCategoryId(null)
    setCategorySearch('')
    setCartItems([])
    setOrderNotes('')
    setCustomerPhone('')
    setCustomerName('')
    setCustomerId(null)
    setCustomerAddresses([])
    setCustomerSuggestions([])
    setDeliveryType('delivery')
    setDeliveryFee(0)
    setSelectedAddressId(null)
    setPayments([])
    setNfRequested(false)
  }

  function clearPdvOrder() {
    resetPdv()
    pushToast('Pedido limpo')
  }

  const addPayment = useCallback((method: OrderPaymentInput['method']) => {
    setCartItems(prevItems => {
      let sub = 0
      prevItems.forEach(item => {
        const product = products.find(p => p.id === item.product_id)
        if (product) sub += product.price_cents * item.quantity
      })
      const currentTotal = sub + deliveryFee
      
      setPayments(prev => {
        const sum = prev.reduce((acc, p) => acc + (p.amount_cents || 0), 0)
        const remaining = Math.max(0, currentTotal - sum)
        const amount = remaining || currentTotal
        return [...prev, { method, amount_cents: amount, change_cents: 0 }]
      })
      return prevItems
    })
    pushToast('Pagamento adicionado!')
  }, [deliveryFee, products, pushToast])

  const handleCreateOrder = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selectedRestaurantId) return

    const errors: string[] = []
    if (cartItems.length === 0) errors.push('Adicione itens ao carrinho')
    if (payments.length === 0) errors.push('Selecione uma forma de pagamento (PIX, Cartão ou Dinheiro)')
    if (deliveryType === 'delivery' && !selectedAddressId) {
      errors.push('Para entrega, informe o endereço (rua, bairro, cidade)')
    }
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }
    setValidationErrors([])

    const pdvInput: PdvOrderInput = {
      source: 'pdv',
      customer: {
        id: customerId ?? undefined,
        name: customerName || undefined,
        phone: customerPhone || undefined,
        phone_digits: normalizePhone(customerPhone) || undefined,
      },
      delivery: { 
        type: deliveryType, 
        fee_cents: deliveryFee, 
        address_id: selectedAddressId ?? undefined 
      },
      payments,
      nf_requested: nfRequested,
      order_notes: orderNotes || undefined,
    }

    const { data, error } = await createOrder(selectedRestaurantId, cartItems, pdvInput)
    if (error) {
      // Try raw fetch to get actual error body
      try {
        const session = (await supabase.auth.getSession()).data.session
        const rawRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ restaurant_id: selectedRestaurantId, items: cartItems, ...pdvInput }),
        })
        const rawBody = await rawRes.text()
        console.error('create-order RAW status:', rawRes.status, 'body:', rawBody)
        pushToast(`Erro (${rawRes.status}): ${rawBody}`)
      } catch (fetchErr) {
        console.error('raw fetch also failed:', fetchErr)
        pushToast('Erro: ' + error.message)
      }
    } else {
      pushToast('Pedido realizado')
      setPdvOpen(false)
      resetPdv()
      loadOrders()
    }
  }, [selectedRestaurantId, cartItems, customerId, customerName, customerPhone, deliveryType, deliveryFee, selectedAddressId, payments, nfRequested, orderNotes, pushToast, loadOrders, setValidationErrors])

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

  const handleEditAddress = useCallback(async () => {
    if (!selectedAddressId) return
    const address = customerAddresses.find(i => i.id === selectedAddressId)
    if (!address) return

    const result = await updateCustomerAddress(selectedAddressId, {
      ...address,
      ...addressForm,
      complement: addressForm.complement || null,
    })

    if (!result.error) {
      setCustomerAddresses(prev => prev.map(i => i.id === selectedAddressId ? result.data : i))
      pushToast('Endereço atualizado')
    }
  }, [selectedAddressId, customerAddresses, addressForm, pushToast])

  const handleDeleteAddress = useCallback(async () => {
    if (!selectedAddressId) return
    const result = await deleteCustomerAddress(selectedAddressId)
    if (!result.error) {
      setCustomerAddresses(prev => prev.filter(i => i.id !== selectedAddressId))
      setSelectedAddressId(null)
      pushToast('Endereço excluído')
    }
  }, [selectedAddressId, pushToast])

  useEffect(() => {
    if (!pdvOpen) return

    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isInput = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

      if (event.key === 'Escape') {
        if (showDeliveryModal) setShowDeliveryModal(false)
        else if (showPaymentDrawer) setShowPaymentDrawer(false)
        else if (selectedOrder) setSelectedOrder(null)
        else setPdvOpen(false)
        return
      }

      if (isInput) {
        if (event.key.toLowerCase() !== 'enter') return
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'x') {
        event.preventDefault()
        setShowDrafts(true)
        return
      }

      switch (event.key.toLowerCase()) {
        case 'a': if (!isInput) { event.preventDefault(); setPdvStep('items') } break
        case 'v': if (!isInput) { event.preventDefault(); setPdvStep('categories') } break
        case 'p': if (!isInput) { event.preventDefault(); searchRef.current?.focus() } break
        case 'd': if (!isInput) { event.preventDefault(); setPdvTab('counter') } break
        case 'm': if (!isInput) { event.preventDefault(); setPdvTab('tables') } break
        case 'e': if (!isInput) { event.preventDefault(); setShowDeliveryModal(true) } break
        case 'x': if (!isInput) { event.preventDefault(); addPayment('pix') } break
        case 'r': if (!isInput) { event.preventDefault(); setShowPaymentDrawer(true) } break
        case 't': if (!isInput) { event.preventDefault(); setNfRequested(p => !p) } break
        case 'enter':
          if (isInput && target?.tagName === 'TEXTAREA') return
          event.preventDefault()
          handleCreateOrder()
          break
        default: break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pdvOpen, showDeliveryModal, showPaymentDrawer, selectedOrder, addPayment, handleCreateOrder])

  useEffect(() => {
    if (!pdvOpen) return
    const digits = normalizePhone(customerPhone)
    if (!digits) {
      setCustomerSuggestions([])
      return
    }
    const timeout = setTimeout(async () => {
      if (!selectedRestaurantId) return
      const result = await fetchCustomersByPhone(selectedRestaurantId, digits)
      if (!result.error) setCustomerSuggestions(result.data ?? [])
    }, 300)
    return () => clearTimeout(timeout)
  }, [customerPhone, pdvOpen, selectedRestaurantId])

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  
  const subtotal = useMemo(() => cartItems.reduce((sum, item) => {
    const product = productMap.get(item.product_id)
    return sum + (product?.price_cents ?? 0) * item.quantity
  }, 0), [cartItems, productMap])

  const totalValue = subtotal + deliveryFee



  const filteredCategories = categories.filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase()))
  const filteredProducts = products.filter(p => p.category_id === selectedCategoryId && p.is_active && p.name.toLowerCase().includes(categorySearch.toLowerCase()))

  const addToCart = (id: string) => {
    setCartItems(prev => {
      const ex = prev.find(i => i.product_id === id)
      if (ex) return prev.map(i => i.product_id === id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product_id: id, quantity: 1 }]
    })
  }

  const updateCartQuantity = (id: string, q: number) => {
    setCartItems(prev => prev.map(i => i.product_id === id ? { ...i, quantity: q } : i).filter(i => i.quantity > 0))
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

  async function handleEnsureCustomer() {
    if (!selectedRestaurantId) return null
    const digits = normalizePhone(customerPhone)
    if (!digits || !customerName) return null
    const result = await upsertCustomer({
      restaurant_id: selectedRestaurantId,
      name: customerName,
      phone: customerPhone,
      phone_digits: digits,
    })
    if (!result.error) {
      setCustomerId(result.data?.id ?? null)
      return result.data?.id ?? null
    }
    return null
  }

  async function handleOpenDeliveryModal() {
    setShowDeliveryModal(true)
    const id = customerId ?? (await handleEnsureCustomer())
    if (!id) return
    const res = await fetchCustomerAddresses(id)
    if (!res.error) setCustomerAddresses(res.data ?? [])
  }

  async function handleSaveAddress() {
    if (!selectedRestaurantId) return
    const id = customerId ?? (await handleEnsureCustomer())
    if (!id) return
    const res = await createCustomerAddress({
      restaurant_id: selectedRestaurantId,
      customer_id: id,
      ...addressForm,
      complement: addressForm.complement || null,
      is_default: false,
    })
    if (!res.error) {
      setCustomerAddresses(prev => [res.data, ...prev])
      setSelectedAddressId(res.data.id)
      pushToast('Endereço salvo')
      setAddressForm({ postal_code: '', street: '', number: '', neighborhood: '', city: '', complement: '' })
    }
  }

  async function handleAdvance(orderId: string, currentStatus: string | null) {
    const next = nextStatus(currentStatus)
    if (next === currentStatus) return
    const result = await updateOrderStatus(orderId, next)
    if (result.error) {
      pushToast('Falha ao atualizar status.')
      return
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: next } : o)),
    )
    pushToast('Status atualizado!')
  }

  return (
    <AdminLayout title="Meus Pedidos">
      {loading && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 100 }}>
          <div className="badge badge-pending">Carregando...</div>
        </div>
      )}

      <div className="kds-toolbar">
        <div className="kds-filter-buttons">
          <button
            type="button"
            className={clsx('kds-filter-btn', kdsDeliveryFilter === 'all' && 'active')}
            onClick={() => setKdsDeliveryFilter('all')}
          >
            Todos
          </button>
          <button
            type="button"
            className={clsx('kds-filter-btn', kdsDeliveryFilter === 'delivery' && 'active')}
            onClick={() => setKdsDeliveryFilter('delivery')}
          >
            <Truck size={15} /> Entrega
          </button>
          <button
            type="button"
            className={clsx('kds-filter-btn', kdsDeliveryFilter === 'pickup' && 'active')}
            onClick={() => setKdsDeliveryFilter('pickup')}
          >
            <PackageOpen size={15} /> Retirada
          </button>
        </div>

        <div className="kds-search-box">
          <Search size={16} className="kds-search-icon" />
          <input
            type="text"
            placeholder="Busque por cliente ou número do pedido"
            value={kdsSearch}
            onChange={(e) => setKdsSearch(e.target.value)}
            className="kds-search-input"
          />
        </div>

        <button className="button-primary flex-center gap-2" onClick={() => setPdvOpen(true)} style={{ whiteSpace: 'nowrap' }}>
          <Plus size={18} /> Novo Pedido
        </button>
      </div>

      <div className="kds-board">
        {kdsColumns.map((col) => {
          const colOrders = grouped.get(col.key) ?? []
          return (
              <div key={col.key} className={clsx('kds-column', `kds-${col.key}`)}>
                <div className="kds-column-header" style={{ alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <h3>
                      {col.key === 'pending' && <Bell size={18} />}
                      {col.key === 'preparing' && <ChefHat size={18} />}
                      {col.key === 'ready' && <Check size={18} />}
                      {col.label}
                    </h3>
                    <span className="kds-column-count">{colOrders.length}</span>
                  </div>
                </div>

              <div className="kds-column-list">
                {colOrders.map((order) => {
                  const minutes = getMinutesSince(order.created_at, now)
                  const isStuck = minutes > STUCK_THRESHOLD_MINUTES
                  const customerName =
                    (order.customer_id ? profiles[order.customer_id]?.name : null) ?? 'Cliente'

                  return (
                    <div key={order.id} className={clsx('kds-card', isStuck && 'stuck')}>
                      <div className="kds-card-header">
                        <span className="kds-card-title">#{String(getOrderNumber(order)).padStart(3, '0')}</span>
                        <div className="kds-card-time">
                          <Clock size={12} />
                          {formatTime(order.created_at)}
                        </div>
                      </div>

                      <div className="kds-card-customer">
                        {customerName}
                      </div>

                      <div className="kds-card-items">
                        {order.order_items?.map((item) => (
                          <div key={item.id} className="kds-item">
                            <span className="kds-item-qty">{item.quantity}x</span>
                            <span className="kds-item-name">
                              {item.name_snapshot || `Item #${item.id.slice(0, 4)}`}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="kds-card-footer">
                        <div className={clsx('kds-timer', isStuck ? 'warning' : 'safe')}>
                          {isStuck && <AlertCircle size={14} />}
                          {minutes} min
                        </div>
                        <div className="kds-total font-bold">
                          {formatCents(order.total)}
                        </div>
                      </div>

                      <button
                        type="button"
                        className={clsx(
                          'button-primary flex-center gap-2',
                          col.key === 'ready' ? 'button-green' : col.key === 'preparing' ? 'button-blue' : 'button-orange'
                        )}
                        onClick={() => handleAdvance(order.id, order.status)}
                        style={{ marginTop: '8px' }}
                      >
                        {nextStatusLabel(order.status)}
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )
                })}
                {colOrders.length === 0 && (
                  <div className="kds-empty">
                    <p className="text-gray-400 text-sm">Sem pedidos</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {pdvOpen && (
        <div className="pdv-overlay" role="dialog" aria-modal="true">
          <div className="pdv-header">
            <div>
              <h2>Pedidos balcão (PDV)</h2>
              <div className="pdv-tabs">
                <button type="button" className={`tab ${pdvTab === 'counter' ? 'active' : ''}`} onClick={() => setPdvTab('counter')}>Delivery e Balcão</button>
                <button type="button" className={`tab ${pdvTab === 'tables' ? 'active' : ''}`} onClick={() => setPdvTab('tables')}>Mesas e Comandas</button>
              </div>
            </div>
            <div className="pdv-header-actions">
              <button type="button" className="ghost flex-center gap-1" onClick={() => setShowDrafts(true)}><History size={16}/> CTRL+X Rascunhos</button>
              <button type="button" className="ghost" onClick={clearPdvOrder}>Limpar</button>
              <button type="button" className="pdv-close" onClick={() => setPdvOpen(false)}>✕</button>
            </div>
          </div>

          <form className="pdv-body" onSubmit={handleCreateOrder}>
            <div className="pdv-left">
              <div className="pdv-search">
                <Search size={18} className="text-gray-400" />
                <input ref={searchRef} type="text" placeholder="[P] Pesquisar por itens..." value={categorySearch} onChange={e => setCategorySearch(e.target.value)} />
              </div>

              {pdvStep === 'categories' ? (
                <div className="pdv-grid">
                  {catalogLoading && <p className="subtle">Carregando...</p>}
                  {filteredCategories.map(c => (
                    <button key={c.id} type="button" className="pdv-card" onClick={() => { setSelectedCategoryId(c.id); setPdvStep('items') }}>
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="pdv-items">
                  <div className="pdv-breadcrumb">
                    <button type="button" onClick={() => setPdvStep('categories')}>Categorias</button> / {categories.find(c => c.id === selectedCategoryId)?.name}
                  </div>
                  <div className="pdv-grid items">
                    {filteredProducts.map(p => (
                      <button key={p.id} type="button" className="pdv-item-card" onClick={() => addToCart(p.id)}>
                        <strong>{p.name}</strong>
                        <span>{formatCents(p.price_cents)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pdv-footer">
                <button type="button" className="ghost" onClick={() => setPdvStep('categories')}>[V] Voltar</button>
                <button type="button" className="button-primary" onClick={() => setPdvStep('items')}>[A] Próximo</button>
              </div>
            </div>

            <div className="pdv-right">
              <div className="pdv-panel main-cart">
                <h3>Carrinho</h3>
                <div className="pdv-items-list">
                  {cartItems.map(i => {
                    const p = productMap.get(i.product_id)
                    return (
                      <div key={i.product_id} className="pdv-item-row">
                        <div className="item-info">
                          <span className="qty">{i.quantity}x</span>
                          <span className="name">{p?.name}</span>
                        </div>
                        <div className="item-price">{formatCents((p?.price_cents ?? 0) * i.quantity)}</div>
                        <div className="item-actions">
                          <button type="button" onClick={() => updateCartQuantity(i.product_id, i.quantity - 1)}>-</button>
                          <button type="button" onClick={() => updateCartQuantity(i.product_id, i.quantity + 1)}>+</button>
                        </div>
                      </div>
                    )
                  })}
                  {cartItems.length === 0 && <p className="subtle">Carrinho vazio</p>}
                </div>

                <div className="pdv-notes-section">
                  <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Observações do pedido..." />
                </div>

                <div className="pdv-totals">
                  <div className="row"><span>Subtotal</span><span>{formatCents(subtotal)}</span></div>
                  <div className="row"><span>Entrega</span><span>{formatCents(deliveryFee)}</span></div>
                  <div className="row final"><span>Total</span><span>{formatCents(totalValue)}</span></div>
                </div>
              </div>

              <div className="pdv-panel customer-panel">
                <h3>Dados do Cliente</h3>
                <div className="field">
                  <label>Telefone</label>
                  <input type="text" placeholder="(00) 00000-0000" value={customerPhone} onChange={e => setCustomerPhone(formatPhone(e.target.value))} />
                  {customerSuggestions.length > 0 && (
                    <div className="pdv-suggestions">
                      {customerSuggestions.map(c => (
                        <button key={c.id} type="button" onClick={() => { setCustomerId(c.id); setCustomerName(c.name); setCustomerPhone(c.phone); setCustomerSuggestions([]) }}>
                          {c.name} • {c.phone}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="field">
                  <label>Nome</label>
                  <input type="text" placeholder="Nome do cliente" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                </div>
              </div>

              <div className="pdv-panel actions-panel">
                <div className="payment-buttons">
                  <button type="button" className="button-primary pix" onClick={() => addPayment('pix')}>PIX rápido</button>
                  <button type="button" className="button-secondary" onClick={() => setShowPaymentDrawer(true)}>Outros pagamentos</button>
                </div>
                {payments.length > 0 && (
                  <div className="pdv-payment-summary">
                    {payments.map((p, idx) => (
                      <span key={idx} className="payment-tag">{paymentMethodLabel(p.method)} {formatCents(p.amount_cents)}</span>
                    ))}
                  </div>
                )}
                <div className="secondary-buttons">
                  <button type="button" className="ghost" onClick={handleOpenDeliveryModal}>Entrega</button>
                  <button type="button" className={clsx('ghost', nfRequested && 'active')} onClick={() => setNfRequested(p => !p)}>
                    <Check size={14} style={{ opacity: nfRequested ? 1 : 0 }} /> CPF na nota
                  </button>
                </div>
                {validationErrors.length > 0 && (
                  <div className="pdv-validation-errors">
                    {validationErrors.map((err, idx) => (
                      <div key={idx} className="pdv-validation-error">⚠️ {err}</div>
                    ))}
                  </div>
                )}
                <button type="submit" className="button-success generate-btn">ENTER Gerar pedido</button>
              </div>
            </div>
          </form>

          {showDeliveryModal && (
            <div className="modal-backdrop">
              <div className="modal delivery-modal">
                <div className="modal-header">
                  <h3>Forma de Entrega</h3>
                  <button type="button" onClick={() => setShowDeliveryModal(false)}>✕</button>
                </div>
                <div className="modal-tabs">
                  <button type="button" className={clsx('tab', deliveryType === 'delivery' && 'active')} onClick={() => setDeliveryType('delivery')}>Entrega</button>
                  <button type="button" className={clsx('tab', deliveryType === 'pickup' && 'active')} onClick={() => setDeliveryType('pickup')}>Retirada</button>
                  <button type="button" className={clsx('tab', deliveryType === 'dine_in' && 'active')} onClick={() => setDeliveryType('dine_in')}>Balcão</button>
                </div>
                {deliveryType === 'delivery' && (
                  <div className="modal-body">
                    <div className="address-list grid grid-cols-1 gap-2">
                      {customerAddresses.map(a => (
                        <div key={a.id} className={clsx('address-card flex-between', selectedAddressId === a.id && 'active')} onClick={() => { setSelectedAddressId(a.id); setAddressForm({ ...a, complement: a.complement ?? '' }) }}>
                          <div className="flex-1">
                            <strong>{a.street}, {a.number}</strong>
                            <p className="text-xs text-gray-500">{a.neighborhood} - {a.city}</p>
                          </div>
                          <div className="flex gap-2">
                             <button type="button" className="p-1 hover:bg-red-50 text-red-500 rounded" onClick={(e) => { e.stopPropagation(); handleDeleteAddress() }}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="address-form mt-4">
                      <h4>Novo Endereço</h4>
                      <input type="text" placeholder="CEP" value={addressForm.postal_code} onChange={e => setAddressForm(p => ({ ...p, postal_code: e.target.value }))} />
                      <input type="text" placeholder="Rua" value={addressForm.street} onChange={e => setAddressForm(p => ({ ...p, street: e.target.value }))} />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Nº" value={addressForm.number} onChange={e => setAddressForm(p => ({ ...p, number: e.target.value }))} />
                        <input type="text" placeholder="Bairro" value={addressForm.neighborhood} onChange={e => setAddressForm(p => ({ ...p, neighborhood: e.target.value }))} />
                      </div>
                      <input type="text" placeholder="Cidade" value={addressForm.city} onChange={e => setAddressForm(p => ({ ...p, city: e.target.value }))} />
                      <div className="mt-4">
                        <label className="text-sm font-medium">Taxa de entrega</label>
                        <input type="text" placeholder="0,00" value={String(deliveryFee/100)} onChange={e => setDeliveryFee(toCents(e.target.value))} />
                      </div>
                    </div>
                  </div>
                )}
                <div className="modal-footer">
                  <button type="button" className="button-secondary" onClick={handleSaveAddress}>Salvar</button>
                  <button type="button" className="button-primary" onClick={() => setShowDeliveryModal(false)}>Concluir</button>
                </div>
              </div>
            </div>
          )}

          {showPaymentDrawer && (
            <div className="payment-drawer">
              <div className="drawer-header">
                <h3>Pagamento</h3>
                <button type="button" onClick={() => setShowPaymentDrawer(false)}>✕</button>
              </div>
              <div className="drawer-body">
                <button type="button" className="button-primary" onClick={() => { addPayment('cash'); setShowPaymentDrawer(false) }}>Dinheiro</button>
                <button type="button" className="button-primary" onClick={() => { addPayment('card'); setShowPaymentDrawer(false) }}>Cartão</button>
                <button type="button" className="button-secondary" onClick={() => { addPayment('split'); setShowPaymentDrawer(false) }}>Dividido</button>
              </div>
            </div>
          )}

          {showDrafts && (
            <div className="modal-backdrop">
              <div className="modal">
                <div className="modal-header"><h3>Rascunhos</h3><button type="button" onClick={() => setShowDrafts(false)}>✕</button></div>
                <div className="modal-body"><p className="subtle">Nenhum rascunho encontrado.</p></div>
              </div>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  )
}
