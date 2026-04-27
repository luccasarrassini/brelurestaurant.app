import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchRestaurantBySlug, type Restaurant } from '../api/restaurants'
import { fetchCategories, fetchProducts, type Category, type Product } from '../api/catalog'
import { fetchProductImages, type ProductImage } from '../api/images'
import { createOrder, type CartItemInput, type CreateOrderResponse } from '../api/orders'
import { isValidSlug } from '../lib/validators'
import { formatCents } from '../lib/money'

type LoadState = 'loading' | 'ready' | 'not_found' | 'error'

export default function PublicMenu() {
  const { slug } = useParams()
  const [state, setState] = useState<LoadState>('loading')
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [images, setImages] = useState<ProductImage[]>([])
  const [cartItems, setCartItems] = useState<CartItemInput[]>([])
  const [orderResponse, setOrderResponse] = useState<CreateOrderResponse | null>(null)
  const [orderStatus, setOrderStatus] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadRestaurant() {
      if (!slug) {
        if (active) {
          setState('not_found')
          setMessage('Slug ausente na URL.')
        }
        return
      }

      if (!isValidSlug(slug)) {
        if (active) {
          setState('not_found')
          setMessage('Slug invalido.')
        }
        return
      }

      setState('loading')
      setMessage(null)

      const { data, error } = await fetchRestaurantBySlug(slug)

      if (!active) return

      if (error) {
        setState('error')
        setMessage(error.message)
        return
      }

      if (!data) {
        setState('not_found')
        setMessage(`Nenhum restaurante encontrado para o slug "${slug}".`)
        return
      }

      setRestaurant(data)
      setState('ready')

      setCatalogLoading(true)
      const [categoriesResult, productsResult, imagesResult] = await Promise.all([
        fetchCategories(data.id),
        fetchProducts(data.id),
        fetchProductImages(data.id),
      ])

      if (!active) return

      if (categoriesResult.error || productsResult.error || imagesResult.error) {
        setMessage('Falha ao carregar o cardapio.')
        setCatalogLoading(false)
        return
      }

      setCategories(categoriesResult.data ?? [])
      setProducts(productsResult.data ?? [])
      setImages(imagesResult.data ?? [])
      setCatalogLoading(false)
    }

    loadRestaurant()

    return () => {
      active = false
    }
  }, [slug])

  function addToCart(productId: string) {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.product_id === productId)
      if (!existing) {
        return [...prev, { product_id: productId, quantity: 1 }]
      }
      return prev.map((item) =>
        item.product_id === productId
          ? { ...item, quantity: item.quantity + 1 }
          : item,
      )
    })
  }

  function removeFromCart(productId: string) {
    setCartItems((prev) => prev.filter((item) => item.product_id !== productId))
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }
    setCartItems((prev) =>
      prev.map((item) =>
        item.product_id === productId ? { ...item, quantity } : item,
      ),
    )
  }

  async function handleCheckout() {
    if (!restaurant) return
    setOrderStatus('Enviando pedido...')
    setOrderResponse(null)

    const { data, error } = await createOrder(restaurant.id, cartItems)

    if (error) {
      setOrderStatus(
        error.message === 'User not authenticated'
          ? 'Faça login para criar o pedido.'
          : 'Falha ao criar pedido.',
      )
      return
    }

    setOrderResponse(data ?? null)
    setOrderStatus('Pedido criado com sucesso.')
    setCartItems([])
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Cardapio publico</p>
          <h1>{state === 'ready' ? restaurant?.name : 'Carregando restaurante'}</h1>
          <p className="subtle">
            {state === 'ready'
              ? `Slug: ${restaurant?.slug}`
              : 'Buscando dados no Supabase'}
          </p>
        </div>
      </header>

      {state === 'loading' && <p className="subtle">Carregando informacoes...</p>}

      {state === 'error' && (
        <div className="panel">
          <p>Erro ao carregar restaurante.</p>
          {message && <p>{message}</p>}
        </div>
      )}

      {state === 'not_found' && (
        <div className="panel">
          <p>Restaurante nao encontrado.</p>
          {message && <p>{message}</p>}
        </div>
      )}

      {state === 'ready' && restaurant && (
        <div className="stack">
          <div className="panel">
            <p className="subtle">Telefone: {restaurant.phone ?? 'Nao informado'}</p>
            <p className="subtle">
              Esta e a pagina publica com categorias, produtos e carrinho de compras.
            </p>
          </div>
          <div className="panel">
            <h2>Cardapio</h2>
            {catalogLoading && <p className="subtle">Carregando cardapio...</p>}
            {!catalogLoading && categories.length === 0 && (
              <p className="subtle">Nenhuma categoria.</p>
            )}
            {categories
              .filter((category) => category.is_active)
              .map((category) => (
                <div key={category.id} style={{ marginBottom: 20 }}>
                  <h3 style={{ marginBottom: 8 }}>{category.name}</h3>
                  {products
                    .filter(
                      (product) =>
                        product.category_id === category.id && product.is_active,
                    )
                    .map((product) => {
                      const imageUrl = images.find((img) => img.product_id === product.id)
                        ?.url
                      return (
                        <div key={product.id} className="menu-card">
                          {imageUrl && <img src={imageUrl} alt={product.name} />}
                          <strong>{product.name}</strong>
                          {product.description && <p>{product.description}</p>}
                          <p>A partir de {formatCents(product.price_cents)}</p>
                          {product.is_out_of_stock && <span className="status-pill">Esgotado</span>}
                          <button
                            type="button"
                            onClick={() => addToCart(product.id)}
                            className="button"
                            disabled={product.is_out_of_stock}
                          >
                            Adicionar
                          </button>
                        </div>
                      )
                    })}
                </div>
              ))}
          </div>
          <div className="panel">
            <h2>Carrinho</h2>
            {cartItems.length === 0 && <p className="subtle">Seu carrinho esta vazio.</p>}
            {cartItems.map((item) => {
              const product = products.find((p) => p.id === item.product_id)
              return (
                <div key={item.product_id} className="cart-row">
                  <strong>{product?.name ?? item.product_id}</strong>
                  <div className="cart-actions">
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) =>
                        updateQuantity(item.product_id, Number(event.target.value))
                      }
                      className="input"
                    />
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.product_id)}
                      className="ghost"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              )
            })}
            <button
              type="button"
              onClick={handleCheckout}
              disabled={cartItems.length === 0}
              className="button"
            >
              Fechar carrinho
            </button>
            {orderStatus && <p className="subtle">{orderStatus}</p>}
            {orderResponse && (
              <div>
                <p>Pedido: {orderResponse.order_id}</p>
                <p>Total: {formatCents(orderResponse.total_cents)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
