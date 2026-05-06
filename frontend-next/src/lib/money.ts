export function formatCents(value: number | null | undefined) {
  const cents = Number(value ?? 0)
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function toCents(value: string | number) {
  const normalized = typeof value === 'number' ? value : Number(value.replace(',', '.'))
  return Math.round(normalized * 100)
}
