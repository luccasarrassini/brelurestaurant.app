import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCents } from '../lib/money'

type PrintOrder = {
  id: string
  order_number: number | null
  status: string | null
  subtotal: number | null
  delivery_fee: number | null
  total: number | null
  created_at: string | null
  customer_id: string | null
  order_notes: string | null
  nf_requested: boolean | null
  delivery_type: string | null
  customer_name: string | null
  customer_phone: string | null
  order_items: Array<{
    id: string
    quantity: number
    price_cents_snapshot: number
    name_snapshot: string
    notes: string | null
  }> | null
  deliveries: Array<{
    delivery_type: 'delivery' | 'pickup' | 'dine_in'
    fee_cents: number
    street: string | null
    number: string | null
    neighborhood: string | null
    city: string | null
    complement: string | null
  }> | null
  payments: Array<{
    id: string
    method: string
    amount_cents: number
    change_cents: number
  }> | null
  restaurant: {
    name: string
    phone: string | null
    address: string | null
  } | null
}

function paymentLabel(method: string) {
  const labels: Record<string, string> = {
    pix: 'PIX',
    card: 'Cartão',
    cash: 'Dinheiro',
    split: 'Dividido',
    other: 'Outro',
  }
  return labels[method] ?? method
}

export default function OrderPrint() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<PrintOrder | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    async function load() {
      const { data } = await supabase
        .from('orders')
        .select(`
          id, order_number, status, subtotal, delivery_fee, total,
          created_at, customer_name, customer_phone, order_notes, nf_requested, delivery_type,
          order_items(id, quantity, price_cents_snapshot, name_snapshot, notes),
          deliveries(delivery_type, fee_cents, street, number, neighborhood, city, complement),
          payments:order_payments(id, method, amount_cents, change_cents),
          restaurant:restaurants(name, phone, address)
        `)
        .eq('id', id!)
        .single()

      if (data) setOrder(data as unknown as PrintOrder)
      setLoading(false)
    }
    load()
  }, [id])

  useEffect(() => {
    if (order && !loading) {
      setTimeout(() => window.print(), 400)
    }
  }, [order, loading])

  if (loading) return <div className="print-page"><p>Carregando...</p></div>
  if (!order) return <div className="print-page"><p>Pedido não encontrado.</p></div>

  const delivery = order.deliveries?.[0]
  const isDelivery = delivery?.delivery_type === 'delivery'
  const orderNum = order.order_number ?? Number.parseInt(order.id.slice(0, 6), 16)
  const date = order.created_at ? new Date(order.created_at) : new Date()

  return (
    <div className="print-page">
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .print-page { width: 80mm; padding: 4mm; font-size: 12px; }
        }
        .print-page {
          font-family: 'Courier New', monospace;
          max-width: 350px;
          margin: 0 auto;
          padding: 16px;
          color: #000;
          background: #fff;
          font-size: 13px;
          line-height: 1.5;
        }
        .print-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
        .print-header h1 { font-size: 16px; margin: 0; }
        .print-header p { margin: 2px 0; font-size: 11px; }
        .print-section { border-bottom: 1px dashed #000; padding: 6px 0; }
        .print-section:last-child { border-bottom: none; }
        .print-section h3 { font-size: 12px; margin: 0 0 4px; text-transform: uppercase; }
        .print-item { display: flex; justify-content: space-between; }
        .print-item-notes { font-size: 10px; color: #555; padding-left: 8px; }
        .print-totals .row { display: flex; justify-content: space-between; }
        .print-totals .row.final { font-weight: bold; font-size: 15px; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; }
        .print-address p, .print-payment p { margin: 1px 0; }
        .print-footer { text-align: center; margin-top: 8px; font-size: 10px; }
      `}</style>

      <div className="print-header">
        <h1>{order.restaurant?.name ?? 'Restaurante'}</h1>
        {order.restaurant?.phone && <p>Tel: {order.restaurant.phone}</p>}
        {order.restaurant?.address && <p>{order.restaurant.address}</p>}
        <p style={{ marginTop: 6 }}>
          Pedido #{orderNum} — {date.toLocaleDateString('pt-BR')} {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {order.customer_id && (
        <div className="print-section">
          <p><strong>Cliente:</strong> {order.customer_id}</p>
        </div>
      )}

      <div className="print-section">
        <h3>Itens</h3>
        {order.order_items?.map(item => (
          <div key={item.id}>
            <div className="print-item">
              <span>{item.quantity}x {item.name_snapshot}</span>
              <span>{formatCents(item.price_cents_snapshot * item.quantity)}</span>
            </div>
            {item.notes && <div className="print-item-notes">↳ {item.notes}</div>}      {order.order_notes && (
        <div className="print-section">
          <h3>Observações</h3>
          <p>{order.order_notes}</p>
        </div>
      )}          </div>
        ))}
      </div>



      <div className="print-section print-totals">
        <div className="row"><span>Subtotal</span><span>{formatCents(order.subtotal)}</span></div>
        <div className="row"><span>Entrega</span><span>{formatCents(order.delivery_fee)}</span></div>
        <div className="row final"><span>Total</span><span>{formatCents(order.total)}</span></div>
      </div>

      {isDelivery && delivery && (
        <div className="print-section print-address">
          <h3>Endereço de Entrega</h3>
          <p>{delivery.street}{delivery.number ? `, ${delivery.number}` : ''}</p>
          {delivery.neighborhood && <p>Bairro: {delivery.neighborhood}</p>}
          {delivery.city && <p>Cidade: {delivery.city}</p>}
          {delivery.complement && <p>Compl: {delivery.complement}</p>}
          <p><strong>Taxa:</strong> {formatCents(delivery.fee_cents)}</p>
        </div>
      )}

      {!isDelivery && (
        <div className="print-section print-address">
          <h3>{delivery?.delivery_type === 'pickup' ? 'Retirada no Balcão' : 'Consumo Local'}</h3>
        </div>
      )}

      <div className="print-section print-payment">
        <h3>Pagamento</h3>
        {order.payments && order.payments.length > 0 ? (
          order.payments.map(p => (
            <p key={p.id}>{paymentLabel(p.method)}: {formatCents(p.amount_cents)}</p>
          ))
        ) : (
          <p>⚠️ Nenhum pagamento registrado</p>
        )}
      </div>      {order.nf_requested && (
        <div className="print-section">
          <p><strong>✓ CPF na nota solicitado</strong></p>
        </div>
      )}


      <div className="print-footer">
        <p>Obrigado pela preferência!</p>
        <p>Powered by Brelu</p>
      </div>
    </div>
  )
}
