import React, { useState, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { base64ToArrayBuffer, fillDocxTemplate } from '@/utils/docxParser';
import { createDocxPreviewUrl, downloadDocx } from '@/utils/docxPreview';
import { Calculator, Eye, Plus, Trash2, X, Maximize2, Minimize2, ZoomIn, ZoomOut, Maximize, Download, ArrowUp, ArrowDown, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function getMonthNameGenitive(monthStr: string): string {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  return months[parseInt(monthStr, 10) - 1] || monthStr;
}

export const AOSRActsTab: React.FC = () => {
  const { 
    aosrActs, 
    updateAOSRAct, 
    addAOSRAct, 
    removeAOSRAct, 
    reorderAOSRActs,
    renumberAOSRActs,
    templates,
    materials,
    appendices,
    spList,
    permanentData,
    dateStart,
    dateEnd,
    includeMaterialDocs,
  } = useStore();

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editingActId, setEditingActId] = useState<string | null>(null);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showAppendixModal, setShowAppendixModal] = useState(false);
  const [showSPModal, setShowSPModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [deleteActId, setDeleteActId] = useState<string | null>(null);
  const [expandedCell, setExpandedCell] = useState<{actId: string, field: string} | null>(null);
  const [previewBuffer, setPreviewBuffer] = useState<ArrayBuffer | null>(null);
  const [previewActName, setPreviewActName] = useState<string>('Акт.docx');

  const acts = aosrActs;

  const handleAddRow = () => {
    const newNumber = acts.length > 0 ? Math.max(...acts.map(a => parseInt(a.act_number) || 0)) + 1 : 1;
    addAOSRAct({
      id: crypto.randomUUID(),
      act_number: newNumber.toString(),
      work_name: '',
      start_date: '',
      end_date: '',
      materials: [],
      appendices: [],
      sp: [],
      next_work: '',
      notes: '',
    });
  };

  const handleMoveAct = (index: number, direction: 'up' | 'down') => {
    const newActs = [...aosrActs];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newActs.length) return;
    
    [newActs[index], newActs[targetIndex]] = [newActs[targetIndex], newActs[index]];
    reorderAOSRActs(newActs);
  };

  const handleRenumber = () => {
    renumberAOSRActs();
    toast.success('Акты перенумерованы последовательно');
  };

  const handleCalculateDates = () => {
    if (!dateStart || !dateEnd) {
      toast.error('Укажите даты начала и окончания работ');
      return;
    }
    
    const startDate = new Date(dateStart);
    const endDate = new Date(dateEnd);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const actsCount = acts.length;
    
    if (actsCount === 0) {
      toast.error('Добавьте хотя бы один акт');
      return;
    }

    const daysPerAct = Math.floor(totalDays / actsCount);
    
    acts.forEach((act, index) => {
      const actStart = new Date(startDate);
      actStart.setDate(actStart.getDate() + (index * daysPerAct));
      const actEnd = new Date(actStart);
      actEnd.setDate(actEnd.getDate() + daysPerAct - 1);
      
      updateAOSRAct(act.id, {
        start_date: actStart.toISOString().split('T')[0],
        end_date: actEnd.toISOString().split('T')[0],
      });
    });
    
    toast.success(`Даты рассчитаны для ${actsCount} актов`);
  };

  const handlePreview = async (actId: string) => {
    const act = acts.find(a => a.id === actId);
    if (!act) return;

    const template = templates.find(t => t.type === 'aosr');
    if (!template) {
      toast.error('Шаблон АОСР не найден');
      return;
    }

    try {
      const templateData = base64ToArrayBuffer(template.fileData);
      const materialTexts = act.materials?.map(id => {
        const m = materials.find(m => m.id === id);
        return m ? `${m.name} - ${m.quantity}${m.unit}` : '';
      }).filter(Boolean).join(', ');

      const appendixTexts = act.appendices?.map(id => {
        const a = appendices.find(a => a.id === id);
        return a?.name || '';
      }).filter(Boolean).join(', ');

      let Чн = '', Мн = '', Гн = '', Чк = '', Мк = '', Гк = '';
      if (act.start_date) {
        const [y, m, d] = act.start_date.split('-');
        if (y && m && d) {
          Чн = d;
          Мн = getMonthNameGenitive(m);
          Гн = y.slice(-2);
        }
      }
      if (act.end_date) {
        const [y, m, d] = act.end_date.split('-');
        if (y && m && d) {
          Чк = d;
          Мк = getMonthNameGenitive(m);
          Гк = y.slice(-2);
        }
      }

      // Prepare organization fields with conditional commas and smart dashes
      const CENTERED_DASH = "                                                                                                            ---";

      const getGroupData = (keys: string[], firstKeyComma: boolean = false) => {
        const values = keys.map(k => permanentData[k] || '');
        const isEmpty = values.every(v => v === '');
        
        const result: Record<string, string> = {};
        
        if (isEmpty) {
          keys.forEach((k, i) => {
            result[k] = i === 0 ? CENTERED_DASH : '';
          });
          return result;
        }
        
        keys.forEach((k, i) => {
          let val = permanentData[k] || '';
          // Add comma to first field if it's the org/title field and there's more data following
          if (i === 0 && firstKeyComma && values.slice(1).some(v => v !== '')) {
            val = `${val},`;
          }
          result[k] = val;
        });
        
        return result;
      };

      const zastroyschikData = getGroupData(['Организация_застройщик', 'Информация_по_застройщику'], true);
      const stroitelData = getGroupData(['Организация_строитель', 'Информация_по_строителю'], true);
      const proektirovschikData = getGroupData(['Организация_проектировщик', 'Информация_по_проектировщику'], true);
      
      const actorZastroyschik = getGroupData(['Должн_предст_Застройщика', 'ФИО_Застройщика', 'Расп_Застройщик']);
      const actorStroitel = getGroupData(['Должн_предст_Строителя', 'ФИО_Строителя', 'Расп_Строитель']);
      const actorStroycontrol = getGroupData(['Должн_предст_Стр_Стройконтроль', 'ФИО_Стр_Стройконтроль', 'Расп_Стр_Стройконтроль']);
      const actorProject = getGroupData(['Должн_предст_Проектировщ', 'ФИО_предст_Проект', 'Расп_предст_Проект']);
      const actorSub = getGroupData(['Должность_субподр', 'ФИО_Субподр']);

      const getFieldData = (val: string) => val || CENTERED_DASH;

      const materialsVal = getFieldData(materialTexts);
      const appendicesVal = getFieldData(appendixTexts);
      const spVal = getFieldData(act.sp?.join(', ') || '');
      const nextWorkVal = getFieldData(act.next_work || '');

      const data: Record<string, any> = {
        ...permanentData,
        // Utility keys
        Прочерк: CENTERED_DASH,
        
        // Conditional commas and smart dashes for pairs/groups
        ...zastroyschikData,
        ...stroitelData,
        ...proektirovschikData,
        ...actorZastroyschik,
        ...actorStroitel,
        ...actorStroycontrol,
        ...actorProject,
        ...actorSub,
        
        // Russian keys (primary)
        'номер_акта': act.act_number || '',
        'акт_номер': act.act_number || '',
        'акт_№': act.act_number || '',
        'номер': act.act_number || '',
        'наименование_работ': act.work_name || '',
        'работы': act.work_name || '',
        'дата_составления': act.end_date ? new Date(act.end_date).toLocaleDateString('ru-RU') : '',
        'дата_акта': act.end_date ? new Date(act.end_date).toLocaleDateString('ru-RU') : '',
        'дата_документа': act.end_date ? new Date(act.end_date).toLocaleDateString('ru-RU') : '',
        'дата': act.end_date ? new Date(act.end_date).toLocaleDateString('ru-RU') : '',
        Чн, Мн, Гн,
        Чк, Мк, Гк,
        'материалы': materialsVal,
        'приложения': appendicesVal,
        'сп': spVal,
        'разрешает': nextWorkVal,
        'разрешает_производство_работ': nextWorkVal,
        'последующие_работы': nextWorkVal,
        
        // Key aliases
        'начало_работ': act.start_date ? new Date(act.start_date).toLocaleDateString('ru-RU') : '',
        'окончание_работ': act.end_date ? new Date(act.end_date).toLocaleDateString('ru-RU') : '',
        'дата_начала': act.start_date ? new Date(act.start_date).toLocaleDateString('ru-RU') : '',
        'дата_окончания': act.end_date ? new Date(act.end_date).toLocaleDateString('ru-RU') : '',
        
        // English aliases
        act_number: act.act_number || '',
        work_name: act.work_name || '',
        materials_list: materialsVal,
        appendices_list: appendicesVal,
        next_work: nextWorkVal,
        
        // Object Name variations
        'объект_строительства': permanentData['Объект строительства'] || permanentData['Объект_строительства'] || permanentData['object_name'] || '',
        'объект': permanentData['Объект строительства'] || permanentData['Объект_строительства'] || permanentData['object_name'] || '',
        'наименование_объекта': permanentData['Объект строительства'] || permanentData['Объект_строительства'] || permanentData['object_name'] || '',
        'object_name': permanentData['Объект строительства'] || permanentData['Объект_строительства'] || permanentData['object_name'] || '',
      };

      const filled = await fillDocxTemplate(templateData, data);
      
      if (filled === templateData) {
        throw new Error('Не удалось заполнить шаблон данными');
      }

      setPreviewBuffer(filled);
      setPreviewActName(`АОСР_${act.act_number || 'бн'}.docx`);
      const url = await createDocxPreviewUrl(filled);
      setPreviewUrl(url);
      setShowPreview(true);
      toast.success('Предпросмотр готов');
    } catch (error) {
      console.error('Preview error:', error);
      toast.error('Ошибка формирования предпросмотра');
    }
  };

  const confirmDelete = (actId: string) => {
    setDeleteActId(actId);
  };

  const handleDelete = () => {
    if (deleteActId) {
      removeAOSRAct(deleteActId);
      setDeleteActId(null);
      toast.success('Акт удалён');
    }
  };

  const handleMaterialSelect = (actId: string, materialId: string) => {
    const act = acts.find(a => a.id === actId);
    if (!act) return;
    
    const currentMaterials = act.materials || [];
    const newMaterials = currentMaterials.includes(materialId)
      ? currentMaterials.filter(id => id !== materialId)
      : [...currentMaterials, materialId];
    
    updateAOSRAct(actId, { materials: newMaterials });
  };

  const handleAppendixSelect = (actId: string, appendixId: string) => {
    const act = acts.find(a => a.id === actId);
    if (!act) return;
    
    const currentAppendices = act.appendices || [];
    const newAppendices = currentAppendices.includes(appendixId)
      ? currentAppendices.filter(id => id !== appendixId)
      : [...currentAppendices, appendixId];
    
    updateAOSRAct(actId, { appendices: newAppendices });
  };

  const handleSPSelect = (actId: string, sp: string) => {
    const act = acts.find(a => a.id === actId);
    if (!act) return;
    
    const currentSP = act.sp || [];
    const newSP = currentSP.includes(sp)
      ? currentSP.filter(s => s !== sp)
      : [...currentSP, sp];
    
    updateAOSRAct(actId, { sp: newSP });
  };

  const getMaterialDisplay = (act: typeof acts[0]): string => {
    if (!act.materials?.length) return '—';
    return act.materials.map(id => {
      const m = materials.find(m => m.id === id);
      if (!m) return '';
      
      let result = `${m.name} - ${m.quantity}${m.unit}`;
      
      if (includeMaterialDocs && m.qualityDoc) {
        const prefix = m.qualityDoc.toLowerCase().includes('паспорт') ? 'от' : 'c/д';
        const datePart = m.expiryDate 
          ? ` ${prefix} ${new Date(m.expiryDate).toLocaleDateString('ru-RU')}г.` 
          : '';
        result += ` (${m.qualityDoc}${datePart})`;
      }
      
      return result;
    }).filter(Boolean).join(', ');
  };

  const getAppendixDisplay = (act: typeof acts[0]): string => {
    if (!act.appendices?.length) return '—';
    return act.appendices.map(id => {
      const a = appendices.find(a => a.id === id);
      return a?.name || '';
    }).filter(Boolean).join(', ');
  };

  const getSPDisplay = (act: typeof acts[0]): string => {
    if (!act.sp?.length) return '—';
    return act.sp.join(', ');
  };

  const closePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setShowPreview(false);
  };

  const adjustZoom = (delta: number) => {
    setZoom(prev => Math.max(50, Math.min(150, prev + delta)));
  };

  const toggleCellExpand = (actId: string, field: string) => {
    if (expandedCell?.actId === actId && expandedCell?.field === field) {
      setExpandedCell(null);
    } else {
      setExpandedCell({ actId, field });
    }
  };

  return (
    <div className={cn("p-2", fullscreen && "fixed inset-0 z-40 bg-gray-50")}>
      <div className="flex justify-between mb-2 gap-2 flex-wrap items-center">
        <h2 className="text-lg font-bold">Акты АОСР</h2>
        
        {fullscreen && (
          <div className="flex items-center gap-2 bg-white rounded px-2 py-1 shadow">
            <button onClick={() => adjustZoom(-10)} className="p-1 hover:bg-gray-100 rounded" title="Уменьшить">
              <ZoomOut size={16} />
            </button>
            <span className="text-sm min-w-[50px] text-center">{zoom}%</span>
            <button onClick={() => adjustZoom(10)} className="p-1 hover:bg-gray-100 rounded" title="Увеличить">
              <ZoomIn size={16} />
            </button>
            <button onClick={() => setZoom(100)} className="p-1 hover:bg-gray-100 rounded text-xs" title="Сброс">
              100%
            </button>
          </div>
        )}
        
        <div className="flex gap-2 flex-wrap">
          <button 
            onClick={handleRenumber}
            className="px-2 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 flex items-center gap-1 text-xs"
            title="Перенумеровать все акты последовательно (1, 2, 3...)"
          >
            <Hash size={14} />
            №№
          </button>
          <button 
            onClick={handleCalculateDates}
            className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1 text-xs"
          >
            <Calculator size={14} />
            Даты
          </button>
          <button 
            onClick={handleAddRow}
            className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1 text-xs"
          >
            <Plus size={14} />
            Добавить
          </button>
          <button 
            onClick={() => setFullscreen(!fullscreen)}
            className={cn("px-2 py-1 rounded flex items-center gap-1 text-xs", fullscreen ? "bg-red-600 hover:bg-red-700 text-white" : "bg-gray-600 hover:bg-gray-700 text-white")}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      <div 
        className="overflow-auto"
        style={fullscreen ? { height: 'calc(100vh - 80px)' } : {}}
      >
        <div 
          style={fullscreen ? { transform: `scale(${zoom / 100})`, transformOrigin: 'top left' } : {}}
        >
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-1 px-1 border text-xs w-16">Порядок</th>
                <th className="py-1 px-1 border text-xs w-10">★</th>
                <th className="py-1 px-1 border text-xs w-12">№</th>
                <th className="py-1 px-1 border text-xs w-20">Начало</th>
                <th className="py-1 px-1 border text-xs w-20">Конец</th>
                <th className="py-1 px-1 border text-xs w-auto min-w-[200px]">Работы</th>
                <th className="py-1 px-1 border text-xs w-auto min-w-[200px]">Материалы</th>
                <th className="py-1 px-1 border text-xs w-32">Прилож.</th>
                <th className="py-1 px-1 border text-xs w-24">СП</th>
                <th className="py-1 px-1 border text-xs w-48">Разрешает</th>
                <th className="py-1 px-1 border text-xs w-10">✕</th>
              </tr>
            </thead>
            <tbody>
              {acts.map((act, index) => (
                <tr key={act.id}>
                  <td className="py-1 px-1 border text-center text-xs">
                    <div className="flex flex-col items-center gap-0.5">
                      <button 
                        onClick={() => handleMoveAct(index, 'up')}
                        disabled={index === 0}
                        className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Вверх"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <span className="font-medium text-[10px] leading-tight">{index + 1}</span>
                      <button 
                        onClick={() => handleMoveAct(index, 'down')}
                        disabled={index === acts.length - 1}
                        className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Вниз"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  </td>
                  <td className="py-1 px-1 border text-center">
                    <button 
                      onClick={() => handlePreview(act.id)}
                      className="text-green-600 hover:text-green-800 p-1"
                      title="Предпросмотр"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                  <td className="py-1 px-1 border">
                    <input 
                      type="text" 
                      value={act.act_number}
                      onChange={(e) => updateAOSRAct(act.id, { act_number: e.target.value })}
                      className="w-full p-1 border rounded text-xs"
                    />
                  </td>
                  <td className="py-1 px-1 border">
                    <input 
                      type="date" 
                      value={act.start_date}
                      onChange={(e) => updateAOSRAct(act.id, { start_date: e.target.value })}
                      className="w-full p-1 border rounded text-xs"
                    />
                  </td>
                  <td className="py-1 px-1 border">
                    <input 
                      type="date" 
                      value={act.end_date}
                      onChange={(e) => updateAOSRAct(act.id, { end_date: e.target.value })}
                      className="w-full p-1 border rounded text-xs"
                    />
                  </td>
                  <td className="py-1 px-1 border relative">
                    <div className="flex">
                      <textarea 
                        value={act.work_name}
                        onChange={(e) => updateAOSRAct(act.id, { work_name: e.target.value })}
                        className="w-full p-1 border rounded text-xs resize-none"
                        rows={expandedCell?.actId === act.id && expandedCell?.field === 'work' ? 4 : 2}
                        onClick={() => toggleCellExpand(act.id, 'work')}
                      />
                      {act.work_name.length > 50 && (
                        <button 
                          onClick={() => toggleCellExpand(act.id, 'work')}
                          className="absolute right-1 top-1 text-gray-400 hover:text-gray-600"
                        >
                          <Maximize size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-1 px-1 border relative">
                    <div className="flex">
                      <textarea 
                        value={getMaterialDisplay(act)}
                        onClick={() => { setEditingActId(act.id); setShowMaterialModal(true); }}
                        readOnly
                        className="w-full p-1 border rounded text-xs resize-none cursor-pointer bg-blue-50 hover:bg-blue-100"
                        rows={expandedCell?.actId === act.id && expandedCell?.field === 'materials' ? 4 : 2}
                        onFocus={() => toggleCellExpand(act.id, 'materials')}
                      />
                      {getMaterialDisplay(act).length > 30 && (
                        <button 
                          onClick={() => toggleCellExpand(act.id, 'materials')}
                          className="absolute right-1 top-1 text-gray-400 hover:text-gray-600"
                          title="Увеличить"
                        >
                          <Maximize size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-1 px-1 border">
                    <textarea 
                      value={getAppendixDisplay(act)}
                      onClick={() => { setEditingActId(act.id); setShowAppendixModal(true); }}
                      readOnly
                      className="w-full p-1 border rounded text-xs resize-none cursor-pointer bg-blue-50 hover:bg-blue-100"
                      rows={2}
                      title="Нажмите для выбора приложений"
                    />
                  </td>
                  <td className="py-1 px-1 border">
                    <textarea 
                      value={getSPDisplay(act)}
                      onClick={() => { setEditingActId(act.id); setShowSPModal(true); }}
                      readOnly
                      className="w-full p-1 border rounded text-xs resize-none cursor-pointer bg-blue-50 hover:bg-blue-100"
                      rows={2}
                      title="Нажмите для выбора СП"
                    />
                  </td>
                  <td className="py-1 px-1 border relative">
                    <div className="flex">
                      <textarea 
                        value={act.next_work || ''}
                        onChange={(e) => updateAOSRAct(act.id, { next_work: e.target.value })}
                        className="w-full p-1 border rounded text-xs resize-none"
                        rows={expandedCell?.actId === act.id && expandedCell?.field === 'next_work' ? 4 : 2}
                        onClick={() => toggleCellExpand(act.id, 'next_work')}
                        placeholder="Последующие работы"
                      />
                      {(act.next_work || '').length > 50 && (
                        <button 
                          onClick={() => toggleCellExpand(act.id, 'next_work')}
                          className="absolute right-1 top-1 text-gray-400 hover:text-gray-600"
                        >
                          <Maximize size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-1 px-1 border text-center">
                    {deleteActId === act.id ? (
                      <div className="flex gap-1 justify-center">
                        <button 
                          onClick={handleDelete}
                          className="text-green-600 hover:text-green-800 text-xs px-1 font-bold"
                          title="Подтвердить"
                        >
                          ✓
                        </button>
                        <button 
                          onClick={() => setDeleteActId(null)}
                          className="text-gray-500 hover:text-gray-700 text-xs px-1"
                          title="Отмена"
                        >
                          ✗
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => confirmDelete(act.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Удалить"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && previewUrl && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-3 rounded-lg w-full max-w-5xl max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold">Предпросмотр ({previewActName})</h3>
              <div className="flex items-center gap-2">
                {previewBuffer && (
                  <button 
                    onClick={() => downloadDocx(previewBuffer, previewActName)} 
                    className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                  >
                    <Download size={16} />
                    Скачать
                  </button>
                )}
                <button onClick={closePreview} className="text-gray-500 hover:text-gray-700 ml-2">
                  <X size={20} />
                </button>
              </div>
            </div>
            <iframe src={previewUrl} className="w-full h-[70vh]" title="Preview" />
          </div>
        </div>
      )}

      {/* Material Selection Modal */}
      {showMaterialModal && editingActId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg max-w-md w-full max-h-[80vh] overflow-auto">
            <h3 className="font-bold mb-2">Выберите материалы</h3>
            <div className="space-y-1 max-h-60 overflow-auto">
              {materials.length === 0 ? (
                <p className="text-gray-500">Нет материалов</p>
              ) : (
                materials.map(m => {
                  const act = acts.find(a => a.id === editingActId);
                  const isSelected = act?.materials?.includes(m.id);
                  return (
                    <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleMaterialSelect(editingActId, m.id)}
                      />
                      <span className="text-sm">{m.name} — {m.quantity}{m.unit}</span>
                    </label>
                  );
                })
              )}
            </div>
            <button 
              onClick={() => { setShowMaterialModal(false); setEditingActId(null); }}
              className="mt-3 px-3 py-1 bg-gray-200 rounded text-sm"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Appendix Selection Modal */}
      {showAppendixModal && editingActId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg max-w-md w-full max-h-[80vh] overflow-auto">
            <h3 className="font-bold mb-2">Выберите приложения</h3>
            <div className="space-y-1 max-h-60 overflow-auto">
              {appendices.length === 0 ? (
                <p className="text-gray-500">Нет приложений</p>
              ) : (
                appendices.map(a => {
                  const act = acts.find(ac => ac.id === editingActId);
                  const isSelected = act?.appendices?.includes(a.id);
                  return (
                    <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleAppendixSelect(editingActId, a.id)}
                      />
                      <span className="text-sm">{a.name}</span>
                    </label>
                  );
                })
              )}
            </div>
            <button 
              onClick={() => { setShowAppendixModal(false); setEditingActId(null); }}
              className="mt-3 px-3 py-1 bg-gray-200 rounded text-sm"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* SP Selection Modal */}
      {showSPModal && editingActId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg max-w-md w-full max-h-[80vh] overflow-auto">
            <h3 className="font-bold mb-2">Выберите СП</h3>
            <div className="space-y-1 max-h-60 overflow-auto">
              {spList.map(sp => {
                const act = acts.find(a => a.id === editingActId);
                const isSelected = act?.sp?.includes(sp);
                return (
                  <label key={sp} className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSPSelect(editingActId, sp)}
                    />
                    <span className="text-sm">{sp}</span>
                  </label>
                );
              })}
            </div>
            <button 
              onClick={() => { setShowSPModal(false); setEditingActId(null); }}
              className="mt-3 px-3 py-1 bg-gray-200 rounded text-sm"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};