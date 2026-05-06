/**
 * WhatsApp service with automatic mock in dev/staging.
 * In production with Evolution API configured: sends real messages.
 * Security: never logs full phone numbers, only last 4 digits.
 */

interface SendMessageResult {
  success: boolean
  mock?: boolean
  error?: string
}

/**
 * Send a WhatsApp message. Automatically mocks in dev or when
 * NEXT_PUBLIC_EVOLUTION_API_URL is not configured.
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string,
): Promise<SendMessageResult> {
  const isDev = process.env.NODE_ENV === 'development'
  const evolutionUrl = process.env.NEXT_PUBLIC_EVOLUTION_API_URL
  const evolutionKey = process.env.NEXT_PUBLIC_EVOLUTION_API_KEY

  if (isDev || !evolutionUrl) {
    // Mock: log safely (only last 4 digits of phone)
    const safePhone = phone.length > 4 ? `***${phone.slice(-4)}` : '****'
    console.log(
      `[WhatsApp MOCK] Para: ${safePhone}\n` +
        `Mensagem: ${message.slice(0, 100)}${message.length > 100 ? '...' : ''}`,
    )
    return { success: true, mock: true }
  }

  try {
    const response = await fetch(`${evolutionUrl}/message/sendText`, {
      method: 'POST',
      headers: {
        apikey: evolutionKey || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: formatPhoneForWhatsApp(phone),
        text: message,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[WhatsApp] Send failed:', response.status)
      return { success: false, error: errorText }
    }

    return { success: true }
  } catch (error) {
    console.error('[WhatsApp] Exception:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Format a Brazilian phone number for WhatsApp API.
 * Ensures the 55 country code prefix and removes non-digits.
 */
export function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '')

  // Already has country code
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits
  }

  // 11 digits = DDD + 9-digit mobile
  if (digits.length === 11) {
    return `55${digits}`
  }

  // 10 digits = DDD + 8-digit landline
  if (digits.length === 10) {
    return `55${digits}`
  }

  return `55${digits}`
}
