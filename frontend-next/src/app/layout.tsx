import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Brelu — Gestão de Restaurantes',
  description: 'Plataforma de gestão inteligente para restaurantes. Pedidos, cardápio, cozinha e entregas em um só lugar.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body style={{ background: '#FFFDF9' }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
