import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

/**
 * Normalize key for display
 */
function normalizeKey(key: string): string {
  return key.replace(/\s*_\s*/g, '_').replace(/\s+/g, ' ').trim();
}

/**
 * Check if a string looks like a template key
 */
function isValidKey(key: string): boolean {
  if (!/[а-яёa-z]/i.test(key) || key.length === 0) return false;
  // If it's too long, it's probably not a key
  if (key.length > 100) return false;
  // Reject keys with obvious formatting bugs or quotes
  if (/[:="'«»]/.test(key)) return false;
  if (key.startsWith('w:') || key.startsWith('w14:') || key.startsWith('xmlns')) return false;
  return true;
}

/**
 * Extract text from <w:t> elements
 */
function extractTextFromWTElements(content: string): string {
  const textParts: string[] = [];
  const tRegex = /<w:t(?: xml:space="preserve")?[^>]*>([\s\S]*?)<\/w:t>/g;
  let m;
  while ((m = tRegex.exec(content)) !== null) {
    textParts.push(m[1]);
  }
  return textParts.join('');
}

/**
 * Extract keys from DOCX template using docxtemplater to get plain text
 */
export async function extractKeysFromDocx(arrayBuffer: ArrayBuffer): Promise<string[]> {
  try {
    const zip = new PizZip(arrayBuffer);
    
    // Combine text from document, header, and footer XMLs
    let fullText = '';
    for (const fileName of Object.keys(zip.files)) {
      if (
        fileName.startsWith('word/') &&
        (fileName.endsWith('.xml') || fileName.includes('.xml.'))
      ) {
        const content = zip.files[fileName].asText() || '';
        fullText += extractTextFromWTElements(content) + ' ';
      }
    }

    const keys: string[] = [];
    const found = new Set<string>();

    const curlyPattern = /\{\{\s*([^}]+?)\s*\}\}/g;
    const anglePattern = /<([а-яёa-z][^<>]*?)>/gi;

    let match;
    while ((match = curlyPattern.exec(fullText)) !== null) {
      const key = normalizeKey(match[1]);
      if (key && isValidKey(key) && !found.has(key)) {
        found.add(key);
        keys.push(key);
      }
    }

    while ((match = anglePattern.exec(fullText)) !== null) {
      const key = normalizeKey(match[1]);
      if (key && isValidKey(key) && !found.has(key)) {
        found.add(key);
        keys.push(key);
      }
    }

    return keys;
  } catch (error) {
    console.error('Error parsing DOCX keys:', error);
    return [];
  }
}

/**
 * Check if buffer is a valid DOCX ZIP
 */
function isZipBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Fill DOCX template with data using docxtemplater
 */
export async function fillDocxTemplate(
  arrayBuffer: ArrayBuffer,
  data: Record<string, any>
): Promise<ArrayBuffer> {
  try {
    if (!isZipBuffer(arrayBuffer)) {
      throw new Error('Template is not a valid DOCX');
    }

    const zip = new PizZip(arrayBuffer);
    
    // Improved marker replacement: handle split XML tags
    // We'll target word/document.xml, word/header*.xml, word/footer*.xml
    for (const fileName of Object.keys(zip.files)) {
      if (fileName.startsWith('word/') && fileName.endsWith('.xml')) {
        let content = zip.files[fileName].asText();
        if (!content) continue;

        // Stage 1: Specific cleaning of markers (handling split w:t tags)
        // We target &lt;...&gt; and <...> blocks but only if they don't look like standard XML tags
        content = content.replace(/(&lt;|<)([\s\S]+?)(&gt;|>)/gi, (fullMatch, start, tagContent, end) => {
          // If it's a standard XML tag (starts with w:, v:, o:, /, etc.), ignore it
          if (/^[a-z0-9]+:/i.test(tagContent) || tagContent.startsWith('/') || tagContent.startsWith('?')) {
            return fullMatch;
          }

          const cleanTag = tagContent.replace(/<[^>]+>/g, '').trim();
          const lowerTag = cleanTag.toLowerCase();
          const snakeTag = lowerTag.replace(/\s+/g, '_');

          // Check if we have a match in data
          const dataKeys = Object.keys(data || {});
          for (const dataKey of dataKeys) {
            const lowerDataKey = dataKey.toLowerCase().trim();
            const snakeDataKey = lowerDataKey.replace(/\s+/g, '_');
            
            if (lowerTag === lowerDataKey || snakeTag === snakeDataKey || lowerTag === snakeDataKey || snakeTag === lowerDataKey) {
              return `{{${dataKey}}}`;
            }
          }
          // If it looks like a marker but we don't have data, clean it anyway to help docxtemplater/mammoth
          if (cleanTag.length > 0 && cleanTag.length < 100 && !cleanTag.includes('<')) {
            return `{{${cleanTag}}}`;
          }
          return fullMatch;
        });

        zip.file(fileName, content);
      }
    }

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
      nullGetter() {
        return "";
      },
      parser: (tag: string) => {
        const lowerTag = tag.toLowerCase().trim();
        const snakeTag = lowerTag.replace(/\s+/g, '_');

        return {
          get: (scope: any) => {
            if (lowerTag === '.') return scope;
            if (scope[tag] !== undefined) return scope[tag];

            for (const key of Object.keys(scope)) {
              const lowerKey = key.toLowerCase().trim();
              const snakeKey = lowerKey.replace(/\s+/g, '_');
              if (lowerKey === lowerTag || snakeKey === snakeTag || lowerKey === snakeTag || snakeKey === lowerTag) {
                return scope[key];
              }
            }
            return "";
          }
        };
      }
    });

    try {
      doc.render(data);
    } catch (e: any) {
      console.error('Docxtemplater Render Error:', e);
      // If we failed with {{ }}, it's probably a template syntax error.
      // We'll throw a helpful message.
      if (e.properties && e.properties.errors instanceof Array) {
        const errorMessages = e.properties.errors.map((error: any) => {
          return `${error.message}${error.properties?.xtag ? ` (тег "${error.properties.xtag}")` : ''}`;
        }).join('\n');
        throw new Error(`Ошибка в шаблоне:\n${errorMessages}`);
      }
      throw e;
    }

    const buf = doc.getZip().generate({
      type: "arraybuffer",
      compression: "DEFLATE",
    });

    return buf;
  } catch (error: any) {
    console.error('Error filling DOCX template:', error);
    throw error;
  }
}

