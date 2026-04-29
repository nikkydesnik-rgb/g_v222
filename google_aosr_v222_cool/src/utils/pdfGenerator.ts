import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { base64ToArrayBuffer, formatMaterialForAct } from './docxParser';
import { formatDateRu } from './dateCalc';
import type { Session, RegistryEntry } from '@/types';
import mammoth from 'mammoth';
import html2pdf from 'html2pdf.js';

let regularFontBytes: Uint8Array | null = null;
let mediumFontBytes: Uint8Array | null = null;

async function getFont(pdfDoc: PDFDocument) {
  try {
    pdfDoc.registerFontkit(fontkit);
    
    if (!regularFontBytes) {
      const response = await fetch('/fonts/Roboto-Regular.ttf');
      if (!response.ok) throw new Error(`Font fetch failed: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      regularFontBytes = new Uint8Array(arrayBuffer);
    }
    
    const font = await pdfDoc.embedFont(regularFontBytes);
    return font;
  } catch (e) {
    console.error('Failed to load local font Roboto-Regular', e);
    return await pdfDoc.embedFont(StandardFonts.Helvetica);
  }
}

async function getBoldFont(pdfDoc: PDFDocument) {
  try {
    pdfDoc.registerFontkit(fontkit);
    
    if (!mediumFontBytes) {
      const response = await fetch('/fonts/Roboto-Medium.ttf');
      if (!response.ok) throw new Error(`Font fetch failed: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      mediumFontBytes = new Uint8Array(arrayBuffer);
    }

    const font = await pdfDoc.embedFont(mediumFontBytes);
    return font;
  } catch (e) {
    console.error('Failed to load local font Roboto-Medium', e);
    return await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }
}

import { tryRenderDocxOnServer } from './docxServerRenderer';
import { fillDocxTemplate } from './docxParser';

async function renderDocx(templateData: ArrayBuffer, data: Record<string, any>): Promise<ArrayBuffer> {
  try {
    const rendered = await tryRenderDocxOnServer(templateData, data);
    if (rendered) return rendered;
  } catch {
    // Fallback
  }
  return await fillDocxTemplate(templateData, data);
}

/**
 * Converts DOCX to PDF pages using mammoth + html2pdf
 */
async function docxToPdfPages(docxBuffer: ArrayBuffer, pdfDoc: PDFDocument): Promise<void> {
  if (!docxBuffer || docxBuffer.byteLength === 0) {
    console.error('Empty docxBuffer passed to docxToPdfPages');
    return;
  }

  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: docxBuffer });
    const html = result.value;
    
    if (html) {
       console.log('Mammoth converted HTML lengths:', html.length);
    }

    if (!html || html.trim() === '') {
       console.error('Mammoth produced empty HTML');
       throw new Error('Mammoth produced empty HTML');
    }

    // Improved PDF generation: Use a dedicated rendering style
    const styledHtml = `
      <div class="docx-pdf-rendering-content" style="font-family: 'Times New Roman', serif; font-size: 11.5pt; line-height: 1.2; color: black; background-color: white; padding: 40px; width: 794px; box-sizing: border-box;">
        <style>
          .docx-pdf-rendering-content table { border-collapse: collapse; width: 100%; margin-bottom: 1em; table-layout: fixed; word-wrap: break-word; }
          .docx-pdf-rendering-content table, .docx-pdf-rendering-content th, .docx-pdf-rendering-content td { border: 1px solid black; }
          .docx-pdf-rendering-content th, .docx-pdf-rendering-content td { padding: 4px; text-align: left; vertical-align: top; overflow-wrap: break-word; }
          .docx-pdf-rendering-content p { margin-top: 0; margin-bottom: 0.5em; min-height: 1em; }
          .docx-pdf-rendering-content strong, .docx-pdf-rendering-content b { font-weight: bold; }
        </style>
        ${html}
      </div>
    `;

    const opt = {
      margin: 0,
      filename: 'page.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        logging: false,
        backgroundColor: '#ffffff',
        width: 794
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
 
    // html2pdf can take the HTML string directly which is more stable
    const pdfBlob = await (html2pdf() as any).set(opt).from(styledHtml).outputPdf('blob');
    
    if (pdfBlob.size < 5000) {
      console.warn('Generated PDF blob might be too small:', pdfBlob.size);
    }
    
    const tempBuffer = await pdfBlob.arrayBuffer();
    const tempPdfDoc = await PDFDocument.load(tempBuffer);
    const pages = await pdfDoc.copyPages(tempPdfDoc, tempPdfDoc.getPageIndices());
    pages.forEach(p => pdfDoc.addPage(p));
  } catch (e) {
    console.error('Error converting DOCX to PDF pages:', e);
    const page = pdfDoc.addPage([595, 842]);
    const font = await getFont(pdfDoc);
    page.drawText('Ошибка конвертации DOCX в PDF. Посмотрите DOCX версию документа.', { x: 50, y: 700, size: 10, font });
  }
}

