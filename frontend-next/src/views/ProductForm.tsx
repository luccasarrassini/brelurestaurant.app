import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '../components/AdminLayout'
import { useAdmin } from '../components/AdminContext'
import { createProduct, fetchCategories, type Category } from '../api/catalog'
import { createProductImage } from '../api/images'
import { fetchTags, createTag, addTagToProduct, type ProductTag } from '../api/tags'
import {
  fetchAdditionalGroups,
  addGroupToProduct,
  type AdditionalGroup,
} from '../api/additionals'
import { supabase } from '../lib/supabase'
import { toCents } from '../lib/money'
import { useToast } from '../components/Toast'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  ImagePlus,
  Tag,
  Layers,
  Clock,
  Save,
  Plus,
  X,
  AlertCircle,
  ShoppingBag,
} from 'lucide-react'

type ScheduleRule = { day: string; open: string; close: string }

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Segunda' },
  { key: 'tuesday', label: 'Terça' },
  { key: 'wednesday', label: 'Quarta' },
  { key: 'thursday', label: 'Quinta' },
  { key: 'friday', label: 'Sexta' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
]

const STEPS = [
  { num: 1, label: 'Informações', icon: ShoppingBag },
  { num: 2, label: 'Adicionais', icon: Layers },
  { num: 3, label: 'Tags', icon: Tag },
  { num: 4, label: 'Disponibilidade', icon: Clock },
]

