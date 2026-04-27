import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { useAdmin } from '../components/AdminContext'
import {
  createAdditional,
  createAdditionalGroup,
  deleteAdditional,
  deleteAdditionalGroup,
  fetchAdditionalGroups,
  fetchAdditionals,
  type AdditionalGroup,
  type AdditionalItem,
} from '../api/additionals'
import { toCents, formatCents } from '../lib/money'
import { useToast } from '../components/Toast'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Layers,
  AlertCircle,
  Package,
} from 'lucide-react'

export default function AdditionalsManager() {
  const { selectedRestaurantId } = useAdmin()
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const [groups, setGroups] = useState<AdditionalGroup[]>([])
  const [items, setItems] = useState<Record<string, AdditionalItem[]>>({})
  const [newGroupName, setNewGroupName] = useState('')
  const [newItemName, setNewItemName] = useState<Record<string, string>>({})
  const [newItemPrice, setNewItemPrice] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function loadGroups() {
      if (!selectedRestaurantId) return
      const result = await fetchAdditionalGroups(selectedRestaurantId)
      if (!active) return
      if (result.error) {
        setMessage('Falha ao carregar grupos.')
        return
      }
      setGroups(result.data ?? [])
      const groupsData = result.data ?? []
      const itemsMap: Record<string, AdditionalItem[]> = {}
      for (const group of groupsData) {
        const list = await fetchAdditionals(group.id)
        itemsMap[group.id] = list.data ?? []
      }
      setItems(itemsMap)
    }
    loadGroups()
    return () => { active = false }
  }, [selectedRestaurantId])

  async function handleCreateGroup() {
    if (!selectedRestaurantId || !newGroupName.trim()) return
    const result = await createAdditionalGroup({
      restaurant_id: selectedRestaurantId,
      name: newGroupName.trim(),
      min_select: 0,
      max_select: 1,
      is_required: false,
      sort_order: groups.length + 1,
    })
    if (result.error) {
      setMessage('Falha ao criar grupo.')
      return
    }
    setGroups((prev) => [...prev, result.data])
    setItems((prev) => ({ ...prev, [result.data.id]: [] }))
    setNewGroupName('')
    pushToast('Grupo criado!')
  }

  async function handleCreateItem(groupId: string) {
    const name = newItemName[groupId]
    const price = newItemPrice[groupId]
    if (!name?.trim()) return
    const result = await createAdditional({
      group_id: groupId,
      name: name.trim(),
      price_cents: toCents(price || '0'),
    })
    if (result.error) {
      setMessage('Falha ao criar adicional.')
      return
    }
    setItems((prev) => ({
      ...prev,
      [groupId]: [...(prev[groupId] ?? []), result.data],
    }))
    setNewItemName((prev) => ({ ...prev, [groupId]: '' }))
    setNewItemPrice((prev) => ({ ...prev, [groupId]: '' }))
    pushToast('Adicional criado!')
  }

  async function handleDeleteGroup(groupId: string) {
    if (!confirm('Excluir este grupo e todos os seus adicionais?')) return
    const result = await deleteAdditionalGroup(groupId)
    if (result.error) {
      setMessage('Falha ao remover grupo.')
      return
    }
    setGroups((prev) => prev.filter((g) => g.id !== groupId))
    pushToast('Grupo removido')
  }

  async function handleDeleteItem(groupId: string, itemId: string) {
    const result = await deleteAdditional(itemId)
    if (result.error) {
      setMessage('Falha ao remover adicional.')
      return
    }
    setItems((prev) => ({
      ...prev,
      [groupId]: (prev[groupId] ?? []).filter((item) => item.id !== itemId),
    }))
    pushToast('Adicional removido')
  }

  return (
    <AdminLayout
      title="Grupos de adicionais"
      actions={
        <button className="button-ghost" type="button" onClick={() => navigate('/menu')}>
          <ArrowLeft size={16} />
          Voltar ao cardápio
        </button>
      }
    >
      {/* ── Error ── */}
      {message && (
        <div className="pf-alert pf-alert-error">
          <AlertCircle size={16} />
          <span>{message}</span>
        </div>
      )}

      {/* ── Create Group ── */}
      <div className="am-create-group">
        <div className="pf-section-header">
          <h3>Criar novo grupo</h3>
        </div>
        <div className="am-create-row">
          <input
            className="pf-input"
            placeholder="Nome do grupo (ex: Molhos, Extras...)"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGroup() }}
          />
          <button className="button-primary" type="button" onClick={handleCreateGroup}>
            <Plus size={16} />
            Criar grupo
          </button>
        </div>
      </div>

      {/* ── Empty State ── */}
      {groups.length === 0 && !message && (
        <div className="mm-empty-state">
          <div className="mm-empty-icon">
            <Layers size={48} strokeWidth={1.2} />
          </div>
          <h3>Nenhum grupo de adicionais</h3>
          <p>Crie seu primeiro grupo para começar a adicionar itens como molhos, extras e acompanhamentos.</p>
        </div>
      )}

      {/* ── Groups List ── */}
      <div className="mm-categories-list">
        {groups.map((group, i) => {
          const groupItems = items[group.id] ?? []
          return (
            <div key={group.id} className="mm-category-card animate-in" style={{ animationDelay: `${i * 0.06}s` }}>
              {/* ── Group Header ── */}
              <div className="am-group-header">
                <div className="am-group-info">
                  <div className="am-group-icon">
                    <Layers size={18} />
                  </div>
                  <div>
                    <h3>{group.name}</h3>
                    <span className="mm-category-count">{groupItems.length} {groupItems.length === 1 ? 'adicional' : 'adicionais'}</span>
                  </div>
                </div>
                <button
                  className="mm-action-btn mm-action-danger"
                  type="button"
                  onClick={() => handleDeleteGroup(group.id)}
                  title="Remover grupo"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {/* ── Add Item Row ── */}
              <div className="am-add-item-row">
                <input
                  className="pf-input"
                  placeholder="Nome do adicional"
                  value={newItemName[group.id] ?? ''}
                  onChange={(e) =>
                    setNewItemName((prev) => ({ ...prev, [group.id]: e.target.value }))
                  }
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateItem(group.id) }}
                />
                <input
                  className="pf-input am-price-input"
                  placeholder="Preço (R$)"
                  value={newItemPrice[group.id] ?? ''}
                  onChange={(e) =>
                    setNewItemPrice((prev) => ({ ...prev, [group.id]: e.target.value }))
                  }
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateItem(group.id) }}
                  inputMode="decimal"
                />
                <button className="mm-action-btn mm-action-add" type="button" onClick={() => handleCreateItem(group.id)}>
                  <Plus size={16} />
                  <span>Adicionar</span>
                </button>
              </div>

              {/* ── Items List ── */}
              <div className="am-items-list">
                {groupItems.length === 0 ? (
                  <div className="pf-empty-mini">
                    <Package size={24} strokeWidth={1.2} />
                    <p>Nenhum adicional neste grupo</p>
                  </div>
                ) : (
                  groupItems.map((item) => (
                    <div key={item.id} className="am-item-row">
                      <span className="am-item-name">{item.name}</span>
                      <span className="am-item-price">{formatCents(item.price_cents)}</span>
                      <button
                        className="mm-action-btn mm-action-danger"
                        type="button"
                        onClick={() => handleDeleteItem(group.id, item.id)}
                        title="Remover adicional"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </AdminLayout>
  )
}
