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
import { fetchDrivers, type Driver } from '../api/drivers'
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
  PackageOpen,
  Phone,
  ShoppingBag,
  Printer,
  Trash2,
  X,
  Bike
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

function formatCPF(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 11)
  let formatted = ''
  if (digits.length > 0) {
    formatted += digits.slice(0, 3)
  }
  if (digits.length > 3) {
    formatted += '.' + digits.slice(3, 6)
  }
  if (digits.length > 6) {
    formatted += '.' + digits.slice(6, 9)
  }
  if (digits.length > 9) {
    formatted += '-' + digits.slice(9, 11)
  }
  return formatted
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)

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
  const [cpf, setCpf] = useState('')
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

  const [showSplitPaymentModal, setShowSplitPaymentModal] = useState(false)
  const [splitPixStr, setSplitPixStr] = useState('')
  const [splitCashStr, setSplitCashStr] = useState('')
  const [splitCardStr, setSplitCardStr] = useState('')

  const [selectedOrder, setSelectedOrder] = useState<OrderSummary | null>(null)
  const [selectedOrderPayments, setSelectedOrderPayments] = useState<Array<{ id: string; method: string; amount_cents: number; change_cents: number }>>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
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
      const [cats, prods, drvs] = await Promise.all([
        fetchCategories(selectedRestaurantId),
        fetchProducts(selectedRestaurantId),
        fetchDrivers(selectedRestaurantId)
      ])
      if (!cats.error) setCategories(cats.data ?? [])
      if (!prods.error) setProducts(prods.data ?? [])
      if (!drvs.error) setDrivers(drvs.data as Driver[] ?? [])
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

  useEffect(() => {
    if (showSplitPaymentModal) {
      const pixVal = payments.find(p => p.method === 'pix')?.amount_cents ?? 0
      const cashVal = payments.find(p => p.method === 'cash')?.amount_cents ?? 0
      const cardVal = payments.find(p => p.method === 'card')?.amount_cents ?? 0
      setSplitPixStr(pixVal > 0 ? String(pixVal / 100) : '')
      setSplitCashStr(cashVal > 0 ? String(cashVal / 100) : '')
      setSplitCardStr(cardVal > 0 ? String(cardVal / 100) : '')
    }
  }, [showSplitPaymentModal, payments])

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
    setCpf('')
    setIsSubmitting(false)
    setSelectedProductId(null)
    setShowSplitPaymentModal(false)
    setSplitPixStr('')
    setSplitCashStr('')
    setSplitCardStr('')
  }

  function clearPdvOrder() {
    resetPdv()
    pushToast('Pedido limpo')
  }

  const addPayment = useCallback((method: OrderPaymentInput['method']) => {
    let sub = 0
    cartItems.forEach(item => {
      const product = products.find(p => p.id === item.product_id)
      if (product) sub += product.price_cents * item.quantity
    })
    const currentTotal = sub + deliveryFee

    setPayments(prev => {
      const existingIdx = prev.findIndex(p => p.method === method)
      if (existingIdx !== -1) {
        const otherPaymentsSum = prev.reduce((acc, p, idx) => {
          if (idx === existingIdx) return acc
          return acc + (p.amount_cents || 0)
        }, 0)
        const remaining = Math.max(0, currentTotal - otherPaymentsSum)
        const amount = remaining || currentTotal
        return prev.map((p, idx) => idx === existingIdx ? { ...p, amount_cents: amount } : p)
      } else {
        const sum = prev.reduce((acc, p) => acc + (p.amount_cents || 0), 0)
        const remaining = Math.max(0, currentTotal - sum)
        const amount = remaining || currentTotal
        return [...prev, { method, amount_cents: amount, change_cents: 0 }]
      }
    })
    pushToast('Pagamento adicionado!')
  }, [cartItems, deliveryFee, products, pushToast])

  const removePayment = useCallback((idxToRemove: number) => {
    setPayments(prev => prev.filter((_, idx) => idx !== idxToRemove))
    pushToast('Pagamento removido!')
  }, [pushToast])

  const handleCreateOrder = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selectedRestaurantId || isSubmitting) return

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
    setIsSubmitting(true)

    const finalNotes = [
      orderNotes?.trim(),
      nfRequested && cpf?.trim() ? `CPF NA NOTA: ${cpf.trim()}` : null
    ].filter(Boolean).join(' | ')

    const selectedAddressObj = customerAddresses.find(a => a.id === selectedAddressId)

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
        address_id: selectedAddressId ?? undefined,
        address: deliveryType === 'delivery' && selectedAddressObj ? {
          postal_code: selectedAddressObj.postal_code,
          street: selectedAddressObj.street,
          number: selectedAddressObj.number,
          neighborhood: selectedAddressObj.neighborhood,
          city: selectedAddressObj.city,
          complement: selectedAddressObj.complement || undefined
        } : undefined
      },
      payments,
      nf_requested: nfRequested,
      order_notes: finalNotes || undefined,
    }

    const { data, error } = await createOrder(selectedRestaurantId, cartItems, pdvInput)
    if (error) {
      setIsSubmitting(false)
      // Try raw fetch to get actual error body
      try {
        const session = (await supabase.auth.getSession()).data.session
        const rawRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  }, [selectedRestaurantId, cartItems, customerId, customerName, customerPhone, deliveryType, deliveryFee, selectedAddressId, payments, nfRequested, orderNotes, cpf, isSubmitting, pushToast, loadOrders, setValidationErrors, customerAddresses])

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
          if (!isSubmitting) handleCreateOrder()
          break
        default: break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pdvOpen, showDeliveryModal, showPaymentDrawer, selectedOrder, addPayment, handleCreateOrder, isSubmitting])

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
    if (!id) {
      pushToast('Erro: Nome e telefone do cliente são necessários para salvar o endereço.')
      return
    }
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
      setShowDeliveryModal(false)
    } else {
      pushToast('Erro ao salvar endereço: ' + res.error.message)
    }
  }

  async function handleConcluirDelivery() {
    if (deliveryType === 'delivery') {
      const selectedAddress = customerAddresses.find(a => a.id === selectedAddressId)
      const isExistingUnchanged = selectedAddress &&
        selectedAddress.postal_code === addressForm.postal_code &&
        selectedAddress.street === addressForm.street &&
        selectedAddress.number === addressForm.number &&
        selectedAddress.neighborhood === addressForm.neighborhood &&
        selectedAddress.city === addressForm.city &&
        (selectedAddress.complement ?? '') === (addressForm.complement ?? '')

      if (isExistingUnchanged) {
        setShowDeliveryModal(false)
      } else if (addressForm.street.trim() || addressForm.postal_code.trim()) {
        await handleSaveAddress()
      } else {
        setShowDeliveryModal(false)
      }
    } else {
      setShowDeliveryModal(false)
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

  const parsedPix = toCents(splitPixStr || '0')
  const parsedCash = toCents(splitCashStr || '0')
  const parsedCard = toCents(splitCardStr || '0')

  const totalPaid = parsedPix + parsedCash + parsedCard
  const remaining = Math.max(0, totalValue - totalPaid)

  const handleFillRemaining = (method: 'pix' | 'cash' | 'card') => {
    const currentParsed = method === 'pix' ? parsedPix : method === 'cash' ? parsedCash : parsedCard
    const newVal = (currentParsed + remaining) / 100
    if (method === 'pix') setSplitPixStr(String(newVal))
    else if (method === 'cash') setSplitCashStr(String(newVal))
    else if (method === 'card') setSplitCardStr(String(newVal))
  }

  const handleConfirmSplit = () => {
    const newPayments: OrderPaymentInput[] = []
    if (parsedPix > 0) newPayments.push({ method: 'pix', amount_cents: parsedPix, change_cents: 0 })
    if (parsedCash > 0) {
      const cashChange = Math.max(0, totalPaid - totalValue)
      newPayments.push({ method: 'cash', amount_cents: parsedCash, change_cents: cashChange })
    }
    if (parsedCard > 0) newPayments.push({ method: 'card', amount_cents: parsedCard, change_cents: 0 })
    setPayments(newPayments)
    setShowSplitPaymentModal(false)
    pushToast('Divisão de pagamentos confirmada!')
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
                    <div
                      key={order.id}
                      className={clsx('kds-card', isStuck && 'stuck')}
                      style={{ cursor: 'pointer', transition: 'transform 0.15s ease, box-shadow 0.15s ease' }}
                      onClick={() => {
                        setSelectedOrder(order)
                        if (order.payments) {
                          setSelectedOrderPayments(order.payments)
                        }
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
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
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAdvance(order.id, order.status)
                        }}
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
              <button type="button" className="ghost flex-center gap-1" onClick={() => setShowDrafts(true)}><History size={16} /> CTRL+X Rascunhos</button>
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
                      <button
                        key={p.id}
                        type="button"
                        className={clsx('pdv-item-card', selectedProductId === p.id && 'active')}
                        onClick={() => setSelectedProductId(p.id)}
                      >
                        <strong>{p.name}</strong>
                        <span>{formatCents(p.price_cents)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pdv-footer" style={{ gap: '8px', display: 'flex' }}>
                <button type="button" className="ghost" onClick={() => { setPdvStep('categories'); setSelectedProductId(null); }}>[V] Voltar</button>
                {pdvStep === 'items' && selectedProductId && (
                  <button
                    type="button"
                    className="button-success"
                    style={{ background: 'linear-gradient(135deg, var(--amber-500), var(--orange-500))', color: 'white', border: '1.5px solid var(--gray-900)' }}
                    onClick={() => {
                      addToCart(selectedProductId)
                      setSelectedProductId(null)
                    }}
                  >
                    Confirmar Item
                  </button>
                )}
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
                      <span key={idx} className="payment-tag">
                        {paymentMethodLabel(p.method)} {formatCents(p.amount_cents)}
                        <button
                          type="button"
                          className="remove-payment-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            removePayment(idx)
                          }}
                          title="Remover pagamento"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="secondary-buttons">
                  <button type="button" className="ghost" onClick={handleOpenDeliveryModal}>Entrega</button>
                  <button type="button" className={clsx('ghost', nfRequested && 'active')} onClick={() => setNfRequested(p => !p)}>
                    <Check size={14} style={{ opacity: nfRequested ? 1 : 0 }} /> CPF na nota
                  </button>
                </div>
                {nfRequested && (
                  <div className="field" style={{ gap: '4px', display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-600)' }}>CPF para a Nota</label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={e => setCpf(formatCPF(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-md)',
                        border: '1.5px solid var(--gray-200)',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={e => e.target.style.borderColor = 'var(--amber-400)'}
                      onBlur={e => e.target.style.borderColor = 'var(--gray-200)'}
                    />
                  </div>
                )}
                {validationErrors.length > 0 && (
                  <div className="pdv-validation-errors">
                    {validationErrors.map((err, idx) => (
                      <div key={idx} className="pdv-validation-error">⚠️ {err}</div>
                    ))}
                  </div>
                )}
                <button type="submit" className="button-success generate-btn" disabled={isSubmitting}>
                  {isSubmitting ? 'Gerando pedido...' : 'ENTER Gerar pedido'}
                </button>
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
                        <input type="text" placeholder="0,00" value={String(deliveryFee / 100)} onChange={e => setDeliveryFee(toCents(e.target.value))} />
                      </div>
                    </div>
                  </div>
                )}
                <div className="modal-footer">
                  {deliveryType === 'delivery' && (
                    <button type="button" className="button-secondary" onClick={handleSaveAddress}>Salvar</button>
                  )}
                  <button type="button" className="button-primary" onClick={handleConcluirDelivery}>Concluir</button>
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
                <button type="button" className="button-secondary" onClick={() => { setShowSplitPaymentModal(true); setShowPaymentDrawer(false) }}>Dividido</button>
              </div>
            </div>
          )}

          {showSplitPaymentModal && (
            <div className="modal-backdrop" style={{ zIndex: 2200 }}>
              <div className="modal split-payment-modal" style={{ width: 'min(480px, 95vw)', padding: '24px', background: '#FFFDF9', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--gray-200)', paddingBottom: '12px' }}>
                  <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Dividir Pagamento
                  </h3>
                  <button type="button" onClick={() => setShowSplitPaymentModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--gray-500)' }}>✕</button>
                </div>

                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Totais de Resumo */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '16px', background: 'var(--gray-50)', borderRadius: '12px', border: '1.5px solid var(--gray-900)' }}>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--gray-500)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Total do Pedido</span>
                      <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--gray-900)', fontFamily: 'var(--font-display)' }}>{formatCents(totalValue)}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--gray-500)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Faltando Pagar</span>
                      <span style={{ fontSize: '20px', fontWeight: 900, color: remaining > 0 ? 'var(--orange-600)' : 'var(--emerald-600)', fontFamily: 'var(--font-display)' }}>
                        {formatCents(remaining)}
                      </span>
                    </div>
                  </div>

                  {/* Inputs de Forma de Pagamento */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* PIX Row */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gray-700)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>PIX</span>
                        {parsedPix > 0 && <span style={{ color: 'var(--emerald-600)', fontSize: '12px' }}>✓ Inserido</span>}
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', fontSize: '14px', fontWeight: 600 }}>R$</span>
                          <input
                            type="text"
                            placeholder="0,00"
                            value={splitPixStr}
                            onChange={e => setSplitPixStr(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px 10px 32px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--gray-200)', fontSize: '14px', fontWeight: 600, outline: 'none' }}
                          />
                        </div>
                        <button
                          type="button"
                          className="button-ghost"
                          onClick={() => handleFillRemaining('pix')}
                          style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600, borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-300)', cursor: 'pointer', background: 'white' }}
                        >
                          Restante
                        </button>
                      </div>
                    </div>

                    {/* Dinheiro Row */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gray-700)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Dinheiro</span>
                        {parsedCash > 0 && <span style={{ color: 'var(--emerald-600)', fontSize: '12px' }}>✓ Inserido</span>}
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', fontSize: '14px', fontWeight: 600 }}>R$</span>
                          <input
                            type="text"
                            placeholder="0,00"
                            value={splitCashStr}
                            onChange={e => setSplitCashStr(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px 10px 32px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--gray-200)', fontSize: '14px', fontWeight: 600, outline: 'none' }}
                          />
                        </div>
                        <button
                          type="button"
                          className="button-ghost"
                          onClick={() => handleFillRemaining('cash')}
                          style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600, borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-300)', cursor: 'pointer', background: 'white' }}
                        >
                          Restante
                        </button>
                      </div>
                    </div>

                    {/* Cartão Row */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gray-700)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Cartão</span>
                        {parsedCard > 0 && <span style={{ color: 'var(--emerald-600)', fontSize: '12px' }}>✓ Inserido</span>}
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', fontSize: '14px', fontWeight: 600 }}>R$</span>
                          <input
                            type="text"
                            placeholder="0,00"
                            value={splitCardStr}
                            onChange={e => setSplitCardStr(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px 10px 32px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--gray-200)', fontSize: '14px', fontWeight: 600, outline: 'none' }}
                          />
                        </div>
                        <button
                          type="button"
                          className="button-ghost"
                          onClick={() => handleFillRemaining('card')}
                          style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600, borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-300)', cursor: 'pointer', background: 'white' }}
                        >
                          Restante
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer" style={{ display: 'flex', gap: '10px', marginTop: '20px', paddingTop: '12px', borderTop: '1px solid var(--gray-200)' }}>
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => { setSplitPixStr(''); setSplitCashStr(''); setSplitCardStr(''); }}
                    style={{ flex: 1, padding: '12px', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', background: 'transparent' }}
                  >
                    Limpar Tudo
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={handleConfirmSplit}
                    disabled={totalPaid < totalValue}
                    style={{ flex: 2, padding: '12px', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, cursor: 'pointer', color: 'white', background: totalPaid >= totalValue ? 'linear-gradient(135deg, var(--amber-500), var(--orange-500))' : 'var(--gray-300)', border: '1.5px solid var(--gray-900)' }}
                  >
                    Confirmar Divisão
                  </button>
                </div>
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

      {selectedOrder && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedOrder(null)}
          style={{ zIndex: 2150 }}
        >
          {/* Central Modal Card Panel */}
          <div
            className="modal animate-in"
            style={{
              width: 'min(540px, 95vw)',
              maxWidth: '540px',
              maxHeight: '85vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              padding: '28px',
              background: '#FFFDF9'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="modal-header" style={{ paddingBottom: '16px', borderBottom: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Visualização do Pedido
                </span>
                <h3 className="text-2xl font-bold flex-center gap-2" style={{ fontFamily: 'var(--font-display)', margin: 0 }}>
                  #{String(getOrderNumber(selectedOrder)).padStart(3, '0')}
                </h3>
                <span className="text-sm font-semibold text-gray-700">
                  {selectedOrder.customer_name || (selectedOrder.customer_id ? profiles[selectedOrder.customer_id]?.name : null) || 'Cliente'}
                </span>
              </div>
              <button
                type="button"
                className="button-ghost p-1 flex-center"
                style={{ borderRadius: '50%', width: '36px', height: '36px', minWidth: 'unset', border: 'none', background: 'var(--gray-100)' }}
                onClick={() => setSelectedOrder(null)}
              >
                <X size={18} />
              </button>
            </div>
            {/* 1. Canal e Tempo */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Canal de Entrega Tag */}
              {(() => {
                const dtype = selectedOrder.deliveries?.[0]?.delivery_type || selectedOrder.delivery_type || 'dine_in'
                if (dtype === 'delivery') {
                  return (
                    <span className="badge badge-preparing" style={{ padding: '6px 12px', fontSize: '13px', background: '#F0F9FF', color: '#0EA5E9' }}>
                      <Truck size={14} style={{ marginRight: '4px' }} /> Delivery
                    </span>
                  )
                }
                if (dtype === 'pickup') {
                  return (
                    <span className="badge badge-pending" style={{ padding: '6px 12px', fontSize: '13px', background: '#FEF3C7', color: '#D97706' }}>
                      <PackageOpen size={14} style={{ marginRight: '4px' }} /> Retirada
                    </span>
                  )
                }
                return (
                  <span className="badge badge-ready" style={{ padding: '6px 12px', fontSize: '13px', background: '#ECFDF5', color: '#10B981' }}>
                    <ShoppingBag size={14} style={{ marginRight: '4px' }} /> Consumo Local
                  </span>
                )
              })()}

              {/* Cronometro decorrido */}
              <span className="badge" style={{ padding: '6px 12px', fontSize: '13px', background: 'var(--gray-100)', color: 'var(--gray-600)' }}>
                <Clock size={14} style={{ marginRight: '4px' }} />
                Entrou há {getMinutesSince(selectedOrder.created_at, now)} min
              </span>

              {/* Status atual */}
              <span className={`badge badge-${selectedOrder.status}`} style={{ padding: '6px 12px', fontSize: '13px' }}>
                Status: {selectedOrder.status === 'preparing' ? 'Em Preparo' : selectedOrder.status === 'ready' ? 'Pronto' : 'Pendente'}
              </span>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--gray-200)', margin: 0 }} />

            {/* 2. Observações Gerais do Pedido (Crítico) */}
            {selectedOrder.order_notes && (
              <div style={{
                padding: '16px',
                background: '#FEF2F2',
                border: '1.5px solid #EF4444',
                borderRadius: '12px',
                color: '#B91C1C',
                fontSize: '14px',
                fontWeight: 700,
                boxShadow: 'var(--shadow-xs)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <AlertCircle size={18} />
                  <span>OBSERVAÇÃO DO CLIENTE:</span>
                </div>
                <p style={{ margin: 0, textTransform: 'uppercase' }}>"{selectedOrder.order_notes}"</p>
              </div>
            )}

            {/* 3. Lista de Itens */}
            <div>
              <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--gray-500)', letterSpacing: '0.05em', marginBottom: '12px' }}>
                Itens do Pedido ({selectedOrder.order_items?.length || 0})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedOrder.order_items?.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '14px 16px',
                      background: '#FFFFFF',
                      borderRadius: '12px',
                      border: '1px solid var(--gray-200)',
                      boxShadow: 'var(--shadow-xs)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <span style={{ fontWeight: 800, color: 'var(--amber-600)', fontSize: '15px', fontFamily: 'var(--font-display)' }}>
                          {item.quantity}x
                        </span>
                        <span style={{ fontWeight: 600, color: 'var(--gray-900)', fontSize: '15px' }}>
                          {item.name_snapshot}
                        </span>
                      </div>
                      <span style={{ fontWeight: 700, color: 'var(--gray-900)', fontSize: '15px', fontFamily: 'var(--font-display)' }}>
                        {formatCents((item.price_cents_snapshot || 0) * item.quantity)}
                      </span>
                    </div>

                    {/* Observações / Adicionais do Item com Destaque Crítico */}
                    {item.notes && (
                      <div style={{
                        marginTop: '10px',
                        padding: '8px 12px',
                        background: '#FFFBEB',
                        borderLeft: '4px solid #F59E0B',
                        borderRadius: '4px',
                        color: '#B45309',
                        fontSize: '13px',
                        fontWeight: 600,
                        lineHeight: '1.4'
                      }}>
                        💡 Opcionais: <span style={{ textTransform: 'uppercase' }}>{item.notes}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--gray-200)', margin: 0 }} />

            {/* 4. Logística de Entrega (se Delivery) */}
            {(() => {
              const delivery = selectedOrder.deliveries?.[0]
              const dtype = delivery?.delivery_type || selectedOrder.delivery_type || 'dine_in'
              const isDelivery = dtype === 'delivery'
              const phone = selectedOrder.customer_phone || (selectedOrder.customer_id ? profiles[selectedOrder.customer_id]?.phone : null)
              const assignedDriver = delivery?.driver_id ? drivers.find(d => d.id === delivery.driver_id) : null

              return (
                <div>
                  <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--gray-500)', letterSpacing: '0.05em', marginBottom: '12px' }}>
                    Logística & Entrega
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Telefone */}
                    {phone && (
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '14px', color: 'var(--gray-700)' }}>
                        <Phone size={16} style={{ color: 'var(--amber-600)' }} />
                        <strong>Telefone:</strong>
                        <span>{formatPhone(phone)}</span>
                      </div>
                    )}

                    {/* Endereço */}
                    {isDelivery && delivery ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '14px', color: 'var(--gray-700)' }}>
                          <Truck size={16} style={{ color: 'var(--amber-600)', flexShrink: 0, marginTop: '2px' }} />
                          <div>
                            <strong>Endereço de Entrega:</strong>
                            <p style={{ margin: '2px 0 0 0', lineHeight: '1.4' }}>
                              {delivery.street}, {delivery.number}
                              {delivery.complement && ` (${delivery.complement})`}
                              <br />
                              {delivery.neighborhood} — {delivery.city}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '14px', color: 'var(--gray-500)', fontStyle: 'italic' }}>
                        <PackageOpen size={16} />
                        <span>Pedido para {dtype === 'pickup' ? 'Retirada no Balcão' : 'Consumo Local'}</span>
                      </div>
                    )}

                    {/* Entregador */}
                    {isDelivery && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '14px',
                        padding: '10px 14px',
                        background: assignedDriver ? 'var(--emerald-50)' : 'var(--amber-50)',
                        border: assignedDriver ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(245,158,11,0.2)',
                        borderRadius: '8px',
                        color: assignedDriver ? 'var(--emerald-700)' : 'var(--amber-700)'
                      }}>
                        <Bike size={16} />
                        <strong>Entregador:</strong>
                        {assignedDriver ? (
                          <span style={{ fontWeight: 600 }}>{assignedDriver.name} ({assignedDriver.vehicle_type || 'Moto'})</span>
                        ) : (
                          <span style={{ fontWeight: 600 }}>⚠️ Aguardando vínculo na frota</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            <hr style={{ border: 'none', borderTop: '1px solid var(--gray-200)', margin: 0 }} />

            {/* 5. Resumo Financeiro */}
            <div>
              <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--gray-500)', letterSpacing: '0.05em', marginBottom: '12px' }}>
                Resumo Financeiro
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: 'var(--surface-100)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--gray-600)' }}>
                  <span>Subtotal dos itens</span>
                  <span>{formatCents(selectedOrder.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--gray-600)' }}>
                  <span>Taxa de entrega</span>
                  <span>{formatCents(selectedOrder.delivery_fee)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', fontWeight: 900, color: 'var(--gray-900)', fontFamily: 'var(--font-display)', paddingTop: '10px', borderTop: '2px dashed var(--gray-200)', marginTop: '4px' }}>
                  <span>Total</span>
                  <span>{formatCents(selectedOrder.total)}</span>
                </div>

                {/* Forma de Pagamento */}
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--gray-200)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-500)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Pagamento:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedOrderPayments.length > 0 ? (
                      selectedOrderPayments.map((p, idx) => (
                        <span key={idx} className="payment-tag">
                          {paymentMethodLabel(p.method)}: {formatCents(p.amount_cents)}
                        </span>
                      ))
                    ) : (
                      <span className="payment-tag" style={{ background: 'var(--rose-50)', color: 'var(--rose-600)', borderColor: 'rgba(244,63,94,0.2)' }}>
                        {paymentMethodLabel(selectedOrder.payment_method || 'Outro')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Ações */}
            <div
              style={{
                paddingTop: '20px',
                borderTop: '1px solid var(--gray-200)',
                background: '#FFFFFF',
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                marginTop: '8px'
              }}
            >
              {/* Imprimir Cupom */}
              <button
                type="button"
                className="button-primary flex-center gap-2"
                onClick={() => handlePrint(selectedOrder)}
                style={{ flex: 1, padding: '12px 16px', justifyContent: 'center' }}
              >
                <Printer size={16} /> Imprimir (80mm)
              </button>

              {/* Cancelar Pedido */}
              <button
                type="button"
                className="button-danger flex-center gap-2"
                onClick={() => setShowCancelDrawer(true)}
                style={{ padding: '12px 16px', justifyContent: 'center' }}
              >
                <Trash2 size={16} /> Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelDrawer && selectedOrder && (
        <div className="modal-backdrop" style={{ zIndex: 2200 }} onClick={() => setShowCancelDrawer(false)}>
          <div className="modal" style={{ width: 'min(400px, 95vw)', gap: '16px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cancelar Pedido</h3>
              <button type="button" onClick={() => setShowCancelDrawer(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--gray-600)', lineHeight: '1.5' }}>
                Tem certeza de que deseja cancelar o pedido <strong>#{getOrderNumber(selectedOrder)}</strong>? Esta ação é permanente e atualizará o status no painel e relatórios.
              </p>
              <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)' }}>Motivo do Cancelamento</label>
                <textarea
                  placeholder="Descreva o motivo do cancelamento..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--gray-200)',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                className="button-ghost"
                style={{ flex: 1, padding: '12px', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', background: 'transparent' }}
                onClick={() => setShowCancelDrawer(false)}
              >
                Voltar
              </button>
              <button
                type="button"
                className="button-danger"
                style={{ flex: 1, padding: '12px', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, cursor: 'pointer', color: 'white' }}
                onClick={handleCancelOrder}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}