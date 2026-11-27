import type { Worker } from 'tesseract.js';
import type { InterOcrZonesInput } from './bsebParser';

export interface OcrZonesPayload {
  topFieldsImg: string;
  facultyImg?: string;
  comp1Img?: string;
  comp2Img?: string;
  elec1Img?: string;
  elec2Img?: string;
  elec3Img?: string;
  addl2Img?: string;
}

let blockWorker: Worker | null = null;
let lineWorker: Worker | null = null;
let workersInitializing: Promise<void> | null = null;

async function ensureBrowserOcrWorkers(): Promise<{
  block: Worker;
  line: Worker;
}> {
  if (blockWorker && lineWorker) {
    return { block: blockWorker, line: lineWorker };
  }

  if (!workersInitializing) {
    workersInitializing = (async () => {
      try {
        const mod = await import('tesseract.js');
        const tesseract = (mod.default ?? mod) as typeof import('tesseract.js');
        const { createWorker, PSM } = tesseract;

        const [bw, lw] = await Promise.all([
          createWorker('eng', 1),
          createWorker('eng', 1),
        ]);

        await Promise.all([
          bw.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK }),
          lw.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE }),
        ]);

        blockWorker = bw;
        lineWorker = lw;
      } catch (err) {
        workersInitializing = null;
        throw err;
      }
    })();
  }

  await workersInitializing;
  return {
    block: blockWorker!,
    line: lineWorker!,
  };
}

/**
 * Client-side 8-zone Tesseract.js OCR matching server.ts /api/ocr-zones behavior.
 * Works on static hosts (Vercel, Netlify, Cloudflare Pages) and offline PWA after initial model cache.
 */
export async function runBrowserOcrZones(
  payload: OcrZonesPayload
): Promise<InterOcrZonesInput> {
  const { block, line } = await ensureBrowserOcrWorkers();

  const blockTask = (async () => {
    const topRes = await block.recognize(payload.topFieldsImg);
    let facultyText = '';
    if (payload.facultyImg) {
      const facRes = await block.recognize(payload.facultyImg);
      facultyText = facRes.data.text;
    }
    return {
      topFieldsText: topRes.data.text,
      facultyText,
    };
  })();

  const lineTask = (async () => {
    const comp1Text = payload.comp1Img ? (await line.recognize(payload.comp1Img)).data.text : '';
    const comp2Text = payload.comp2Img ? (await line.recognize(payload.comp2Img)).data.text : '';
    const elec1Text = payload.elec1Img ? (await line.recognize(payload.elec1Img)).data.text : '';
    const elec2Text = payload.elec2Img ? (await line.recognize(payload.elec2Img)).data.text : '';
    const elec3Text = payload.elec3Img ? (await line.recognize(payload.elec3Img)).data.text : '';
    const addl2Text = payload.addl2Img ? (await line.recognize(payload.addl2Img)).data.text : '';
    return {
      comp1Text,
      comp2Text,
      elec1Text,
      elec2Text,
      elec3Text,
      addl2Text,
    };
  })();

  const [blockOut, lineOut] = await Promise.all([blockTask, lineTask]);

  return {
    topFieldsText: blockOut.topFieldsText,
    facultyText: blockOut.facultyText,
    comp1Text: lineOut.comp1Text,
    comp2Text: lineOut.comp2Text,
    elec1Text: lineOut.elec1Text,
    elec2Text: lineOut.elec2Text,
    elec3Text: lineOut.elec3Text,
    addl2Text: lineOut.addl2Text,
  };
}
