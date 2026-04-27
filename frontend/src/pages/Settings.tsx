import { useState, useEffect } from 'react'
import AdminLayout from '../components/AdminLayout'
import { useAdmin } from '../components/AdminContext'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import { Save, Building, Phone, MapPin, Clock, Printer, Globe, Plus } from 'lucide-react'

export default function Settings() {
  const { selectedRestaurantId, restaurants } = useAdmin()
  const { pushToast } = useToast()
  const [loading, setLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    description: '',
    slug: '',
    is_open: true,
  })

  useEffect(() => {
    const restaurant = restaurants.find(r => r.id === selectedRestaurantId)
    if (restaurant) {
      setFormData({
        name: restaurant.name || '',
        phone: restaurant.phone || '',
        address: restaurant.address || '',
        description: (restaurant as any).description || '',
        slug: (restaurant as any).slug || '',
        is_open: (restaurant as any).is_open !== false,
      })
    }
  }, [selectedRestaurantId, restaurants])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedRestaurantId) return
    
    setLoading(true)
    const { error } = await supabase
      .from('restaurants')
      .update(formData)
      .eq('id', selectedRestaurantId)
    
    setLoading(false)
    if (error) {
      pushToast('Erro ao salvar: ' + error.message)
    } else {
      pushToast('Configurações salvas com sucesso!')
    }
  }

  return (
    <AdminLayout title="Configurações">
      <div className="max-w-4xl">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="card">
            <div className="card-header flex items-center gap-2">
              <Building size={20} className="text-blue-600" />
              <h3 className="card-title">Informações da Loja</h3>
            </div>
            <div className="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="field">
                <label className="label">Nome do Restaurante</label>
                <input 
                  type="text" 
                  className="input" 
                  value={formData.name} 
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} 
                />
              </div>
              <div className="field">
                <label className="label">Telefone de Contato</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-3 text-gray-400" />
                  <input 
                    type="text" 
                    className="input pl-10" 
                    value={formData.phone} 
                    onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} 
                  />
                </div>
              </div>
              <div className="field md:col-span-2">
                <label className="label">Endereço Completo</label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-3 text-gray-400" />
                  <input 
                    type="text" 
                    className="input pl-10" 
                    value={formData.address} 
                    onChange={e => setFormData(p => ({ ...p, address: e.target.value }))} 
                  />
                </div>
              </div>
              <div className="field md:col-span-2">
                <label className="label">Descrição / Bio</label>
                <textarea 
                  className="input min-h-[100px]" 
                  value={formData.description} 
                  onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header flex items-center gap-2">
              <Globe size={20} className="text-teal-600" />
              <h3 className="card-title">Presença Online</h3>
            </div>
            <div className="card-body">
              <div className="field">
                <label className="label">Slug da URL (ex: brelu.app/r/minha-loja)</label>
                <input 
                  type="text" 
                  className="input" 
                  value={formData.slug} 
                  onChange={e => setFormData(p => ({ ...p, slug: e.target.value }))} 
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header flex items-center gap-2">
              <Clock size={20} className="text-orange-600" />
              <h3 className="card-title">Funcionamento</h3>
            </div>
            <div className="card-body">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <h4 className="font-semibold text-gray-900">Loja Aberta</h4>
                  <p className="text-sm text-gray-500">Controle se sua loja está aceitando pedidos agora</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={formData.is_open} 
                    onChange={e => setFormData(p => ({ ...p, is_open: e.target.checked }))} 
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header flex items-center gap-2">
              <Printer size={20} className="text-purple-600" />
              <h3 className="card-title">Impressão</h3>
            </div>
            <div className="card-body">
              <p className="text-sm text-gray-500 mb-4">Configurações de impressão automática e formato do cupom.</p>
              <button type="button" className="button-ghost border-dashed border-2 flex-center gap-2 w-full py-4">
                <Plus size={20} /> Adicionar Impressora
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              type="submit" 
              className="button-primary flex-center gap-2 px-8"
              disabled={loading}
            >
              <Save size={20} />
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}
