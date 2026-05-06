import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { useAdmin } from '../components/AdminContext'
import { fetchProducts, updateProductsBulk, type Product } from '../api/catalog'
import { formatCents, toCents } from '../lib/money'

export default function MenuBulkEdit() {
  const { selectedRestaurantId } = useAdmin()
  const [products, setProducts] = useState<Product[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkActive, setBulkActive] = useState<'keep' | 'active' | 'inactive'>('keep')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function loadProducts() {
      if (!selectedRestaurantId) return
      setLoading(true)
      const result = await fetchProducts(selectedRestaurantId)
      if (!active) return
      if (result.error) {
        setMessage('Falha ao carregar itens.')
        setLoading(false)
        return
      }
      setProducts(result.data ?? [])
      setLoading(false)
    }
    loadProducts()
    return () => {
      active = false
    }
  }, [selectedRestaurantId])

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  async function handleApply() {
    if (selected.length === 0) return
    const payload: Partial<Product> = {}
    if (bulkPrice) {
      payload.price_cents = toCents(bulkPrice)
    }
    if (bulkActive !== 'keep') {
      payload.is_active = bulkActive === 'active'
    }
    const result = await updateProductsBulk(selected, payload)
    if (result.error) {
      setMessage('Falha ao aplicar edição em massa.')
      return
    }
    const updated = result.data ?? []
    setProducts((prev) =>
      prev.map((product) => updated.find((item) => item.id === product.id) ?? product),
    )
    setSelected([])
    setBulkPrice('')
    setBulkActive('keep')
  }

  return (
    <AdminLayout
      title="Edição em massa"
    >
      {loading && <p className="subtle">Carregando itens...</p>}
      {message && <p className="error">{message}</p>}
      <section className="panel">
        <div className="panel-header">
          <strong>Aplicar em selecionados</strong>
          <div className="table-toolbar">
            <input
              className="input"
              placeholder="Novo preço (ex: 12.50)"
              value={bulkPrice}
              onChange={(event) => setBulkPrice(event.target.value)}
            />
            <select
              className="input"
              value={bulkActive}
              onChange={(event) => setBulkActive(event.target.value as 'keep' | 'active' | 'inactive')}
            >
              <option value="keep">Manter status</option>
              <option value="active">Ativar</option>
              <option value="inactive">Inativar</option>
            </select>
            <button className="primary-button" type="button" onClick={handleApply}>
              Aplicar
            </button>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>Item</th>
              <th>Preço</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(product.id)}
                    onChange={() => toggleSelect(product.id)}
                  />
                </td>
                <td>{product.name}</td>
                <td>{formatCents(product.price_cents)}</td>
                <td>
                  <span className="status-pill">
                    {product.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={4}>Nenhum item cadastrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </AdminLayout>
  )
}
