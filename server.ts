import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createWorker, PSM, Worker } from 'tesseract.js';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// Pre-warmed Tesseract worker pool for fast, zero-key-required OCR
let blockWorker: Worker | null = null;
let lineWorker1: Worker | null = null;
let lineWorker2: Worker | null = null;
let workersInitializing: Promise<void> | null = null;

async function ensureOcrWorkers(): Promise<{
  block: Worker;
  line1: Worker;
  line2: Worker;
}> {
  if (blockWorker && lineWorker1 && lineWorker2) {
    return { block: blockWorker, line1: lineWorker1, line2: lineWorker2 };
  }
  if (!workersInitializing) {
    workersInitializing = (async () => {
      const [bw, lw1, lw2] = await Promise.all([
        createWorker('eng'),
        createWorker('eng'),
        createWorker('eng'),
      ]);
      await bw.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      await lw1.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
      await lw2.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
      blockWorker = bw;
      lineWorker1 = lw1;
      lineWorker2 = lw2;
    })();
  }
  await workersInitializing;
  return {
    block: blockWorker!,
    line1: lineWorker1!,
    line2: lineWorker2!,
  };
}

// Kick off background worker initialization on startup
ensureOcrWorkers().catch((err) => {
  console.error('Tesseract worker warmup warning:', err);
});

function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  return Buffer.from(base64, 'base64');
}

// Fast multi-zone OCR endpoint for image-based Admit Cards
app.post('/api/ocr-zones', async (req, res) => {
  try {
    const {
      topFieldsImg,
      facultyImg,
      comp1Img,
      comp2Img,
      elec1Img,
      elec2Img,
      elec3Img,
      addl2Img,
    } = req.body as Record<string, string | undefined>;

    if (!topFieldsImg) {
      res.status(400).json({ error: 'Missing topFieldsImg in request body' });
      return;
    }

    const { block, line1, line2 } = await ensureOcrWorkers();

    // Run block worker on topFieldsImg (+ facultyImg sequentially on block),
    // while line1 and line2 process the 6 subject strips in parallel!
    const blockTask = (async () => {
      const topRes = await block.recognize(dataUrlToBuffer(topFieldsImg));
      let facText = '';
      if (facultyImg) {
        const facRes = await block.recognize(dataUrlToBuffer(facultyImg));
        facText = facRes.data.text;
      }
      return { topFieldsText: topRes.data.text, facultyText: facText };
    })();

    const line1Task = (async () => {
      const c1 = comp1Img ? (await line1.recognize(dataUrlToBuffer(comp1Img))).data.text : '';
      const c2 = comp2Img ? (await line1.recognize(dataUrlToBuffer(comp2Img))).data.text : '';
      const e1 = elec1Img ? (await line1.recognize(dataUrlToBuffer(elec1Img))).data.text : '';
      return { comp1Text: c1, comp2Text: c2, elec1Text: e1 };
    })();

    const line2Task = (async () => {
      const e2 = elec2Img ? (await line2.recognize(dataUrlToBuffer(elec2Img))).data.text : '';
      const e3 = elec3Img ? (await line2.recognize(dataUrlToBuffer(elec3Img))).data.text : '';
      const a2 = addl2Img ? (await line2.recognize(dataUrlToBuffer(addl2Img))).data.text : '';
      return { elec2Text: e2, elec3Text: e3, addl2Text: a2 };
    })();

    const [blockOut, line1Out, line2Out] = await Promise.all([blockTask, line1Task, line2Task]);

    res.json({
      topFieldsText: blockOut.topFieldsText,
      facultyText: blockOut.facultyText,
      comp1Text: line1Out.comp1Text,
      comp2Text: line1Out.comp2Text,
      elec1Text: line1Out.elec1Text,
      elec2Text: line2Out.elec2Text,
      elec3Text: line2Out.elec3Text,
      addl2Text: line2Out.addl2Text,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'OCR processing failed';
    console.error('Error in /api/ocr-zones:', message);
    res.status(500).json({ error: message });
  }
});

// Optional Server-Side Gemini Vision extraction route when GEMINI_API_KEY is available
app.post('/api/gemini-extract', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error: 'GEMINI_API_KEY not configured on server; use local hybrid OCR.',
      });
      return;
    }

    const { imageBase64, mimeType = 'image/jpeg' } = req.body as {
      imageBase64?: string;
      mimeType?: string;
    };

    if (!imageBase64) {
      res.status(400).json({ error: 'Missing imageBase64 parameter' });
      return;
    }

    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: 'Extract all student and subject details from this Bihar School Examination Board (BSEB) Admit Card into JSON.',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            examType: { type: Type.STRING, description: 'MATRIC (10th) or INTERMEDIATE (+2)' },
            faculty: { type: Type.STRING, description: 'SECONDARY, ARTS, SCIENCE, or COMMERCE' },
            bsebUniqueId: { type: Type.STRING },
            schoolCode: { type: Type.STRING },
            schoolName: { type: Type.STRING },
            studentName: { type: Type.STRING },
            motherName: { type: Type.STRING },
            fatherName: { type: Type.STRING },
            dob: { type: Type.STRING },
            gender: { type: Type.STRING },
            maritalStatus: { type: Type.STRING },
            aadhaarNo: { type: Type.STRING },
            studentCategory: { type: Type.STRING },
            casteCategory: { type: Type.STRING },
            differentlyAbled: { type: Type.STRING },
            registrationNo: { type: Type.STRING },
            rollCode: { type: Type.STRING },
            rollNumber: { type: Type.STRING },
            examCenter: { type: Type.STRING },
            langSubject1: { type: Type.STRING },
            langSubject2: { type: Type.STRING },
            compulsorySubject1: { type: Type.STRING },
            compulsorySubject2: { type: Type.STRING },
            compulsorySubject3: { type: Type.STRING },
            compulsorySubject4: { type: Type.STRING },
            additionalSubject: { type: Type.STRING },
          },
        },
      },
    });

    const jsonText = (response.text ?? '{}').trim();
    res.json(JSON.parse(jsonText));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gemini extraction failed';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

startServer();
