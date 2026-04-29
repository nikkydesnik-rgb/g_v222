import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useStore } from '@/store/useStore';
import { Plus, Trash2, Edit, Save, X, Building2, User } from 'lucide-react';
import type { SavedOrganization, Representative } from '@/types';
import { toast } from 'sonner';

interface OrganizationDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OrganizationDatabaseModal({ isOpen, onClose }: OrganizationDatabaseModalProps) {
  const { savedOrganizations, addSavedOrganization, updateSavedOrganization, removeSavedOrganization } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [currentOrg, setCurrentOrg] = useState<Partial<SavedOrganization>>({
    name: '', info: '', representatives: []
  });

  const handleEdit = (org: SavedOrganization) => {
    setEditingId(org.id);
    setCurrentOrg({ ...org });
  };

  const handleAddNew = () => {
    setEditingId('new');
    setCurrentOrg({
      name: '',
      info: '',
      representatives: []
    });
  };

  const handleSave = () => {
    if (!currentOrg.name?.trim()) {
      toast.error('Введите название организации');
      return;
    }

    if (editingId === 'new') {
      const newOrg: SavedOrganization = {
        id: crypto.randomUUID(),
        name: currentOrg.name,
        info: currentOrg.info || '',
        representatives: currentOrg.representatives || []
      };
      addSavedOrganization(newOrg);
      toast.success('Организация добавлена');
    } else if (editingId) {
      updateSavedOrganization(editingId, currentOrg);
      toast.success('Организация обновлена');
    }
    
    setEditingId(null);
  };

  const handleCancel = () => {
    setEditingId(null);
  };

  const addRepresentative = () => {
    setCurrentOrg(prev => ({
      ...prev,
      representatives: [
        ...(prev.representatives || []),
        { id: crypto.randomUUID(), role: '', fio: '' }
      ]
    }));
  };

  const updateRepresentative = (index: number, field: keyof Representative, value: string) => {
    setCurrentOrg(prev => {
      const reps = [...(prev.representatives || [])];
      reps[index] = { ...reps[index], [field]: value };
      return { ...prev, representatives: reps };
    });
  };

  const removeRepresentative = (index: number) => {
    setCurrentOrg(prev => {
      const reps = [...(prev.representatives || [])];
      reps.splice(index, 1);
      return { ...prev, representatives: reps };
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-purple-600" />
            База организаций
          </DialogTitle>
          <DialogDescription>
            Вы можете сохранить данные организаций (ИНН, ОГРН, адреса) и их представителей (ФИО, Должность) для быстрого ввода в акты.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4 py-4 min-h-[300px]">
          {editingId ? (
            <div className="space-y-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Название организации (краткое или полное)</Label>
                  <Input 
                    placeholder='ООО "Ромашка"' 
                    value={currentOrg.name} 
                    onChange={e => setCurrentOrg({ ...currentOrg, name: e.target.value })} 
                    className="bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Реквизиты организации (будет подставляться в "Информация_по_...")</Label>
                  <Textarea 
                    placeholder="ИНН: ..., ОГРН: ..., Юридический адрес: ..." 
                    value={currentOrg.info} 
                    onChange={e => setCurrentOrg({ ...currentOrg, info: e.target.value })}
                    className="bg-white min-h-[80px]"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-600" />
                    Представители (без приказов/распоряжений)
                  </Label>
                  <Button variant="outline" size="sm" onClick={addRepresentative} className="gap-1 h-8">
                    <Plus className="w-3.5 h-3.5" /> Добавить лицо
                  </Button>
                </div>
                
                {currentOrg.representatives?.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4 bg-white rounded border border-dashed">Нет добавленных представителей</p>
                ) : (
                  <div className="space-y-3">
                    {currentOrg.representatives?.map((rep, idx) => (
                      <div key={rep.id} className="flex items-start gap-3 bg-white p-3 rounded-lg border shadow-sm">
                        <div className="flex-1 space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-gray-500">Должность (с заглавной)</Label>
                            <Input 
                              placeholder="Генеральный директор" 
                              value={rep.role} 
                              onChange={e => updateRepresentative(idx, 'role', e.target.value)} 
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-gray-500">ФИО (фамилия и инициалы)</Label>
                            <Input 
                              placeholder="Иванов И.И." 
                              value={rep.fio} 
                              onChange={e => updateRepresentative(idx, 'fio', e.target.value)} 
                              className="h-8"
                            />
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeRepresentative(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {savedOrganizations.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">База организаций пуста</p>
                  <Button onClick={handleAddNew} variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Создать первую организацию
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedOrganizations.map(org => (
                    <div key={org.id} className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative group">
                      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(org)} className="h-8 w-8 text-blue-600 hover:bg-blue-50">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => {
                          if (confirm('Удалить организацию из базы?')) removeSavedOrganization(org.id);
                        }} className="h-8 w-8 text-red-600 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      <h4 className="font-semibold text-gray-900 pr-16 truncate">{org.name}</h4>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2 min-h-[32px]">{org.info || 'Нет реквизитов'}</p>
                      
                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
                        <User className="w-3.5 h-3.5" />
                        Представителей: {org.representatives?.length || 0}
                      </div>
                    </div>
                  ))}
                  
                  <button 
                    onClick={handleAddNew}
                    className="border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors min-h-[140px] flex-col gap-2"
                  >
                    <Plus className="w-6 h-6" />
                    <span className="font-medium text-sm">Добавить организацию</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4 sm:justify-between w-full">
          {editingId ? (
            <>
              <Button variant="outline" onClick={handleCancel}>Отмена</Button>
              <Button onClick={handleSave} className="gap-2">
                <Save className="w-4 h-4" /> Сохранить
              </Button>
            </>
          ) : (
            <>
              <div />
              <Button onClick={onClose}>Закрыть</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
