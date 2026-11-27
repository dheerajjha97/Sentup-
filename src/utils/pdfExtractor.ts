import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { AdmitCardRecord } from '../types/admitCard';
import {
  parseMatricTextItems,
  parseInterOcrZones,
  InterOcrZonesInput,
  PdfTextItem,
} from './bsebParser';
import { OcrZonesPayload, runBrowserOcrZones } from './browserOcr';

// Sticky flag: avoids retrying /api/ocr-zones on every page when hosted on static platforms like Vercel
let serverOcrAvailable: boolean | null = null;

pdfjsLib.GlobalWorkerOptions.workerSrc =
  pdfWorkerUrl || `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

function cropCanvasRegion(
  sourceCanvas: HTMLCanvasElement,
  normLeft: number,
  normTop: number,
  normWidth: number,
  normHeight: number,
  effectiveWidth: number,
  effectiveHeight: number,
  format: 'image/jpeg' | 'image/png' = 'image/jpeg',
  quality = 0.88
): string {
  const sx = Math.max(0, Math.round(normLeft * effectiveWidth));
  const sy = Math.max(0, Math.round(normTop * effectiveHeight));
  const sw = Math.max(1, Math.min(sourceCanvas.width - sx, Math.round(normWidth * effectiveWidth)));
  const sh = Math.max(1, Math.min(sourceCanvas.height - sy, Math.round(normHeight * effectiveHeight)));

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sw, sh);
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return cropCanvas.toDataURL(format, quality);
}

/**
 * Extracts all AdmitCardRecords from a single PDF or Image File, invoking onPageProgress after each page.
 */
export async function extractFromUploadedFile(
  file: File,
  startingSerialNo: number,
  onPageProgress: (currentPage: number, totalPages: number, latestRecord?: AdmitCardRecord) => void,
  shouldCancel?: () => boolean
): Promise<AdmitCardRecord[]> {
  const results: AdmitCardRecord[] = [];
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);

  if (isImage) {
    onPageProgress(1, 1);
    const record = await extractFromImageFile(file, startingSerialNo);
    results.push(record);
    onPageProgress(1, 1, record);
    return results;
  }

  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
  const numPages = pdfDoc.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (shouldCancel && shouldCancel()) {
      break;
    }

    onPageProgress(pageNum, numPages);
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const rawItems: PdfTextItem[] = [];
    for (const item of textContent.items) {
      if ('str' in item && 'transform' in item) {
        rawItems.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
        });
      }
    }

    const nonEmptyItems = rawItems.filter((i) => i.str.trim().length > 0);
    const serialNo = startingSerialNo + results.length;

    // Case 1: PDF Page has embedded selectable text layer (e.g., Matric Admit Cards or text-layer Inter Admit Cards)
    if (nonEmptyItems.length > 25) {
      const record = parseMatricTextItems(rawItems, pageNum, file.name, serialNo);

      // Render page at fast thumbnail scale (0.75) to crop student Photo & Signature
      try {
        const viewport = page.getViewport({ scale: 0.75 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          if (record.examType === 'MATRIC (10th)') {
            record.photoDataUrl = cropCanvasRegion(
              canvas,
              0.684,
              0.129,
              0.142,
              0.122,
              canvas.width,
              canvas.height,
              'image/jpeg',
              0.82
            );
            record.signatureDataUrl = cropCanvasRegion(
              canvas,
              0.684,
              0.255,
              0.142,
              0.036,
              canvas.width,
              canvas.height,
              'image/jpeg',
              0.82
            );
          } else {
            record.photoDataUrl = cropCanvasRegion(
              canvas,
              0.848,
              0.123,
              0.105,
              0.09,
              canvas.width,
              canvas.height,
              'image/jpeg',
              0.82
            );
            record.signatureDataUrl = cropCanvasRegion(
              canvas,
              0.848,
              0.215,
              0.105,
              0.028,
              canvas.width,
              canvas.height,
              'image/jpeg',
              0.82
            );
          }
        }
      } catch {
        // Non-fatal if photo crop fails
      }

      results.push(record);
      onPageProgress(pageNum, numPages, record);
      continue;
    }

    // Case 2: Image-based / Rasterized PDF Page (e.g., Intermediate Admit Cards printed as image pages)
    const baseViewport = page.getViewport({ scale: 1 });
    let effectiveHeightRatio = 1.0;

    try {
      const ops = await page.getOperatorList();
      for (let idx = 0; idx < ops.fnArray.length; idx++) {
        if (ops.fnArray[idx] === pdfjsLib.OPS.transform) {
          const args = ops.argsArray[idx];
          if (Array.isArray(args) && args.length >= 6) {
            const imgH = Number(args[3]);
            const imgW = Number(args[0]);
            if (imgW > baseViewport.width * 0.8 && imgH > 200 && imgH <= baseViewport.height) {
              effectiveHeightRatio = imgH / baseViewport.height;
              break;
            }
          }
        }
      }
    } catch {
      effectiveHeightRatio = 1.0;
    }

    const renderScale = 3.2;
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');

    if (ctx) {
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const effW = canvas.width;
      const effH = Math.round(canvas.height * effectiveHeightRatio);

      const record = await extractFromRenderedCanvas(
        canvas,
        effW,
        effH,
        pageNum,
        file.name,
        serialNo
      );
      results.push(record);
      onPageProgress(pageNum, numPages, record);
    }
  }

  return results;
}

async function extractFromImageFile(file: File, serialNo: number): Promise<AdmitCardRecord> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(bitmap, 0, 0);
  }
  return extractFromRenderedCanvas(canvas, canvas.width, canvas.height, 1, file.name, serialNo);
}

async function extractFromRenderedCanvas(
  canvas: HTMLCanvasElement,
  effW: number,
  effH: number,
  pageNum: number,
  fileName: string,
  serialNo: number
): Promise<AdmitCardRecord> {
  // Crop the 8 normalized zones relative to (effW, effH) matching the 2640 x 3152 layout
  const topFieldsImg = cropCanvasRegion(canvas, 0.2007, 0.111, 0.636, 0.225, effW, effH, 'image/png');
  const facultyImg = cropCanvasRegion(canvas, 0.775, 0.022, 0.2, 0.045, effW, effH, 'image/png');

  // Subject rows (y = 1368/3152 = 0.4340, 1460/3152 = 0.4632, 1552/3152 = 0.4924; height = 62/3152 = 0.0197)
  const comp1Img = cropCanvasRegion(canvas, 0.142, 0.434, 0.2235, 0.0197, effW, effH, 'image/png');
  const comp2Img = cropCanvasRegion(canvas, 0.142, 0.4632, 0.2235, 0.0197, effW, effH, 'image/png');
  const elec1Img = cropCanvasRegion(canvas, 0.4905, 0.434, 0.2595, 0.0197, effW, effH, 'image/png');
  const elec2Img = cropCanvasRegion(canvas, 0.4905, 0.4632, 0.2595, 0.0197, effW, effH, 'image/png');
  const elec3Img = cropCanvasRegion(canvas, 0.4905, 0.4924, 0.2595, 0.0197, effW, effH, 'image/png');
  const addl2Img = cropCanvasRegion(canvas, 0.7595, 0.4632, 0.2065, 0.0197, effW, effH, 'image/png');

  // Crop student Photo and Signature from exact Intermediate box positions
  const photoDataUrl = cropCanvasRegion(
    canvas,
    0.848,
    0.123,
    0.105,
    0.132,
    effW,
    effH,
    'image/jpeg',
    0.85
  );
  const signatureDataUrl = cropCanvasRegion(
    canvas,
    0.848,
    0.26,
    0.105,
    0.036,
    effW,
    effH,
    'image/jpeg',
    0.85
  );

  const payload: OcrZonesPayload = {
    topFieldsImg,
    facultyImg,
    comp1Img,
    comp2Img,
    elec1Img,
    elec2Img,
    elec3Img,
    addl2Img,
  };

  let zones: InterOcrZonesInput | null = null;
  const isBrowserOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

  if (isBrowserOnline && serverOcrAvailable !== false) {
    try {
      const response = await fetch('/api/ocr-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const data = (await response.json()) as Partial<InterOcrZonesInput>;
        if (typeof data?.topFieldsText === 'string') {
          serverOcrAvailable = true;
          zones = data as InterOcrZonesInput;
        } else {
          serverOcrAvailable = false;
        }
      } else {
        // Static hosts like Vercel return 404/405 or HTML rewrite for /api/ocr-zones
        serverOcrAvailable = false;
      }
    } catch {
      // Network error or backend unreachable — seamlessly switch to client-side Tesseract OCR
      serverOcrAvailable = false;
    }
  }

  if (!zones) {
    zones = await runBrowserOcrZones(payload);
  }

  const record = parseInterOcrZones(zones, pageNum, fileName, serialNo, 'HYBRID_OCR');
  record.photoDataUrl = photoDataUrl;
  record.signatureDataUrl = signatureDataUrl;
  return record;
}
