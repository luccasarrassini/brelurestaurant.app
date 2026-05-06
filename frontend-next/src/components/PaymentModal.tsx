'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCents } from '../lib/money'

type PaymentData = {
  qr_code: string
  copy_paste: string
  expires_at: string
}

type PaymentModalProps = {
  orderId: string
  totalCents: number
  onClose: () => void
  onPaid: () => void
}

export default function PaymentModal({ orderId, totalCents, onClose, onPaid }: PaymentModalProps) {
  const [payment, setPayment] = useState<PaymentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(1800) // 30 min
  const [copied, setCopied] = useState(false)

  // Fetch payment QR code from Edge Function
  useEffect(() => {
    async function createPayment() {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('create-payment', {
          body: { order_id: orderId },
        })

        if (fnError) {
          setError('Falha ao gerar QR Code de pagamento.')
          setLoading(false)
          return
        }

        setPayment(data as PaymentData)
        setLoading(false)
      } catch {
        setError('Erro ao conectar ao servidor de pagamento.')
        setLoading(false)
      }
    }

    createPayment()
  }, [orderId])

  // Countdown timer
  useEffect(() => {
    if (!payment) return

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [payment])

  // Realtime: listen for order status change to 'paid'
  useEffect(() => {
    const channel = supabase
      .channel(`payment-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          if (payload.new.status === 'paid') {
            onPaid()
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId, onPaid])

  async function handleCopy() {
    if (!payment?.copy_paste) return
    try {
      await navigator.clipboard.writeText(payment.copy_paste)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select input
    }
  }

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="payment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="payment-modal-header">
          <h2>Pagar com Pix</h2>
          <button type="button" className="payment-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="payment-amount">{formatCents(totalCents)}</p>

        {loading && (
          <div className="payment-loading">
            <div className="tracking-spinner" />
            <p>Gerando QR Code...</p>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        {payment && (
          <>
            <div className="payment-qr">
              <img
                src={`data:image/png;base64,${payment.qr_code}`}
                alt="QR Code Pix"
                className="payment-qr-image"
              />
            </div>

            <div className="payment-copy">
              <input
                type="text"
                className="input payment-copy-input"
                value={payment.copy_paste}
                readOnly
              />
              <button type="button" className="primary-button" onClick={handleCopy}>
                {copied ? '✓ Copiado!' : 'Copiar'}
              </button>
            </div>

            <p className="payment-countdown">
              Expira em: {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </p>

            {timeLeft <= 0 && (
              <p className="error">QR Code expirado. Feche e gere novamente.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
