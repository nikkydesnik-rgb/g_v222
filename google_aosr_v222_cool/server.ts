import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Implementation of render-docx to handle server-side filling
  // This helps when client-side libraries might struggle or to maintain consistency
  app.post("/api/render-docx", async (req, res) => {
    try {
      const { templateBase64, data } = req.body;
      if (!templateBase64 || !data) {
        return res.status(400).json({ success: false, error: "Missing template or data" });
      }

      const PizZip = (await import('pizzip')).default;
      const Docxtemplater = (await import('docxtemplater')).default;

      const buffer = Buffer.from(templateBase64, 'base64');
      const zip = new PizZip(buffer);
      
      // Marker replacement logic
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
    nullGetter: () => "",
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

      doc.render(data);

      const out = doc.getZip().generate({
        type: "base64",
        compression: "DEFLATE",
      });

      res.json({ success: true, docxBase64: out });
    } catch (e: any) {
      console.error('Server-side docx render error:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
