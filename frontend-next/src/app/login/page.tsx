'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Flame } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setMessage('Falha no login. Verifique suas credenciais.')
      setLoading(false)
      return
    }

    router.replace('/dashboard')
  }

  return (
    <div className="page">
      <section className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, #F59E0B, #EA580C)',
            display: 'grid', placeItems: 'center', color: '#fff',
            boxShadow: '0 4px 20px rgba(245,158,11,0.3)',
          }}>
            <Flame size={26} />
          </div>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900,
            letterSpacing: '-0.03em', color: 'var(--gray-900)',
          }}>Brelu</span>
        </div>
        <h1>Bem-vindo de volta</h1>
        <p className="subtle" style={{ marginBottom: 8 }}>Acesse sua conta para gerenciar seus restaurantes.</p>
        <form onSubmit={handleSubmit} className="stack">
          <label className="label">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="input"
              placeholder="seu@email.com"
            />
          </label>
          <label className="label">
            Senha
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="input"
              placeholder="••••••••"
            />
          </label>
          <button type="submit" disabled={loading} className="button">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          {message && <p className="error">{message}</p>}
        </form>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--gray-400)' }}>
          Powered by <strong style={{ color: 'var(--amber-600)' }}>Brelu</strong>
        </p>
      </section>
    </div>
  )
}
