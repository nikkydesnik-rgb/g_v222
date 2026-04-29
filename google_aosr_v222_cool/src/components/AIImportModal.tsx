import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkles, Loader2, CheckCircle2, AlertCircle, Upload, File, X } from 'lucide-react';
import { parseDocumentText, type PARSED_DATA, type AIFile } from '../services/aiService';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';

interface AIImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIImportModal({ isOpen, onClose }: AIImportModalProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<PARSED_DATA | null>(null);
  const [selectedPermanentData, setSelectedPermanentData] = useState<Set<string>>(new Set());
  const [selectedActs, setSelectedActs] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { setPermanentData, addAOSRAct, savedOrganizations } = useStore();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const validFiles = newFiles.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
      
      if (newFiles.length !== validFiles.length) {
        toast.warning('Некоторые файлы были пропущены. Поддерживаются только изображения и PDF.');
      }
      
      setFiles(prev => [...prev, ...validFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleProcess = async () => {
    if (!text.trim() && files.length === 0) {
      toast.error('Введите текст или прикрепите файлы для распознавания');
      return;
    }

    setIsProcessing(true);
    setParsedData(null);
    
    try {
      const aiFiles: AIFile[] = await Promise.all(
        files.map(async (file) => ({
          data: await fileToBase64(file),
          mimeType: file.type
        }))
      );

      const data = await parseDocumentText(text, aiFiles, savedOrganizations);
      setParsedData(data);
      setSelectedPermanentData(new Set(Object.keys(data.permanentData).filter(k => data.permanentData[k] && data.permanentData[k] !== '---')));
      setSelectedActs(new Set(data.acts ? data.acts.map((_, i) => i) : []));
      toast.success('Данные успешно проанализированы!');
    } catch (error) {
      console.error('AI Error:', error);
      toast.error('Ошибка при распознавании. Попробуйте еще раз.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = () => {
    if (!parsedData) return;

    let appliedPerm = 0;
    // Apply permanent data
    Object.entries(parsedData.permanentData).forEach(([key, value]) => {
      if (selectedPermanentData.has(key) && value && value !== '---') {
        setPermanentData(key, value);
        appliedPerm++;
      }
    });

    let appliedActs = 0;
    // Apply acts
    if (parsedData.acts && parsedData.acts.length > 0) {
      parsedData.acts.forEach((act, index) => {
        if (selectedActs.has(index)) {
          addAOSRAct({
            act_number: act.act_number || '',
            work_name: act.work_name || '',
            date_start: act.date_start || '',
            date_end: act.date_end || '',
            date_act: act.date_act || '',
            next_work: act.next_work || '',
            sp: [],
            materials: [],
            appendices: []
          });
          appliedActs++;
        }
      });
    }

    onClose();
    setParsedData(null);
    setText('');
    setFiles([]);
    toast.success(`Применено ${appliedPerm} полей и ${appliedActs} актов`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <DialogTitle>Интеллектуальный помощник (AI)</DialogTitle>
              <DialogDescription>
                Вставьте текст (из договора, приказа или перечня работ), и AI автоматически заполнит поля.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!parsedData ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Вставьте сюда текст для анализа или инструкции (напр: 'Представитель застройщика - Филлипова О.И.')..."
                  className="min-h-[120px] text-sm"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  Совет: Вы можете загрузить сканы документов (изображения/PDF) ниже, и AI-помощник найдет нужные данные.
                </p>
              </div>

              <div className="border-2 border-dashed border-purple-200 rounded-lg p-6 bg-purple-50/50 text-center relative hover:bg-purple-50 transition-colors">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                />
                <Upload className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-purple-900">Нажмите или перетащите сканы/документы (PDF/Images)</p>
                <p className="text-xs text-purple-500/70 mt-1">AI прочитает документы и извлечет нужную информацию</p>
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Прикрепленные файлы ({files.length}):</p>
                  <div className="flex gap-2 flex-wrap">
                    {files.map((file, i) => (
                      <div key={i} className="flex items-center gap-2 bg-white text-purple-700 px-3 py-1.5 rounded-md text-sm border border-purple-200 shadow-sm">
                        <File className="w-4 h-4" />
                        <span className="truncate max-w-[150px]">{file.name}</span>
                        <button 
                          onClick={() => removeFile(i)}
                          className="hover:bg-purple-100 p-0.5 rounded-full text-purple-900 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
              <h4 className="font-semibold flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                Результаты анализа
              </h4>
              
              <div className="space-y-4 max-h-[400px] overflow-y-auto text-sm">
                {Object.keys(parsedData.permanentData).length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-gray-700 mb-1">Выберите данные для заполнения:</p>
                    <div className="space-y-1.5">
                      {Object.entries(parsedData.permanentData)
                        .filter(([_, v]) => v && v !== '---')
                        .map(([k, v]) => (
                          <div key={k} className="flex items-start space-x-2 bg-white p-2 rounded border border-gray-200 shadow-sm hover:border-purple-200 transition-colors">
                            <Checkbox 
                              id={`perm-${k}`} 
                              checked={selectedPermanentData.has(k)}
                              className="mt-0.5"
                              onCheckedChange={(checked) => {
                                const newSet = new Set(selectedPermanentData);
                                if (checked) newSet.add(k);
                                else newSet.delete(k);
                                setSelectedPermanentData(newSet);
                              }}
                            />
                            <label htmlFor={`perm-${k}`} className="text-sm leading-snug flex-1 cursor-pointer">
                              <span className="font-semibold text-gray-800">{k}:</span> <span className="text-gray-600">{v}</span>
                            </label>
                          </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {parsedData.acts.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <p className="font-medium text-gray-700 mb-1">Добавить акты/работы ({parsedData.acts.length}):</p>
                    <div className="space-y-1.5">
                      {parsedData.acts.map((act, i) => (
                        <div key={i} className="flex items-start space-x-2 bg-white p-2 rounded border border-gray-200 shadow-sm hover:border-purple-200 transition-colors">
                          <Checkbox 
                            id={`act-${i}`} 
                            checked={selectedActs.has(i)}
                            className="mt-0.5"
                            onCheckedChange={(checked) => {
                              const newSet = new Set(selectedActs);
                              if (checked) newSet.add(i);
                              else newSet.delete(i);
                              setSelectedActs(newSet);
                            }}
                          />
                          <label htmlFor={`act-${i}`} className="text-sm leading-snug flex-1 cursor-pointer text-gray-700">
                            {act.act_number && <span className="font-semibold text-gray-900">№{act.act_number} </span>}
                            {act.work_name}
                            {act.date_act && <span className="text-gray-500 ml-2">({act.date_act})</span>}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between items-center">
          <Button variant="ghost" onClick={onClose} disabled={isProcessing}>
            Отмена
          </Button>
          
          <div className="flex gap-2">
            {parsedData ? (
              <Button variant="outline" onClick={() => setParsedData(null)}>
                Назад
              </Button>
            ) : null}
            
            {!parsedData ? (
              <Button 
                onClick={handleProcess} 
                disabled={isProcessing || !text.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Анализирую...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Распознать текст
                  </>
                )}
              </Button>
            ) : (
              <Button 
                onClick={handleApply}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Применить данные
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