export default function ProductForm() {
  const { selectedRestaurantId } = useAdmin()
  const { pushToast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<ProductTag[]>([])
  const [groups, setGroups] = useState<AdditionalGroup[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [alert, setAlert] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [tagInput, setTagInput] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [useAdditionals, setUseAdditionals] = useState(false)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [availabilityMode, setAvailabilityMode] = useState<'always' | 'paused' | 'schedule'>(
    'always',
  )
  const [scheduleRules, setScheduleRules] = useState<ScheduleRule[]>([])
  const [isSoldByWeight, setIsSoldByWeight] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    async function loadCategories() {
      if (!selectedRestaurantId) return
      const [categoriesResult, tagsResult, groupsResult] = await Promise.all([
        fetchCategories(selectedRestaurantId),
        fetchTags(selectedRestaurantId),
        fetchAdditionalGroups(selectedRestaurantId),
      ])
      if (!active) return
      if (categoriesResult.error || tagsResult.error || groupsResult.error) {
        setMessage('Falha ao carregar dados.')
        return
      }
      setCategories(categoriesResult.data ?? [])
      setTags(tagsResult.data ?? [])
      setGroups(groupsResult.data ?? [])
      const preselect = searchParams?.get('categoryId')
      if (preselect) setCategoryId(preselect)
    }
    loadCategories()
    return () => { active = false }
  }, [selectedRestaurantId])

  function handleImageChange(file: File | null) {
    setImageFile(file)
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => setImagePreview(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setImagePreview(null)
    }
  }

  async function handleSave() {
    if (!name.trim() || !price.trim()) {
      setAlert('Preencha o nome e o preço do item.')
      setStep(1)
      return
    }
    setAlert(null)
    if (!selectedRestaurantId) {
      setMessage('Selecione um restaurante.')
      return
    }
    setSaving(true)
    const result = await createProduct({
      restaurant_id: selectedRestaurantId,
      category_id: categoryId || null,
      name,
      description: description || null,
      price_cents: toCents(price),
      stock_qty: null,
      is_active: isActive,
      sort_order: 0,
      is_out_of_stock: availabilityMode === 'paused',
      is_sold_by_weight: isSoldByWeight,
      availability_mode: availabilityMode,
      availability_rules: availabilityMode === 'schedule' ? { schedule: scheduleRules } : null,
    })
    if (result.error) {
      setMessage(`Falha ao salvar item: ${result.error.message}`)
      setSaving(false)
      return
    }

    const productId = result.data.id
    for (const tagId of selectedTagIds) await addTagToProduct(productId, tagId)
    if (useAdditionals) {
      for (const groupId of selectedGroupIds) await addGroupToProduct(productId, groupId)
    }

    if (imageFile) {
      const path = `${selectedRestaurantId}/${productId}/${Date.now()}-${imageFile.name}`
      const upload = await supabase.storage
        .from('product-images')
        .upload(path, imageFile, { cacheControl: '3600', upsert: false })
      if (upload.error) {
        pushToast('Item criado, mas falha ao enviar imagem.')
        router.replace('/menu')
        return
      }
      const publicUrl = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
      await createProductImage({
        restaurant_id: selectedRestaurantId,
        product_id: productId,
        url: publicUrl,
        sort_order: 0,
      })
    }

    pushToast('Item criado com sucesso!')
    setSaving(false)
    router.replace('/menu')
  }

  return (
    <AdminLayout
      title="Novo item"
      actions={
        <button className="button-ghost" type="button" onClick={() => router.push('/menu')}>
          <ArrowLeft size={16} />
          Voltar ao cardápio
        </button>
      }
    >
      {/* ── Alert / Error ── */}
      {alert && (
        <div className="pf-alert">
          <AlertCircle size={16} />
          <span>{alert}</span>
          <button type="button" onClick={() => setAlert(null)}><X size={14} /></button>
        </div>
      )}
      {message && (
        <div className="pf-alert pf-alert-error">
          <AlertCircle size={16} />
          <span>{message}</span>
        </div>
      )}

      {/* ── Stepper ── */}
      <div className="pf-stepper">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const isActive = step === s.num
          const isDone = step > s.num
          return (
            <div key={s.num} className="pf-step-wrapper">
              {i > 0 && <div className={`pf-step-line ${isDone ? 'done' : ''}`} />}
              <button
                type="button"
                className={`pf-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
                onClick={() => setStep(s.num)}
              >
                <span className="pf-step-icon">
                  {isDone ? <Check size={16} /> : <Icon size={16} />}
                </span>
                <span className="pf-step-label">{s.label}</span>
              </button>
            </div>
          )
        })}
      </div>

      {/* ── Form Card ── */}
      <div className="pf-card">
        {/* STEP 1: Informações */}
        {step === 1 && (
          <div className="pf-step-content">
            <div className="pf-two-cols">
              <div className="pf-fields">
                <div className="pf-field">
                  <label>Categoria</label>
                  <select
                    className="pf-input"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="pf-field">
                  <label>Nome do item <span className="pf-required">*</span></label>
                  <input
                    className="pf-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: X-Tudo"
                  />
                </div>
                <div className="pf-field">
                  <label>Descrição</label>
                  <textarea
                    className="pf-input pf-textarea"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Uma breve descrição do item (opcional)"
                  />
                </div>
                <div className="pf-field">
                  <label>Preço (R$) <span className="pf-required">*</span></label>
                  <input
                    className="pf-input"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    type="text"
                    inputMode="decimal"
                  />
                </div>
                <div className="pf-toggles">
                  <label className="pf-toggle">
                    <input
                      type="checkbox"
                      checked={isSoldByWeight}
                      onChange={(e) => setIsSoldByWeight(e.target.checked)}
                    />
                    <span className="pf-toggle-slider" />
                    <span>Vendido por kg</span>
                  </label>
                  <label className="pf-toggle">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    <span className="pf-toggle-slider" />
                    <span>Item ativo</span>
                  </label>
                </div>
              </div>

              {/* Image Upload */}
              <div className="pf-upload-area">
                <label className="pf-upload-zone" tabIndex={0}>
                  {imagePreview ? (
                    <div className="pf-upload-preview">
                      <img src={imagePreview} alt="Preview" />
                      <button
                        type="button"
                        className="pf-upload-remove"
                        onClick={(e) => { e.preventDefault(); handleImageChange(null) }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="pf-upload-placeholder">
                      <ImagePlus size={36} strokeWidth={1.2} />
                      <span className="pf-upload-title">Foto do item</span>
                      <span className="pf-upload-hint">Clique para escolher ou arraste a imagem</span>
                      <span className="pf-upload-meta">PNG, JPG ou WebP • máx 1MB</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpg,image/jpeg,image/webp"
                    onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Adicionais */}
        {step === 2 && (
          <div className="pf-step-content">
            <div className="pf-section-header">
              <h3>Grupos de adicionais</h3>
              <button className="button-ghost" type="button" onClick={() => router.push('/menu/additionals')}>
                <Layers size={15} />
                Gerenciar grupos
              </button>
            </div>

            <label className="pf-toggle" style={{ marginBottom: 16 }}>
              <input type="checkbox" checked={useAdditionals} onChange={(e) => setUseAdditionals(e.target.checked)} />
              <span className="pf-toggle-slider" />
              <span>Este item possui adicionais</span>
            </label>

            {useAdditionals && (
              <div className="pf-checkbox-cards">
                {groups.length === 0 ? (
                  <div className="pf-empty-mini">
                    <Layers size={24} strokeWidth={1.2} />
                    <p>Nenhum grupo de adicionais cadastrado.</p>
                    <button className="button-ghost" type="button" onClick={() => router.push('/menu/additionals')}>
                      <Plus size={14} /> Criar grupo
                    </button>
                  </div>
                ) : (
                  groups.map((g) => (
                    <label key={g.id} className={`pf-checkbox-card ${selectedGroupIds.includes(g.id) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(g.id)}
                        onChange={(e) =>
                          setSelectedGroupIds((prev) =>
                            e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id),
                          )
                        }
                      />
                      <span className="pf-checkbox-card-name">{g.name}</span>
                      {selectedGroupIds.includes(g.id) && <Check size={16} className="pf-checkbox-card-check" />}
                    </label>
                  ))
                )}
              </div>
            )}

            {!useAdditionals && (
              <p className="pf-hint-text">Ative a opção acima para vincular grupos de adicionais a este item.</p>
            )}
          </div>
        )}

        {/* STEP 3: Tags */}
        {step === 3 && (
          <div className="pf-step-content">
            <div className="pf-section-header">
              <h3>Classificações (tags)</h3>
            </div>
            <div className="pf-tag-input-row">
              <input
                className="pf-input"
                placeholder="Nome da nova tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    document.getElementById('add-tag-btn')?.click()
                  }
                }}
              />
              <button
                id="add-tag-btn"
                className="button-primary"
                type="button"
                onClick={async () => {
                  if (!selectedRestaurantId || !tagInput.trim()) return
                  const created = await createTag({ restaurant_id: selectedRestaurantId, name: tagInput.trim() })
                  if (!created.error) {
                    setTags((prev) => [...prev, created.data])
                    setSelectedTagIds((prev) => [...prev, created.data.id])
                    setTagInput('')
                  }
                }}
              >
                <Plus size={16} />
                Adicionar
              </button>
            </div>

            {tags.length === 0 ? (
              <div className="pf-empty-mini">
                <Tag size={24} strokeWidth={1.2} />
                <p>Nenhuma tag cadastrada ainda.</p>
              </div>
            ) : (
              <div className="pf-checkbox-cards">
                {tags.map((tag) => (
                  <label key={tag.id} className={`pf-checkbox-card ${selectedTagIds.includes(tag.id) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedTagIds.includes(tag.id)}
                      onChange={(e) =>
                        setSelectedTagIds((prev) =>
                          e.target.checked ? [...prev, tag.id] : prev.filter((id) => id !== tag.id),
                        )
                      }
                    />
                    <span className="pf-checkbox-card-name">{tag.name}</span>
                    {selectedTagIds.includes(tag.id) && <Check size={16} className="pf-checkbox-card-check" />}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Disponibilidade */}
        {step === 4 && (
          <div className="pf-step-content">
            <div className="pf-section-header">
              <h3>Disponibilidade</h3>
            </div>
            <div className="pf-availability-options">
              {[
                { value: 'always', label: 'Sempre disponível', desc: 'Item aparecerá normalmente no cardápio' },
                { value: 'paused', label: 'Pausado', desc: 'Item temporariamente indisponível' },
                { value: 'schedule', label: 'Horários específicos', desc: 'Disponível apenas em dias e horários definidos' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`pf-radio-card ${availabilityMode === opt.value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="availability"
                    value={opt.value}
                    checked={availabilityMode === opt.value}
                    onChange={() => setAvailabilityMode(opt.value as typeof availabilityMode)}
                  />
                  <div>
                    <strong>{opt.label}</strong>
                    <span>{opt.desc}</span>
                  </div>
                </label>
              ))}
            </div>

            {availabilityMode === 'schedule' && (
              <div className="pf-schedule-card">
                <h4>Dias e Horários</h4>
                <p className="pf-hint-text">Selecione os dias em que este item estará disponível e defina os horários.</p>
                <div className="pf-schedule-days">
                  {DAYS_OF_WEEK.map((d) => {
                    const rule = scheduleRules.find((r) => r.day === d.key)
                    const isChecked = !!rule
                    return (
                      <div key={d.key} className={`pf-schedule-day ${isChecked ? 'active' : ''}`}>
                        <label className="pf-toggle">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setScheduleRules((prev) => [...prev, { day: d.key, open: '08:00', close: '22:00' }])
                              } else {
                                setScheduleRules((prev) => prev.filter((r) => r.day !== d.key))
                              }
                            }}
                          />
                          <span className="pf-toggle-slider" />
                          <span>{d.label}</span>
                        </label>
                        {isChecked && (
                          <div className="pf-schedule-times">
                            <div className="pf-schedule-time">
                              <label>Abre</label>
                              <input
                                type="time"
                                className="pf-input"
                                value={rule!.open}
                                onChange={(e) =>
                                  setScheduleRules((prev) =>
                                    prev.map((r) => r.day === d.key ? { ...r, open: e.target.value } : r),
                                  )
                                }
                              />
                            </div>
                            <div className="pf-schedule-time">
                              <label>Fecha</label>
                              <input
                                type="time"
                                className="pf-input"
                                value={rule!.close}
                                onChange={(e) =>
                                  setScheduleRules((prev) =>
                                    prev.map((r) => r.day === d.key ? { ...r, close: e.target.value } : r),
                                  )
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Footer Actions ── */}
        <div className="pf-footer">
          <button className="button-ghost" type="button" onClick={() => router.push('/menu')}>
            Cancelar
          </button>
          <div className="pf-footer-right">
            {step > 1 && (
              <button className="button-secondary" type="button" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={16} />
                Voltar
              </button>
            )}
            {step < 4 ? (
              <button className="button-primary" type="button" onClick={() => setStep(step + 1)}>
                Avançar
                <ArrowRight size={16} />
              </button>
            ) : (
              <button className="button-primary" type="button" onClick={handleSave} disabled={saving}>
                <Save size={16} />
                {saving ? 'Salvando...' : 'Criar item'}
              </button>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
