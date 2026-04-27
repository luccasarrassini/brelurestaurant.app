import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { useAdmin } from '../components/AdminContext'
import { fetchDrivers, upsertDriver, deleteDriver, type Driver } from '../api/drivers'
import { useToast } from '../components/Toast'
import { 
  Phone, 
  Bike, 
  Car, 
  Trash2, 
  Edit2, 
  Plus, 
  Search,
  Circle,
  Truck,
  Check,
  X,
  UserPlus
} from 'lucide-react'

export default function Drivers() {
  const { selectedRestaurantId } = useAdmin()
  const { pushToast } = useToast()
  
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState<Partial<Driver>>({
    name: '',
    phone: '',
    vehicle_type: 'moto',
    status: 'offline'
  })
  const [saving, setSaving] = useState(false)

  const loadDrivers = useCallback(async () => {
    if (!selectedRestaurantId) return
    setLoading(true)
    const { data, error } = await fetchDrivers(selectedRestaurantId)
    if (!error && data) {
      setDrivers(data as Driver[])
    }
    setLoading(false)
  }, [selectedRestaurantId])

  useEffect(() => {
    loadDrivers()
  }, [loadDrivers])

  const filteredDrivers = drivers.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || d.status === filterStatus
    return matchSearch && matchStatus
  })

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRestaurantId) return
    if (!formData.name) {
      pushToast('Nome é obrigatório')
      return
    }

    setSaving(true)
    const { data, error } = await upsertDriver({
      ...formData,
      restaurant_id: selectedRestaurantId,
    })

    setSaving(false)
    if (error) {
      alert(`DETALHES DO ERRO:\n\n${JSON.stringify(error, null, 2)}`)
      pushToast('Erro ao salvar entregador')
    } else if (data) {
      pushToast('Entregador salvo com sucesso!')
      setShowModal(false)
      loadDrivers()
    }
  }

  const handleStatusToggle = async (driver: Driver, nextStatus: 'available' | 'delivering' | 'offline') => {
    if (!selectedRestaurantId || driver.status === nextStatus) return
    const { error } = await upsertDriver({
      id: driver.id,
      restaurant_id: selectedRestaurantId,
      status: nextStatus
    })
    if (!error) {
      pushToast(`Status de ${driver.name} alterado`)
      loadDrivers()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este entregador?')) return
    const { error } = await deleteDriver(id)
    if (!error) {
      pushToast('Entregador excluído')
      loadDrivers()
    }
  }

  const openNewModal = () => {
    setFormData({ name: '', phone: '', vehicle_type: 'moto', status: 'available' })
    setShowModal(true)
  }

  const openEditModal = (driver: Driver) => {
    setFormData(driver)
    setShowModal(true)
  }

  const getStatusColor = (status: string) => {
    if (status === 'available') return 'var(--emerald-500)'
    if (status === 'delivering') return 'var(--blue-500)'
    return 'var(--gray-400)'
  }

  const getStatusBg = (status: string) => {
    if (status === 'available') return 'var(--emerald-50)'
    if (status === 'delivering') return 'var(--blue-50)'
    return 'var(--gray-50)'
  }

  const getStatusText = (status: string) => {
    if (status === 'available') return 'var(--emerald-700)'
    if (status === 'delivering') return 'var(--blue-700)'
    return 'var(--gray-600)'
  }

  return (
    <AdminLayout title="Frotas & Entregadores">
      {/* ── Header Filters ── */}
      <div className="dv-header-actions">
        <div className="dv-filters">
          <div className="dv-search-wrapper">
            <Search size={16} className="dv-search-icon" />
            <input
              className="pf-input"
              type="text"
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="pf-input dv-status-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">Todos os Status</option>
            <option value="available">Disponíveis</option>
            <option value="delivering">Em Entrega</option>
            <option value="offline">Offline</option>
          </select>
        </div>
        <button type="button" className="button-primary" onClick={openNewModal}>
          <UserPlus size={16} />
          Novo Entregador
        </button>
      </div>

      {/* ── Loading / Empty State / List ── */}
      <div className="pf-card" style={{ marginTop: 24 }}>
        <div className="pf-step-content" style={{ padding: 0 }}>
          {loading ? (
            <div className="pf-empty-mini" style={{ border: 'none', minHeight: 300 }}>
              <Truck size={32} className="spin-slow" />
              <p>Carregando entregadores...</p>
            </div>
          ) : filteredDrivers.length === 0 ? (
            <div className="pf-empty-mini" style={{ border: 'none', minHeight: 360 }}>
              <div className="mm-empty-icon" style={{ background: 'var(--amber-50)', color: 'var(--amber-600)' }}>
                <Truck size={40} strokeWidth={1.2} />
              </div>
              <h3 style={{ fontSize: 18, color: 'var(--gray-900)', marginTop: 8, marginBottom: 4 }}>Nenhum entregador encontrado</h3>
              <p style={{ maxWidth: 300 }}>
                {search || filterStatus !== 'all' 
                  ? 'Tente alterar os filtros de busca para encontrar resultados.'
                  : 'Você ainda não possui entregadores cadastrados na sua frota.'}
              </p>
              {!search && filterStatus === 'all' && (
                <button type="button" className="button-primary" onClick={openNewModal} style={{ marginTop: 16 }}>
                  <Plus size={16} /> Cadastrar primeiro entregador
                </button>
              )}
            </div>
          ) : (
            <div className="dv-list">
              {filteredDrivers.map((driver) => (
                <div key={driver.id} className="dv-list-item">
                  <div className="dv-list-avatar">
                    {driver.name.charAt(0).toUpperCase()}
                  </div>
                  
                  <div className="dv-list-info">
                    <p className="dv-list-name">{driver.name}</p>
                    <div className="dv-list-meta">
                      <span className="dv-list-meta-item">
                        <Phone size={12} />
                        {driver.phone || 'Sem telefone'}
                      </span>
                      <span className="dv-list-meta-item">
                        {driver.vehicle_type === 'moto' && <Bike size={12} />}
                        {driver.vehicle_type === 'carro' && <Car size={12} />}
                        {driver.vehicle_type === 'bike' && <Bike size={12} />}
                        <span className="capitalize">{driver.vehicle_type || 'Moto'}</span>
                      </span>
                    </div>
                  </div>

                  <div className="dv-status-dropdown-wrapper">
                    <select
                      className="dv-status-select-inline"
                      value={driver.status}
                      onChange={(e) => handleStatusToggle(driver, e.target.value as any)}
                      style={{
                        backgroundColor: getStatusBg(driver.status),
                        color: getStatusText(driver.status),
                        borderColor: getStatusColor(driver.status)
                      }}
                    >
                      <option value="available">● Disponível</option>
                      <option value="delivering">● Em Entrega</option>
                      <option value="offline">● Offline</option>
                    </select>
                  </div>

                  <div className="dv-list-actions">
                    <button type="button" className="mm-action-btn" onClick={() => openEditModal(driver)} title="Editar">
                      <Edit2 size={16} />
                    </button>
                    <button type="button" className="mm-action-btn mm-action-danger" onClick={() => handleDelete(driver.id)} title="Excluir">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Slide-over Modal ── */}
      {showModal && (
        <>
          <div className="dv-backdrop" onClick={() => setShowModal(false)} />
          <div className="dv-modal-panel slide-in-right">
            <div className="dv-modal-header">
              <h3>{formData.id ? 'Editar Entregador' : 'Novo Entregador'}</h3>
              <button className="button-ghost p-1" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form className="dv-modal-content" onSubmit={handleSave}>
              <div className="pf-fields">
                <div className="pf-field">
                  <label>Nome Completo <span className="pf-required">*</span></label>
                  <input
                    className="pf-input"
                    type="text"
                    required
                    placeholder="Ex: João da Silva"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                
                <div className="pf-field">
                  <label>Telefone / WhatsApp</label>
                  <input
                    className="pf-input"
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                <div className="pf-section-header" style={{ marginTop: 16 }}>
                  <h3>Veículo</h3>
                </div>
                <div className="pf-availability-options">
                  {[
                    { value: 'moto', label: 'Motocicleta', icon: Bike },
                    { value: 'carro', label: 'Carro', icon: Car },
                    { value: 'bike', label: 'Bicicleta', icon: Bike },
                  ].map((opt) => {
                    const Icon = opt.icon
                    return (
                      <label key={opt.value} className={`pf-radio-card ${formData.vehicle_type === opt.value ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="vehicle"
                          value={opt.value}
                          checked={formData.vehicle_type === opt.value}
                          onChange={() => setFormData({ ...formData, vehicle_type: opt.value as any })}
                        />
                        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <Icon size={20} color="var(--gray-500)" />
                          <strong style={{ flex: 1 }}>{opt.label}</strong>
                        </div>
                        {formData.vehicle_type === opt.value && <Check size={16} className="pf-checkbox-card-check" />}
                      </label>
                    )
                  })}
                </div>

                <div className="pf-section-header" style={{ marginTop: 16 }}>
                  <h3>Status Inicial</h3>
                </div>
                <select
                  className="pf-input"
                  value={formData.status || 'offline'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                >
                  <option value="available">Disponível</option>
                  <option value="delivering">Em Entrega</option>
                  <option value="offline">Offline</option>
                </select>
              </div>

              <div className="pf-footer" style={{ margin: 'auto -24px -24px -24px', padding: '20px 24px', position: 'sticky', bottom: 0, zIndex: 10 }}>
                <button type="button" className="button-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <div className="pf-footer-right">
                  <button type="submit" className="button-primary" disabled={saving}>
                    {saving ? 'Salvando...' : formData.id ? 'Salvar Alterações' : 'Cadastrar'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </>
      )}
    </AdminLayout>
  )
}
