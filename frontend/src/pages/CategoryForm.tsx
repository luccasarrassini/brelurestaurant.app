import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { useAdmin } from '../components/AdminContext'
import { createCategory, fetchCategories } from '../api/catalog'
import { useToast } from '../components/Toast'
import {
  ArrowLeft,
  Save,
  AlertCircle,
  FolderPlus,
  Check,
} from 'lucide-react'

const MODEL_OPTIONS = [
  { value: 'itens_principais', label: 'Itens principais', desc: 'Pratos, lanches e combos' },
  { value: 'bebidas', label: 'Bebidas', desc: 'Refrigerantes, sucos e drinks' },
  { value: 'sobremesas', label: 'Sobremesas', desc: 'Doces, sorvetes e bolos' },
]

export default function CategoryForm() {
  const { selectedRestaurantId } = useAdmin()
  const { pushToast } = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [isActive, setIsActive] = useState(true)
  const [model, setModel] = useState('')
  const [isPromo, setIsPromo] = useState(false)
  const [availabilityMode, setAvailabilityMode] = useState<'always' | 'paused' | 'schedule'>('always')
  const [message, setMessage] = useState<string | null>(null)
  const [alert, setAlert] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    async function loadNextOrder() {
      if (!selectedRestaurantId) return
      const result = await fetchCategories(selectedRestaurantId)
      if (!active) return
      setSortOrder((result.data?.length ?? 0) + 1)
    }
    loadNextOrder()
    return () => { active = false }
  }, [selectedRestaurantId])

  async function handleSave(andCreateItems = false) {
    if (!model) {
      setAlert('Selecione um modelo para a categoria.')
      return
    }
    if (!name.trim()) {
      setAlert('Informe o nome da categoria.')
      return
    }
    setAlert(null)
    if (!selectedRestaurantId) {
      setMessage('Selecione um restaurante.')
      return
    }
    setSaving(true)
    const result = await createCategory({
      restaurant_id: selectedRestaurantId,
      name,
      description: description || null,
      sort_order: sortOrder,
      is_active: isActive,
      model,
      is_promo: isPromo,
      availability_mode: availabilityMode,
      availability_rules: availabilityMode === 'schedule' ? { schedule: [] } : null,
      channel_visibility: { all: true, waiter_app: true, pdv: true, digital_menu: true, qr_menu: true },
    })
    if (result.error) {
      setMessage(`Falha ao salvar: ${result.error.message}`)
      setSaving(false)
      return
    }
    pushToast('Categoria criada com sucesso!')
    setSaving(false)
    if (andCreateItems) {
      navigate(`/menu/item/new?categoryId=${result.data.id}`, { replace: true })
    } else {
      navigate('/menu', { replace: true })
    }
  }

  return (
    <AdminLayout
      title="Nova categoria"
      actions={
        <button className="button-ghost" type="button" onClick={() => navigate('/menu')}>
          <ArrowLeft size={16} />
          Voltar ao cardápio
        </button>
      }
    >
      {alert && (
        <div className="pf-alert">
          <AlertCircle size={16} />
          <span>{alert}</span>
          <button type="button" onClick={() => setAlert(null)}>×</button>
        </div>
      )}
      {message && (
        <div className="pf-alert pf-alert-error">
          <AlertCircle size={16} />
          <span>{message}</span>
        </div>
      )}

      <div className="pf-card">
        <div className="pf-step-content">
          {/* ── Modelo ── */}
          <div className="pf-section-header">
            <h3>Modelo da categoria</h3>
          </div>
          <div className="pf-availability-options" style={{ marginBottom: 28 }}>
            {MODEL_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`pf-radio-card ${model === opt.value ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="model"
                  value={opt.value}
                  checked={model === opt.value}
                  onChange={() => setModel(opt.value)}
                />
                <div>
                  <strong>{opt.label}</strong>
                  <span>{opt.desc}</span>
                </div>
                {model === opt.value && <Check size={16} className="pf-checkbox-card-check" />}
              </label>
            ))}
          </div>

          {/* ── Informações ── */}
          <div className="pf-section-header">
            <h3>Informações</h3>
          </div>
          <div className="pf-fields">
            <div className="pf-field">
              <label>Nome da categoria <span className="pf-required">*</span></label>
              <input
                className="pf-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Bebidas"
              />
            </div>
            <div className="pf-field">
              <label>Descrição</label>
              <textarea
                className="pf-input pf-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Uma breve descrição da categoria (opcional)"
              />
            </div>
            <div className="pf-field" style={{ maxWidth: 200 }}>
              <label>Posição</label>
              <input
                className="pf-input"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
          </div>

          {/* ── Configurações ── */}
          <div className="pf-section-header" style={{ marginTop: 28 }}>
            <h3>Configurações</h3>
          </div>
          <div className="pf-toggles">
            <label className="pf-toggle">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span className="pf-toggle-slider" />
              <span>Categoria ativa</span>
            </label>
            <label className="pf-toggle">
              <input type="checkbox" checked={isPromo} onChange={(e) => setIsPromo(e.target.checked)} />
              <span className="pf-toggle-slider" />
              <span>Categoria promocional</span>
            </label>
          </div>

          {/* ── Disponibilidade ── */}
          <div className="pf-section-header" style={{ marginTop: 28 }}>
            <h3>Disponibilidade</h3>
          </div>
          <div className="pf-availability-options">
            {[
              { value: 'always', label: 'Sempre disponível', desc: 'Aparecerá normalmente no cardápio' },
              { value: 'paused', label: 'Pausada', desc: 'Temporariamente indisponível' },
              { value: 'schedule', label: 'Horários específicos', desc: 'Apenas em dias e horários definidos' },
            ].map((opt) => (
              <label key={opt.value} className={`pf-radio-card ${availabilityMode === opt.value ? 'selected' : ''}`}>
                <input type="radio" name="availability" value={opt.value}
                  checked={availabilityMode === opt.value}
                  onChange={() => setAvailabilityMode(opt.value as typeof availabilityMode)}
                />
                <div><strong>{opt.label}</strong><span>{opt.desc}</span></div>
              </label>
            ))}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="pf-footer">
          <button className="button-ghost" type="button" onClick={() => navigate('/menu')}>
            Cancelar
          </button>
          <div className="pf-footer-right">
            <button className="button-secondary" type="button" onClick={() => handleSave(true)} disabled={saving}>
              <FolderPlus size={16} />
              Salvar e criar itens
            </button>
            <button className="button-primary" type="button" onClick={() => handleSave(false)} disabled={saving}>
              <Save size={16} />
              {saving ? 'Salvando...' : 'Salvar categoria'}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
