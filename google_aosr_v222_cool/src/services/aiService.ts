import { GoogleGenAI, Type } from "@google/genai";
import type { SavedOrganization } from '@/types';

const apiKey = 
  (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') || 
  // @ts-ignore
  (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_GEMINI_API_KEY : '') || 
  'AIzaSyCFD0efdBJ0PnRplTe3bjW0ypvi6WBnQsw';

const ai = new GoogleGenAI({ apiKey });

export interface PARSED_DATA {
  permanentData: Record<string, string>;
  acts: Array<{
    act_number: string;
    work_name: string;
    date_start?: string;
    date_end?: string;
    date_act?: string;
    next_work?: string;
  }>;
}

export interface AIFile {
  data: string;
  mimeType: string;
}

export async function parseDocumentText(text: string, files: AIFile[] = [], knownOrganizations: SavedOrganization[] = []): Promise<PARSED_DATA> {
  const parts: any[] = [];
  
  const instructionPrompt = `You are an expert construction document analyzer.
Your task is to extract project data and acts from the provided text and document scans (PDF/images), and return it in JSON format.

The data should be placed into the 'permanentData' object. Always try to fill these exact keys based on the user's instructions and the document:
- Должн_предст_Застройщика, ФИО_Застройщика, Расп_Застройщик
- Должн_предст_Строителя, ФИО_Строителя, Расп_Строитель
- Должн_предст_Стр_Стройконтроль, ФИО_Стр_Стройконтроль, Расп_Стр_Стройконтроль
- Должн_предст_Проектировщ, ФИО_предст_Проект, Расп_предст_Проект
- Должность_субподр, ФИО_Субподр
- Организация_застройщик, Информация_по_застройщику
- Организация_строитель, Информация_по_строителю
- Организация_проектировщик, Информация_по_проектировщику
- Организация_выполнившая_работы
- Наименование_объекта

CRITICAL EXTRACTION AND FORMATTING RULES:
1. The user will often provide names (e.g., "Застройщик - Шмагина"). Look at the attached documents to find their EXACT job titles, document name/number/date, and organization name.
2. JOB TITLES (Должность): MUST always start with a Capital letter. (e.g., "Заместитель начальника отдела", NOT "заместитель").
3. FULL NAMES (ФИО): MUST always be formatted as Lastname Initials (e.g., "Козлов Д.Е.", "Шмагина А.Н."). Do not output full first/middle names.
4. AUTHORITY DOCUMENTS (Распоряжение/Приказ/Доверенность): MUST always start with a lowercase letter (e.g., "распоряжение № 80/1-р от 26.07.2024").
5. COMPANY INFO (Информация_по_...): DO NOT guess or fill "Информация_по_застройщику", "Информация_по_строителю" and "Информация_по_проектировщику" unless the full organization details (INN, Address, OGRN) are explicitly present in the scan, OR they match one of the KNOWN ORGANIZATIONS below.
6. If an organization name from the document matches a KNOWN ORGANIZATION, you MUST use the provided 'info' string from the database for its 'Информация_по_...' key!
7. If there is a list of works or acts in the documents, fill them in the 'acts' array.

KNOWN ORGANIZATIONS (Database):
${knownOrganizations.length > 0 ? JSON.stringify(knownOrganizations.map(o => ({name: o.name, info: o.info})), null, 2) : 'No known organizations.'}

User Instructions / Text:
${text || 'No explicit user instructions provided. Please extract all possible organization/representative data automatically based on the document.'}`;

  parts.push({ text: instructionPrompt });
  
  for (const file of files) {
    parts.push({
      inlineData: {
        data: file.data,
        mimeType: file.mimeType
      }
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: parts,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            permanentData: {
              type: Type.OBJECT,
              description: "Extracted organization and representative details",
              properties: {
                Должн_предст_Застройщика: { type: Type.STRING },
                ФИО_Застройщика: { type: Type.STRING },
                Расп_Застройщик: { type: Type.STRING },
                Должн_предст_Строителя: { type: Type.STRING },
                ФИО_Строителя: { type: Type.STRING },
                Расп_Строитель: { type: Type.STRING },
                Должн_предст_Стр_Стройконтроль: { type: Type.STRING },
                ФИО_Стр_Стройконтроль: { type: Type.STRING },
                Расп_Стр_Стройконтроль: { type: Type.STRING },
                Должн_предст_Проектировщ: { type: Type.STRING },
                ФИО_предст_Проект: { type: Type.STRING },
                Расп_предст_Проект: { type: Type.STRING },
                Должность_субподр: { type: Type.STRING },
                ФИО_Субподр: { type: Type.STRING },
                Организация_застройщик: { type: Type.STRING },
                Информация_по_застройщику: { type: Type.STRING },
                Организация_строитель: { type: Type.STRING },
                Информация_по_строителю: { type: Type.STRING },
                Организация_проектировщик: { type: Type.STRING },
                Информация_по_проектировщику: { type: Type.STRING },
                Организация_выполнившая_работы: { type: Type.STRING },
                Наименование_объекта: { type: Type.STRING },
              }
            },
            acts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  act_number: { type: Type.STRING },
                  work_name: { type: Type.STRING },
                  date_start: { type: Type.STRING, description: "Format: DD.MM.YYYY or YYYY-MM-DD" },
                  date_end: { type: Type.STRING, description: "Format: DD.MM.YYYY or YYYY-MM-DD" },
                  date_act: { type: Type.STRING, description: "Format: DD.MM.YYYY or YYYY-MM-DD" },
                  next_work: { type: Type.STRING },
                },
                required: ["work_name"]
              }
            }
          },
          required: ["permanentData", "acts"]
        }
      }
    });

    const rawJson = response.text || "{}";
    try {
      return JSON.parse(rawJson);
    } catch (e) {
      console.error("Failed to parse AI response:", rawJson);
      // Fallback for markdown-wrapped json
      const match = rawJson.match(/```(?:json)?\n([\s\S]*?)\n```/);
      if (match) {
        return JSON.parse(match[1]);
      }
      throw new Error("AI returned invalid JSON: " + rawJson);
    }
  } catch (error) {
    console.error("AI API Error:", error);
    throw error;
  }
}