/**
 * Helper to draw wrapped text
 */
function drawTextWrapped(
  page: any,
  text: string,
  options: {
    x: number;
    y: number;
    size: number;
    font: any;
    maxWidth: number;
    lineHeight?: number;
  }
): number {
  const { x, y, size, font, maxWidth, lineHeight = size * 1.2 } = options;
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (const word of words) {
    const testLine = line + word + ' ';
    const width = font.widthOfTextAtSize(testLine, size);
    if (width > maxWidth && line !== '') {
      page.drawText(line.trim(), { x, y: currentY, size, font });
      line = word + ' ';
      currentY -= lineHeight;
    } else {
      line = testLine;
    }
  }
  page.drawText(line.trim(), { x, y: currentY, size, font });
  return currentY - lineHeight;
}

export async function generateRegistryPDF(
  entries: RegistryEntry[],
  objectName: string
): Promise<PDFDocument> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const font = await getFont(pdfDoc);
  const fontBold = await getBoldFont(pdfDoc);

  page.drawText('РЕЕСТР', {
    x: 260,
    y: 780,
    size: 16,
    font: fontBold,
  });

  page.drawText(`Объект: ${objectName}`, {
    x: 50,
    y: 750,
    size: 11,
    font,
  });

  const headers = ['№ п/п', 'Наименование документа', '№ и дата', 'Организация', 'Кол-во листов', 'Лист по списку'];
  const colWidths = [40, 180, 100, 120, 60, 60];
  let startX = 30;
  const startY = 720;

  for (let i = 0; i < headers.length; i++) {
    page.drawRectangle({
      x: startX,
      y: startY - 20,
      width: colWidths[i],
      height: 20,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    page.drawText(headers[i], {
      x: startX + 4,
      y: startY - 14,
      size: 8,
      font: fontBold,
    });

    startX += colWidths[i];
  }

  let currentY = startY - 20;
  let currentPage = page;

  for (const entry of entries) {
    if (currentY < 100) {
      currentPage = pdfDoc.addPage([595, 842]);
      currentY = 780;
      
      // Redraw headers on new page
      let headerX = 30;
      for (let i = 0; i < headers.length; i++) {
        currentPage.drawRectangle({
          x: headerX,
          y: currentY - 20,
          width: colWidths[i],
          height: 20,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1,
        });
        currentPage.drawText(headers[i], {
          x: headerX + 4,
          y: currentY - 14,
          size: 8,
          font: fontBold,
        });
        headerX += colWidths[i];
      }
      currentY -= 20;
    }

    startX = 30;
    const rowData = [
      entry.order.toString(),
      entry.documentName,
      entry.docNumber,
      entry.organization,
      entry.pageCount,
      entry.pageInList,
    ];

    for (let i = 0; i < rowData.length; i++) {
      currentPage.drawRectangle({
        x: startX,
        y: currentY - 20,
        width: colWidths[i],
        height: 20,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });

      let text = String(rowData[i] || '');
      if (text.length > 30) text = text.substring(0, 27) + '...';

      currentPage.drawText(text, {
        x: startX + 4,
        y: currentY - 14,
        size: 7,
        font,
      });

      startX += colWidths[i];
    }

    currentY -= 20;
  }

  return pdfDoc;
}

export async function generateFullPackagePDF(session: Session): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  const objectName = session.permanentData['Объект строительства'] || 
                     session.permanentData['Объект_строительства'] || 
                     session.permanentData['Наименование объекта'] || 
                     session.permanentData['object_name'] || 
                     'Не указан';

  // Render Title pages first (from other acts marked as title page)
  const titleActs = session.otherActs.filter((a) => a.isTitlePage);
  if (titleActs.length > 0) {
    for (const titleAct of titleActs) {
      const template = session.templates.find((t) => t.id === titleAct.templateId);
      if (template) {
        try {
          const templateData = base64ToArrayBuffer(template.fileData);
          const data = {
            ...session.permanentData,
            ...titleAct.values,
            object_name: objectName,
          };
          const filled = await renderDocx(templateData, data);
          await docxToPdfPages(filled, pdfDoc);
        } catch (e) {
          console.error('Title page error:', e);
          const page = pdfDoc.addPage([595, 842]);
          const font = await getFont(pdfDoc);
          page.drawText(`Титульный лист: ${titleAct.actName || template.name} (ошибка)`, { x: 70, y: 750, size: 12, font });
        }
      }
    }
  }

  const registryPDF = await generateRegistryPDF(session.registry, objectName);
  const registryPages = await pdfDoc.copyPages(registryPDF, registryPDF.getPageIndices());
  registryPages.forEach((p) => pdfDoc.addPage(p));

  for (const entry of session.registry) {
    if (entry.linkedFile) {
      const fileData = await entry.linkedFile.arrayBuffer();
      const fileType = entry.linkedFileName.toLowerCase();

      if (fileType.endsWith('.pdf')) {
        try {
          const attachedPdf = await PDFDocument.load(fileData);
          const pages = await pdfDoc.copyPages(attachedPdf, attachedPdf.getPageIndices());
          pages.forEach((p) => pdfDoc.addPage(p));
        } catch {
          // Skip
        }
      } else if (fileType.endsWith('.docx')) {
        try {
           await docxToPdfPages(fileData, pdfDoc);
        } catch {
           // Skip
        }
      } else {
        const page = pdfDoc.addPage([595, 842]);
        const font = await getFont(pdfDoc);
        const fontBold = await getBoldFont(pdfDoc);
        page.drawRectangle({ x: 20, y: 20, width: 555, height: 802, borderWidth: 1, borderColor: rgb(0,0,0) });
        page.drawText(entry.documentName, { x: 50, y: 780, size: 12, font: fontBold });
        page.drawText(`Файл: ${entry.linkedFileName}`, { x: 50, y: 760, size: 10, font });
      }
      continue;
    }

    if (entry.fileType === 'appendix') {
       const appendix = session.appendices.find(a => a.id === entry.sourceId);
       if (appendix && appendix.file) {
          try {
            const fileData = await appendix.file.arrayBuffer();
             if (appendix.fileName.toLowerCase().endsWith('.pdf')) {
                const attachedPdf = await PDFDocument.load(fileData);
                const pages = await pdfDoc.copyPages(attachedPdf, attachedPdf.getPageIndices());
                pages.forEach((p) => pdfDoc.addPage(p));
                continue;
             }
          } catch { /* skip */ }
       }
       const page = pdfDoc.addPage([595, 842]);
       const font = await getFont(pdfDoc);
       page.drawRectangle({ x: 20, y: 20, width: 555, height: 802, borderWidth: 1, borderColor: rgb(0,0,0) });
       page.drawText(`Приложение: ${entry.documentName}`, { x: 50, y: 780, size: 12, font });
       continue;
    }

    if (entry.fileType === 'act') {
      const aosrAct = session.aosrActs.find((a) => a.id === entry.sourceId);
      if (aosrAct) {
        const template = session.templates.find(t => t.id === aosrAct.templateId) || session.templates.find(t => t.type === 'aosr');
        if (template) {
          try {
            const templateData = base64ToArrayBuffer(template.fileData);
            const materialObjects = aosrAct.materials
              .map((id) => session.materials.find((m) => m.id === id))
              .filter((m): m is any => !!m);
            const materialStrings = materialObjects.map((m) => formatMaterialForAct(m, aosrAct.includeMaterialDocs)).filter(Boolean);
            
            const appendixObjects = aosrAct.appendices
              .map((id) => session.appendices.find((a) => a.id === id))
              .filter((a): a is any => !!a);
            const appendixStrings = appendixObjects.map((a) => a.name).filter(Boolean);

            const data: Record<string, any> = {
              ...session.permanentData,
              ...aosrAct,
              'номер_акта': aosrAct.act_number,
              'номер': aosrAct.act_number,
              'акт_№': aosrAct.act_number,
              'акт_номер': aosrAct.act_number,
              'наименование_работ': aosrAct.work_name,
              'работы': aosrAct.work_name,
              'дата_начала': formatDateRu(aosrAct.start_date),
              'дата_окончания': formatDateRu(aosrAct.end_date),
              'начало_работ': formatDateRu(aosrAct.start_date),
              'окончание_работ': formatDateRu(aosrAct.end_date),
              'дата_составления': formatDateRu(aosrAct.end_date),
              'дата_акта': formatDateRu(aosrAct.end_date),
              'разрешает': aosrAct.next_work,
              'разрешает_производство_работ': aosrAct.next_work,
              'последующие_работы': aosrAct.next_work,
              'материалы': materialStrings.join(', '),
              'приложения': appendixStrings.join(', '),
              'объект_строительства': objectName,
              'объект': objectName,
              'object_name': objectName,
              'наименование_объекта': objectName,
              'start_date': formatDateRu(aosrAct.start_date),
              'end_date': formatDateRu(aosrAct.end_date)
            };
            const docxBuffer = await renderDocx(templateData, data);
            await docxToPdfPages(docxBuffer, pdfDoc);
            continue;
          } catch (e) {
            console.error('AOSR docx to pdf error:', e);
          }
        }

        // Fallback manual drawing
        const font = await getFont(pdfDoc);
        const fontBold = await getBoldFont(pdfDoc);
        let page = pdfDoc.addPage([595, 842]);
        let y = 800;
        const margin = 50;
        const width = 495;

        page.drawRectangle({ x: 30, y: 30, width: 535, height: 782, borderWidth: 1, borderColor: rgb(0,0,0) });
        page.drawText(`АКТ № ${aosrAct.act_number || 'б/н'}`, { x: 250, y, size: 14, font: fontBold });
        y -= 30;

        const sections = [
          { label: 'Работы:', value: aosrAct.work_name },
          { label: 'Начало:', value: formatDateRu(aosrAct.start_date) },
          { label: 'Окончание:', value: formatDateRu(aosrAct.end_date) },
          { label: 'Разрешает:', value: aosrAct.next_work },
        ];

        for (const s of sections) {
          page.drawText(s.label, { x: margin, y, size: 9, font: fontBold });
          y -= 12;
          y = drawTextWrapped(page, String(s.value || '—'), { x: margin + 10, y, size: 9, font, maxWidth: width - 10 });
          y -= 15;
        }
        page.drawText('(Внимание: это упрощенная версия акта. Полная — в DOCX)', { x: 50, y: 40, size: 7, font, color: rgb(0.5,0.5,0.5) });
        continue;
      }

      const otherAct = session.otherActs.find((a) => a.id === entry.sourceId);
      if (otherAct) {
        const template = session.templates.find(t => t.id === otherAct.templateId);
        if (template) {
          try {
            const templateData = base64ToArrayBuffer(template.fileData);
            const allValues = { ...session.permanentData, ...otherAct.values, object_name: objectName };
            const docxBuffer = await renderDocx(templateData, allValues);
            await docxToPdfPages(docxBuffer, pdfDoc);
            continue;
          } catch (e) {
            console.error('Other act docx to pdf error:', e);
          }
        }

        const font = await getFont(pdfDoc);
        const fontBold = await getBoldFont(pdfDoc);
        const page = pdfDoc.addPage([595, 842]);
        page.drawRectangle({ x: 20, y: 20, width: 555, height: 802, borderWidth: 1, borderColor: rgb(0,0,0) });
        page.drawText(otherAct.actName || template?.name || 'АКТ', { x: 50, y: 780, size: 14, font: fontBold });
        
        let y = 750;
        const allKeys = Object.keys(otherAct.values);
        for (const k of allKeys.slice(0, 20)) {
           if (y < 80) break;
           page.drawText(`${k}:`, { x: 50, y, size: 8, font: fontBold });
           y -= 10;
           page.drawText(String(otherAct.values[k] || '—'), { x: 60, y: y, size: 8, font: font });
           y -= 12;
        }
      }
    }
  }

  return await pdfDoc.save();
}

