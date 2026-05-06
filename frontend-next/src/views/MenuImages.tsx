import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { useAdmin } from '../components/AdminContext'
import { fetchProducts, type Product } from '../api/catalog'
import {
  createProductImage,
  deleteProductImage,
  fetchProductImages,
  type ProductImage,
} from '../api/images'
import { supabase } from '../lib/supabase'

export default function MenuImages() {
  const { selectedRestaurantId } = useAdmin()
  const [products, setProducts] = useState<Product[]>([])
  const [images, setImages] = useState<ProductImage[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [uploads, setUploads] = useState<Record<string, File | null>>({})

  useEffect(() => {
    let active = true

    async function loadData() {
      if (!selectedRestaurantId) return
      setLoading(true)
      const [productsResult, imagesResult] = await Promise.all([
        fetchProducts(selectedRestaurantId),
        fetchProductImages(selectedRestaurantId),
      ])
      if (!active) return
      if (productsResult.error || imagesResult.error) {
        setMessage('Falha ao carregar imagens.')
        setLoading(false)
        return
      }
      setProducts(productsResult.data ?? [])
      setImages(imagesResult.data ?? [])
      setLoading(false)
    }

    loadData()
    return () => {
      active = false
    }
  }, [selectedRestaurantId])

  async function handleAddImage(productId: string) {
    const file = uploads[productId]
    if (!file || !selectedRestaurantId) return
    const path = `${selectedRestaurantId}/${productId}/${Date.now()}-${file.name}`
    const uploadResult = await supabase.storage.from('product-images').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })
    if (uploadResult.error) {
      setMessage('Falha ao enviar imagem.')
      return
    }
    const publicUrlResult = supabase.storage.from('product-images').getPublicUrl(path)
    const url = publicUrlResult.data.publicUrl
    const result = await createProductImage({
      restaurant_id: selectedRestaurantId,
      product_id: productId,
      url,
      sort_order: 0,
    })
    if (result.error) {
      setMessage('Falha ao adicionar imagem.')
      return
    }
    setImages((prev) => [...prev, result.data])
    setUploads((prev) => ({ ...prev, [productId]: null }))
  }

  async function handleDeleteImage(id: string) {
    const image = images.find((item) => item.id === id)
    if (image?.url) {
      const marker = '/product-images/'
      const index = image.url.indexOf(marker)
      if (index >= 0) {
        const path = decodeURIComponent(image.url.slice(index + marker.length))
        await supabase.storage.from('product-images').remove([path])
      }
    }

    const result = await deleteProductImage(id)
    if (result.error) {
      setMessage('Falha ao remover imagem.')
      return
    }
    setImages((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <AdminLayout
      title="Imagens do cardápio"
    >
      {loading && <p className="subtle">Carregando imagens...</p>}
      {message && <p className="error">{message}</p>}
      <section className="image-grid">
        {products.map((product) => {
          const productImages = images.filter((img) => img.product_id === product.id)
          return (
            <div key={product.id} className="image-card">
              <strong>{product.name}</strong>
              <div className="image-preview">
                {productImages.length === 0 && <span>Sem imagem</span>}
                {productImages.map((img) => (
                  <div key={img.id} className="image-thumb">
                    <img src={img.url} alt={product.name} />
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => handleDeleteImage(img.id)}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
              <div className="table-toolbar">
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setUploads((prev) => ({
                      ...prev,
                      [product.id]: event.target.files?.[0] ?? null,
                    }))
                  }
                />
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => handleAddImage(product.id)}
                >
                  Adicionar
                </button>
              </div>
            </div>
          )
        })}
        {products.length === 0 && <p className="subtle">Nenhum item cadastrado.</p>}
      </section>
    </AdminLayout>
  )
}
