import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import {
  fetchCategories,
  fetchProductById,
  updateProduct,
  type Category,
} from '../api/catalog'
import { createProductImage } from '../api/images'
import { supabase } from '../lib/supabase'
import { toCents } from '../lib/money'
import { fetchTags, createTag, fetchTagLinks, addTagToProduct, removeTagFromProduct, type ProductTag } from '../api/tags'
import { fetchAdditionalGroups, fetchAdditionalGroupLinks, addGroupToProduct, removeGroupFromProduct, type AdditionalGroup } from '../api/additionals'
import { useToast } from '../components/Toast'
import {
  ArrowLeft,
  ArrowRight,
  Check,
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

export default function ProductEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { pushToast } = useToast()
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
  const [step, setStep] = useState(1)
  const [tagInput, setTagInput] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [initialTagIds, setInitialTagIds] = useState<string[]>([])
  const [useAdditionals, setUseAdditionals] = useState(false)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [initialGroupIds, setInitialGroupIds] = useState<string[]>([])
  const [availabilityMode, setAvailabilityMode] = useState<'always' | 'paused' | 'schedule'>('always')
  const [scheduleRules, setScheduleRules] = useState<ScheduleRule[]>([])
  const [isSoldByWeight, setIsSoldByWeight] = useState(false)
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    async function loadData() {
      if (!id) return
      const productResult = await fetchProductById(id)
      if (!active) return
      if (productResult.error) {
        setMessage('Falha ao carregar item.')
        return
      }
      const product = productResult.data
      setRestaurantId(product.restaurant_id)
      setCategoryId(product.category_id ?? '')
      setName(product.name)
      setDescription(product.description ?? '')
      setPrice((product.price_cents / 100).toFixed(2))
      setIsActive(product.is_active)
      setAvailabilityMode((product.availability_mode as typeof availabilityMode) ?? 'always')
      setIsSoldByWeight(product.is_sold_by_weight)
      // Load existing schedule rules
      if (product.availability_rules && (product.availability_rules as any).schedule) {
        setScheduleRules((product.availability_rules as any).schedule)
      }

      const [cats, tagsResult, groupsResult, tagLinksResult, groupLinksResult] = await Promise.all([
        fetchCategories(product.restaurant_id),
        fetchTags(product.restaurant_id),
        fetchAdditionalGroups(product.restaurant_id),
        fetchTagLinks(product.id),
        fetchAdditionalGroupLinks(product.id),
      ])
      if (!active) return
      setCategories(cats.data ?? [])
      setTags(tagsResult.data ?? [])
      setGroups(groupsResult.data ?? [])
      const tagIds = (tagLinksResult.data ?? []).map((link) => link.tag_id)
      const groupIds = (groupLinksResult.data ?? []).map((link) => link.group_id)
      setSelectedTagIds(tagIds)
      setInitialTagIds(tagIds)
      setSelectedGroupIds(groupIds)
      setInitialGroupIds(groupIds)
      setUseAdditionals(groupIds.length > 0)
    }
    loadData()
    return () => { active = false }
  }, [id])

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
    if (!id) return
    if (!name.trim() || !price.trim()) {
      setMessage('Informe o nome e o preço.')
      setStep(1)
      return
    }
    setSaving(true)
    const result = await updateProduct(id, {
      category_id: categoryId || null,
      name,
      description: description || null,
      price_cents: toCents(price),
      is_active: isActive,
      is_out_of_stock: availabilityMode === 'paused',
      is_sold_by_weight: isSoldByWeight,
      availability_mode: availabilityMode,
      availability_rules: availabilityMode === 'schedule' ? { schedule: scheduleRules } : null,
    })
    if (result.error) {
      setMessage(`Falha ao salvar: ${result.error.message}`)
      setSaving(false)
      return
    }

    const toAddTags = selectedTagIds.filter((tid) => !initialTagIds.includes(tid))
    const toRemoveTags = initialTagIds.filter((tid) => !selectedTagIds.includes(tid))
    for (const tagId of toAddTags) await addTagToProduct(id, tagId)
    for (const tagId of toRemoveTags) await removeTagFromProduct(id, tagId)

    const toAddGroups = selectedGroupIds.filter((gid) => !initialGroupIds.includes(gid))
    const toRemoveGroups = initialGroupIds.filter((gid) => !selectedGroupIds.includes(gid))
    for (const gid of toAddGroups) await addGroupToProduct(id, gid)
    for (const gid of toRemoveGroups) await removeGroupFromProduct(id, gid)

    if (imageFile && restaurantId) {
      const path = `${restaurantId}/${id}/${Date.now()}-${imageFile.name}`
      const upload = await supabase.storage
        .from('product-images')
        .upload(path, imageFile, { cacheControl: '3600', upsert: false })
      if (!upload.error) {
        const publicUrl = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
        await createProductImage({
          restaurant_id: restaurantId,
          product_id: id,
          url: publicUrl,
          sort_order: 0,
        })
      }
    }

    pushToast('Alterações salvas')
    setSaving(false)
    navigate('/menu', { replace: true })
  }

  return (
    <AdminLayout
      title="Editar item"
      actions={
        <button className="button-ghost" type="button" onClick={() => navigate('/menu')}>
          <ArrowLeft size={16} />
          Voltar ao cardápio
        </button>
      }
    >
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
        {step === 1 && (
          <div className="pf-step-content">
            <div className="pf-two-cols">
              <div className="pf-fields">
                <div className="pf-field">
                  <label>Categoria</label>
                  <select className="pf-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">Sem categoria</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="pf-field">
                  <label>Nome do item <span className="pf-required">*</span></label>
                  <input className="pf-input" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="pf-field">
                  <label>Descrição</label>
                  <textarea className="pf-input pf-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Uma breve descrição (opcional)" />
                </div>
                <div className="pf-field">
                  <label>Preço (R$) <span className="pf-required">*</span></label>
                  <input className="pf-input" value={price} onChange={(e) => setPrice(e.target.value)} type="text" inputMode="decimal" />
                </div>
                <div className="pf-toggles">
                  <label className="pf-toggle">
                    <input type="checkbox" checked={isSoldByWeight} onChange={(e) => setIsSoldByWeight(e.target.checked)} />
                    <span className="pf-toggle-slider" />
                    <span>Vendido por kg</span>
                  </label>
                  <label className="pf-toggle">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    <span className="pf-toggle-slider" />
                    <span>Item ativo</span>
                  </label>
                </div>
              </div>
              <div className="pf-upload-area">
                <label className="pf-upload-zone" tabIndex={0}>
                  {imagePreview ? (
                    <div className="pf-upload-preview">
                      <img src={imagePreview} alt="Preview" />
                      <button type="button" className="pf-upload-remove" onClick={(e) => { e.preventDefault(); handleImageChange(null) }}>
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="pf-upload-placeholder">
                      <ImagePlus size={36} strokeWidth={1.2} />
                      <span className="pf-upload-title">Atualizar foto</span>
                      <span className="pf-upload-hint">Clique para escolher uma nova imagem</span>
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

        {step === 2 && (
          <div className="pf-step-content">
            <div className="pf-section-header">
              <h3>Grupos de adicionais</h3>
              <button className="button-ghost" type="button" onClick={() => navigate('/menu/additionals')}>
                <Layers size={15} /> Gerenciar grupos
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
                    <p>Nenhum grupo cadastrado.</p>
                  </div>
                ) : groups.map((g) => (
                  <label key={g.id} className={`pf-checkbox-card ${selectedGroupIds.includes(g.id) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={selectedGroupIds.includes(g.id)} onChange={(e) =>
                      setSelectedGroupIds((prev) => e.target.checked ? [...prev, g.id] : prev.filter((x) => x !== g.id))
                    } />
                    <span className="pf-checkbox-card-name">{g.name}</span>
                    {selectedGroupIds.includes(g.id) && <Check size={16} className="pf-checkbox-card-check" />}
                  </label>
                ))}
              </div>
            )}
            {!useAdditionals && <p className="pf-hint-text">Ative a opção acima para vincular grupos de adicionais.</p>}
          </div>
        )}

        {step === 3 && (
          <div className="pf-step-content">
            <div className="pf-section-header"><h3>Classificações (tags)</h3></div>
            <div className="pf-tag-input-row">
              <input className="pf-input" placeholder="Nome da nova tag" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('edit-tag-btn')?.click() } }}
              />
              <button
                id="edit-tag-btn"
                className="button-primary" type="button"
                onClick={async () => {
                  if (!tagInput.trim() || !restaurantId) return
                  const created = await createTag({ restaurant_id: restaurantId, name: tagInput.trim() })
                  if (!created.error) {
                    setTags((prev) => [...prev, created.data])
                    setSelectedTagIds((prev) => [...prev, created.data.id])
                    setTagInput('')
                  }
                }}
              >
                <Plus size={16} /> Adicionar
              </button>
            </div>
            {tags.length === 0 ? (
              <div className="pf-empty-mini"><Tag size={24} strokeWidth={1.2} /><p>Nenhuma tag cadastrada.</p></div>
            ) : (
              <div className="pf-checkbox-cards">
                {tags.map((tag) => (
                  <label key={tag.id} className={`pf-checkbox-card ${selectedTagIds.includes(tag.id) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={selectedTagIds.includes(tag.id)} onChange={(e) =>
                      setSelectedTagIds((prev) => e.target.checked ? [...prev, tag.id] : prev.filter((x) => x !== tag.id))
                    } />
                    <span className="pf-checkbox-card-name">{tag.name}</span>
                    {selectedTagIds.includes(tag.id) && <Check size={16} className="pf-checkbox-card-check" />}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="pf-step-content">
            <div className="pf-section-header"><h3>Disponibilidade</h3></div>
            <div className="pf-availability-options">
              {[
                { value: 'always', label: 'Sempre disponível', desc: 'Item aparecerá normalmente no cardápio' },
                { value: 'paused', label: 'Pausado', desc: 'Item temporariamente indisponível' },
                { value: 'schedule', label: 'Horários específicos', desc: 'Disponível apenas em dias e horários definidos' },
              ].map((opt) => (
                <label key={opt.value} className={`pf-radio-card ${availabilityMode === opt.value ? 'selected' : ''}`}>
                  <input type="radio" name="availability" value={opt.value} checked={availabilityMode === opt.value}
                    onChange={() => setAvailabilityMode(opt.value as typeof availabilityMode)} />
                  <div><strong>{opt.label}</strong><span>{opt.desc}</span></div>
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

        <div className="pf-footer">
          <button className="button-ghost" type="button" onClick={() => navigate('/menu')}>Cancelar</button>
          <div className="pf-footer-right">
            {step > 1 && (
              <button className="button-secondary" type="button" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={16} /> Voltar
              </button>
            )}
            {step < 4 ? (
              <button className="button-primary" type="button" onClick={() => setStep(step + 1)}>
                Avançar <ArrowRight size={16} />
              </button>
            ) : (
              <button className="button-primary" type="button" onClick={handleSave} disabled={saving}>
                <Save size={16} /> {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
