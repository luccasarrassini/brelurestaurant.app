'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { useAdmin } from '@/components/AdminContext'
import {
  deleteCategory,
  deleteProduct,
  fetchCategories,
  fetchProducts,
  updateCategory,
  updateProduct,
  type Category,
  type Product,
} from '@/api/catalog'
import { fetchProductImages, type ProductImage } from '@/api/images'
import { formatCents } from '@/lib/money'
import { useToast } from '@/components/Toast'
import {
  GripVertical, ChevronDown, ChevronRight, Plus, Pencil, Trash2,
  Pause, Play, ImageOff, Link2, PackageX, UtensilsCrossed,
} from 'lucide-react'

export default function MenuManagerPage() {
  const { selectedRestaurantId } = useAdmin()
  const router = useRouter()
  const { pushToast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [images, setImages] = useState<ProductImage[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function loadData() {
      if (!selectedRestaurantId) return
      const [categoriesResult, productsResult, imagesResult] = await Promise.all([
        fetchCategories(selectedRestaurantId),
        fetchProducts(selectedRestaurantId),
        fetchProductImages(selectedRestaurantId),
      ])
      if (!active) return
      if (categoriesResult.error || productsResult.error || imagesResult.error) {
        setMessage('Falha ao carregar cardápio.')
        return
      }
      setCategories(categoriesResult.data ?? [])
      setProducts(productsResult.data ?? [])
      setImages(imagesResult.data ?? [])
      const initialExpanded: Record<string, boolean> = {}
      ;(categoriesResult.data ?? []).forEach((category) => {
        initialExpanded[category.id] = true
      })
      setExpanded(initialExpanded)
    }
    loadData()
    return () => { active = false }
  }, [selectedRestaurantId])

  const productsByCategory = useMemo(() => {
    const map = new Map<string, Product[]>()
    products.forEach((product) => {
      const key = product.category_id ?? 'uncategorized'
      if (!map.has(key)) map.set(key, [])
      map.get(key)?.push(product)
    })
    return map
  }, [products])

  function toggleCategory(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleDeleteCategory(category: Category) {
    if (!confirm(`Excluir a categoria "${category.name}"?`)) return
    await deleteCategory(category.id)
    setCategories((prev) => prev.filter((c) => c.id !== category.id))
    pushToast('Categoria excluída')
  }

  async function handlePauseCategory(category: Category) {
    const result = await updateCategory(category.id, { is_active: !category.is_active })
    if (!result.error) {
      setCategories((prev) => prev.map((c) => (c.id === category.id ? result.data : c)))
      pushToast(result.data.is_active ? 'Categoria ativada' : 'Categoria pausada')
    }
  }

  async function handleDeleteProduct(product: Product) {
    if (!confirm(`Excluir "${product.name}"?`)) return
    await deleteProduct(product.id)
    setProducts((prev) => prev.filter((p) => p.id !== product.id))
    pushToast('Item excluído')
  }

  async function updateCategoryOrder(updated: Category[]) {
    setCategories(updated)
    await Promise.all(updated.map((category, index) => updateCategory(category.id, { sort_order: index + 1 })))
    pushToast('Ordem atualizada')
  }

  async function updateProductOrder(categoryId: string, updated: Product[]) {
    setProducts((prev) => prev.map((product) =>
      product.category_id === categoryId ? updated.find((item) => item.id === product.id) ?? product : product,
    ))
    await Promise.all(updated.map((product, index) => updateProduct(product.id, { sort_order: index + 1 })))
    pushToast('Ordem atualizada')
  }

  function handleCategoryDrag(startId: string, endId: string) {
    if (startId === endId) return
    const list = [...categories]
    const startIndex = list.findIndex((cat) => cat.id === startId)
    const endIndex = list.findIndex((cat) => cat.id === endId)
    if (startIndex === -1 || endIndex === -1) return
    const [moved] = list.splice(startIndex, 1)
    list.splice(endIndex, 0, moved)
    updateCategoryOrder(list)
  }

  function handleProductDrag(categoryId: string, startId: string, endId: string) {
    if (startId === endId) return
    const list = [...(productsByCategory.get(categoryId) ?? [])]
    const startIndex = list.findIndex((item) => item.id === startId)
    const endIndex = list.findIndex((item) => item.id === endId)
    if (startIndex === -1 || endIndex === -1) return
    const [moved] = list.splice(startIndex, 1)
    list.splice(endIndex, 0, moved)
    updateProductOrder(categoryId, list)
  }

  async function toggleOutOfStock(product: Product) {
    const result = await updateProduct(product.id, { is_out_of_stock: !product.is_out_of_stock })
    if (!result.error) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? result.data : p)))
      pushToast(result.data.is_out_of_stock ? 'Marcado como esgotado' : 'Disponível novamente')
    }
  }

  function goToNewItem(categoryId?: string) {
    if (categoryId) { router.push(`/menu/item/new?categoryId=${categoryId}`); return }
    router.push('/menu/item/new')
  }

  return (
    <AdminLayout
      title="Gestor de cardápio"
      actions={
        <button className="button-primary" type="button" onClick={() => router.push('/menu/category/new')}>
          <Plus size={18} /> Nova categoria
        </button>
      }
    >
      {message && (<div className="mm-error-banner"><PackageX size={20} /><span>{message}</span></div>)}

      {categories.length === 0 && !message && (
        <div className="mm-empty-state">
          <div className="mm-empty-icon"><UtensilsCrossed size={48} strokeWidth={1.2} /></div>
          <h3>Nenhuma categoria ainda</h3>
          <p>Comece adicionando sua primeira categoria de cardápio para organizar seus itens.</p>
          <button className="button-primary" type="button" onClick={() => router.push('/menu/category/new')}>
            <Plus size={18} /> Criar primeira categoria
          </button>
        </div>
      )}

      <div className="mm-categories-list">
        {categories.map((category, catIndex) => {
          const categoryProducts = productsByCategory.get(category.id) ?? []
          const isOpen = expanded[category.id]
          return (
            <div key={category.id} className={`mm-category-card animate-in ${dragOverId === category.id ? 'mm-drag-over' : ''}`} style={{ animationDelay: `${catIndex * 0.06}s` }}>
              <div className="mm-category-header" draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', category.id); e.dataTransfer.effectAllowed = 'move' }}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(category.id) }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => { setDragOverId(null); handleCategoryDrag(e.dataTransfer.getData('text/plain'), category.id) }}
              >
                <div className="mm-category-left">
                  <span className="mm-drag-handle" title="Arrastar para reordenar"><GripVertical size={18} /></span>
                  <div className="mm-category-info" onClick={() => toggleCategory(category.id)} style={{ cursor: 'pointer' }}>
                    <div className="mm-category-title-row">
                      <h3>{category.name}</h3>
                      {category.model && <span className="mm-model-badge">{category.model}</span>}
                      {category.is_active === false && <span className="badge badge-cancelled">Pausada</span>}
                    </div>
                    <span className="mm-category-count">{categoryProducts.length} {categoryProducts.length === 1 ? 'item' : 'itens'}</span>
                  </div>
                </div>
                <div className="mm-category-actions">
                  <button className="mm-action-btn mm-action-add" type="button" onClick={() => goToNewItem(category.id)} title="Adicionar item"><Plus size={16} /><span>Adicionar item</span></button>
                  <button className="mm-action-btn" type="button" onClick={() => router.push(`/menu/category/${category.id}/edit`)} title="Editar categoria"><Pencil size={15} /></button>
                  <button className="mm-action-btn" type="button" onClick={() => handlePauseCategory(category)} title={category.is_active === false ? 'Ativar categoria' : 'Pausar categoria'}>{category.is_active === false ? <Play size={15} /> : <Pause size={15} />}</button>
                  <button className="mm-action-btn mm-action-danger" type="button" onClick={() => handleDeleteCategory(category)} title="Excluir categoria"><Trash2 size={15} /></button>
                  <button className="mm-action-btn mm-chevron-btn" type="button" onClick={() => toggleCategory(category.id)}>{isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>
                </div>
              </div>
              {isOpen && (
                <div className="mm-category-body">
                  {categoryProducts.length === 0 ? (
                    <div className="mm-empty-category"><ImageOff size={32} strokeWidth={1.2} /><p>Nenhum item nesta categoria</p><button className="button-ghost" type="button" onClick={() => goToNewItem(category.id)}><Plus size={16} /> Adicionar primeiro item</button></div>
                  ) : (
                    <div className="mm-product-list">
                      {categoryProducts.map((product) => {
                        const image = images.find((img) => img.product_id === product.id)
                        return (
                          <div key={product.id} className={`mm-product-row ${product.is_out_of_stock ? 'mm-out-of-stock' : ''}`} draggable
                            onDragStart={(e) => { e.dataTransfer.setData('text/plain', product.id); e.dataTransfer.effectAllowed = 'move'; e.stopPropagation() }}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                            onDrop={(e) => { e.stopPropagation(); handleProductDrag(category.id, e.dataTransfer.getData('text/plain'), product.id) }}
                          >
                            <span className="mm-drag-handle" title="Arrastar para reordenar"><GripVertical size={16} /></span>
                            <div className="mm-product-thumb">{image ? <img src={image.url} alt={product.name} /> : <div className="mm-thumb-placeholder"><ImageOff size={20} strokeWidth={1.5} /></div>}{product.is_out_of_stock && <span className="mm-oos-badge">Esgotado</span>}</div>
                            <div className="mm-product-info"><strong className="mm-product-name">{product.name}</strong><span className="mm-product-price">{formatCents(product.price_cents)}</span></div>
                            <div className="mm-product-status">{product.is_active !== false && !product.is_out_of_stock && <span className="mm-status-dot mm-status-active" title="Disponível" />}{product.is_active === false && <span className="badge badge-cancelled" style={{ fontSize: 11 }}>Pausado</span>}</div>
                            <div className="mm-product-actions">
                              <button className="mm-action-btn" type="button" onClick={() => navigator.clipboard.writeText(product.id).then(() => pushToast('ID copiado'))} title="Copiar ID"><Link2 size={14} /></button>
                              <button className="mm-action-btn" type="button" onClick={() => router.push(`/menu/item/${product.id}/edit`)} title="Editar item"><Pencil size={14} /></button>
                              <button className={`mm-action-btn ${product.is_out_of_stock ? 'mm-action-active' : ''}`} type="button" onClick={() => toggleOutOfStock(product)} title={product.is_out_of_stock ? 'Marcar disponível' : 'Marcar esgotado'}><PackageX size={14} /></button>
                              <button className="mm-action-btn mm-action-danger" type="button" onClick={() => handleDeleteProduct(product)} title="Excluir item"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </AdminLayout>
  )
}
