import * as mammoth from 'mammoth';
import { debugLogger } from './debug';

/**
 * Convert DOCX to HTML for preview purposes.
 */
export async function convertDocxToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    debugLogger.info('docxPreview', 'Converting DOCX to HTML for preview');
    
    // Mammoth converts standard styles and tables correctly out of the box
    const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
    let html = result.value;

    debugLogger.success('docxPreview', 'DOCX converted to HTML successfully');
    
    // Add default basic CSS for better display
    return wrapInHtmlDocument(html);
  } catch (error) {
    debugLogger.error('docxPreview', 'Error converting DOCX to HTML', error);
    return renderErrorHtml('Failed to convert document for preview');
  }
}

/**
 * Wrap body content in a complete HTML document
 */
function wrapInHtmlDocument(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Предпросмотр документа</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      background: #fff;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: "Times New Roman", Times, serif;
      margin: 16px 0 8px 0;
      color: #222;
      font-weight: bold;
    }
    h1 { font-size: 20px; }
    h2 { font-size: 18px; }
    h3 { font-size: 16px; }
    p { margin: 0 0 8px 0; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 12px 0;
    }
    th, td {
      border: 1px solid #999;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background-color: #f5f5f5;
      font-weight: bold;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

/**
 * Render error message as HTML
 */
function renderErrorHtml(message: string): string {
  return wrapInHtmlDocument(`
    <div style="text-align: center; padding: 40px; color: #666;">
      <p style="font-size: 16px;">⚠️ ${escapeHtml(message)}</p>
      <p style="font-size: 14px; color: #999;">Попробуйте скачать файл для просмотра</p>
    </div>
  `);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Create a Blob URL for DOCX preview as HTML.
 */
export async function createDocxPreviewUrl(arrayBuffer: ArrayBuffer): Promise<string> {
  const html = await convertDocxToHtml(arrayBuffer);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  return URL.createObjectURL(blob);
}

/**
 * Download DOCX file with given filename
 */
export function downloadDocx(arrayBuffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