/**
 * Convert ArrayBuffer to Base64
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert key to snake_case
 */
export function toSnakeCase(key: string): string {
  return key.trim().replace(/\s+/g, '_').replace(/[<>{}]/g, '').replace(/_{2,}/g, '_');
}

/**
 * Get hint for key
 */
export function getKeyHint(key: string): string {
  const hints: Record<string, string> = {
    'объект строительства': 'Объект капитального строительства',
    'организация - застройщик': 'Застройщик, техзаказчик',
    'должн. предст. застройщика': 'Должность представителя застройщика',
    'фио застройщика': 'ФИО представителя застройщика',
    'расп. застройщик': 'Распоряжение представителя застройщика',
  };
  return hints[key.toLowerCase().trim()] || '';
}

/**
 * Check if key is AOSR-specific
 */
export function isAOSRKey(key: string): boolean {
  const normalized = key.toLowerCase();
  
  // Exact or prefix matches
  const exactKeys = ['номер_акта', 'чн', 'мн', 'гн', 'чк', 'мк', 'гк', 'материалы', 'приложения', 'сп', 'разрешает_производство_работ', 'наименование_работ'];
  
  if (exactKeys.includes(normalized)) return true;
  
  // Also check if any substring logic applies, but strictly bounded
  // Example for 'СП' if it's the exact word or surrounded by underscores
  if (/(?:^|_)(сп|номер|акт|материалы|чн|мн|гн|чк|мк|гк)(?:_|$)/.test(normalized)) {
    return true;
  }
  
  // Fallback for "наименование_работ", "разрешает_производство_работ" 
  // since they are handled uniquely by AOSR table
  if (normalized.includes('наименование_работ') || normalized.includes('разрешает_производство')) {
    return true;
  }

  return false;
}

/**
 * Format material for act
 */
export function formatMaterialForAct(
  material: { name: string; quantity: string; unit: string; qualityDoc: string; expiryDate: string },
  includeDocs: boolean
): string {
  const base = `${material.name} - ${material.quantity} ${material.unit}`;
  if (!includeDocs || !material.qualityDoc.trim()) return base;
  const prefix = material.qualityDoc.toLowerCase().includes('паспорт') ? 'от' : 'с/д';
  const docInfo = material.expiryDate 
    ? `${material.qualityDoc} ${prefix} ${material.expiryDate}` 
    : material.qualityDoc;
  return `${base} (${docInfo})`;
}