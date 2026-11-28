import type { jsPDF } from 'jspdf';

export interface PdfPreviewRequest {
  id: number;
  title: string;
  filename: string;
  totalPages: number;
  pdfBytes: Uint8Array;
  downloadFullPdf: () => void;
}

export interface CapturedPdfFile {
  filename: string;
  title: string;
  bytes: Uint8Array;
}

type PdfPreviewListener = (request: PdfPreviewRequest) => void;
type PdfCaptureHandler = (file: CapturedPdfFile) => void;

const listeners = new Set<PdfPreviewListener>();
let nextRequestId = 1;
let activePdfCaptureHandler: PdfCaptureHandler | null = null;

export function subscribeToPdfPreview(listener: PdfPreviewListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Temporarily captures all PDFs emitted via deliverGeneratedPdf during `fn()`
 * instead of opening the preview modal or triggering individual downloads.
 */
export function runWithPdfCapture(fn: () => void): CapturedPdfFile[] {
  const captured: CapturedPdfFile[] = [];
  const prev = activePdfCaptureHandler;
  activePdfCaptureHandler = (file) => captured.push(file);
  try {
    fn();
  } finally {
    activePdfCaptureHandler = prev;
  }
  return captured;
}

/**
 * Delivers a generated jsPDF document to the interactive 3-page preview modal
 * when mounted, falling back cleanly to direct file download if no preview modal is active.
 */
export function deliverGeneratedPdf(
  doc: jsPDF,
  filename: string,
  title: string
): void {
  const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  if (activePdfCaptureHandler) {
    const arrayBuffer = doc.output('arraybuffer');
    activePdfCaptureHandler({
      filename: safeFilename,
      title,
      bytes: new Uint8Array(arrayBuffer),
    });
    return;
  }

  if (listeners.size === 0) {
    doc.save(safeFilename);
    return;
  }

  try {
    const arrayBuffer = doc.output('arraybuffer');
    const pdfBytes = new Uint8Array(arrayBuffer);
    const totalPages = Math.max(1, doc.getNumberOfPages());

    const request: PdfPreviewRequest = {
      id: nextRequestId++,
      title,
      filename: safeFilename,
      totalPages,
      pdfBytes,
      downloadFullPdf: () => {
        doc.save(safeFilename);
      },
    };

    listeners.forEach((listener) => listener(request));
  } catch (err) {
    console.error('Failed to prepare PDF preview, falling back to direct download:', err);
    doc.save(safeFilename);
  }
}