export async function exportDOCX(session: Session, withAppendices: boolean): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const sessionFolder = zip.folder(session.name);
  if (!sessionFolder) return;

  const actsFolder = sessionFolder.folder('акты');
  const appendicesFolder = sessionFolder.folder('приложения');

  // Add Registry to the ZIP
  const objectName = session.permanentData['Объект строительства'] || 
                     session.permanentData['Объект_строительства'] || 
                     session.permanentData['Наименование объекта'] || 
                     session.permanentData['object_name'] || 
                     'Не указан';
  const registryPDF = await generateRegistryPDF(session.registry, objectName);
  const registryBytes = await registryPDF.save();
  sessionFolder.file('00_Реестр.pdf', registryBytes);

  for (const act of session.aosrActs) {
    const template = session.templates.find((t) => t.id === act.templateId) || session.templates.find((t) => t.type === 'aosr');
    if (!template || !actsFolder) continue;

    try {
      const templateData = base64ToArrayBuffer(template.fileData);

      const materialObjects = act.materials
        .map((id) => session.materials.find((m) => m.id === id))
        .filter((m): m is any => !!m);
      const materialStrings = materialObjects.map((m) => formatMaterialForAct(m, act.includeMaterialDocs)).filter(Boolean);

      const appendixObjects = act.appendices
        .map((id) => session.appendices.find((a) => a.id === id))
        .filter((a): a is any => !!a);
      const appendixStrings = appendixObjects.map((a) => a.name).filter(Boolean);

      const data: Record<string, any> = {
        ...session.permanentData,
        ...act,
        'номер_акта': act.act_number ? act.act_number.toString() : '',
        'номер': act.act_number ? act.act_number.toString() : '',
        'акт_№': act.act_number ? act.act_number.toString() : '',
        'акт_номер': act.act_number ? act.act_number.toString() : '',
        'наименование_работ': act.work_name || '',
        'работы': act.work_name || '',
        'дата_начала': act.start_date ? formatDateRu(act.start_date) : '',
        'дата_окончания': act.end_date ? formatDateRu(act.end_date) : '',
        'начало_работ': act.start_date ? formatDateRu(act.start_date) : '',
        'окончание_работ': act.end_date ? formatDateRu(act.end_date) : '',
        'дата_составления': act.end_date ? formatDateRu(act.end_date) : '',
        'дата_акта': act.end_date ? formatDateRu(act.end_date) : '',
        'разрешает': act.next_work || '',
        'разрешает_производство_работ': act.next_work || '',
        'последующие_работы': act.next_work || '',
        'материалы': materialStrings.join(', '),
        'приложения': appendixStrings.join(', '),
        'сп': act.sp || '',
        'объект_строительства': objectName,
        'объект': objectName,
        'наименование_объекта': objectName,
        'object_name': objectName,
        ...session.permanentData
      };

      const filled = await renderDocx(templateData, data);
      const safeWorkName = (act.work_name || '').substring(0, 30).replace(/[/\\?%*:|"<>]/g, '-');
      actsFolder.file(`АОСР_${act.act_number || 'б_н'}_${safeWorkName}.docx`, filled);
    } catch (e) {
      console.error('Error generating AOSR docx for export:', e);
    }
  }

  for (const act of session.otherActs) {
    const template = session.templates.find((t) => t.id === act.templateId);
    if (!template || !actsFolder) continue;

    try {
      const templateData = base64ToArrayBuffer(template.fileData);
      const data = {
        ...session.permanentData,
        ...act.values,
        object_name: session.permanentData['Объект строительства'] || session.permanentData['object_name'] || '',
      };

      const filled = await renderDocx(templateData, data);
      const prefix = act.isTitlePage ? '00_' : '';
      const safeTemplateName = (template.name || 'Акт').replace(/[/\\?%*:|"<>]/g, '-');
      actsFolder.file(`${prefix}${safeTemplateName}_${act.id}.docx`, filled);
    } catch (e) {
      console.error('Error generating other docx for export:', e);
    }
  }

  if (withAppendices && appendicesFolder) {
    for (const appendix of session.appendices) {
      if (appendix.file) {
        const fileData = await appendix.file.arrayBuffer();
        appendicesFolder.file(appendix.fileName, fileData);
      }
    }

    for (const material of session.materials) {
      if (material.file) {
        const fileData = await material.file.arrayBuffer();
        appendicesFolder.file(material.fileName, fileData);
      }
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const FileSaver = (await import('file-saver')).default;
  FileSaver.saveAs(content, `${session.name}_комплект.zip`);
}
