import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileText,
  Layers,
  AlertCircle,
  Check,
} from 'lucide-react';
import { PdfPreviewRequest, subscribeToPdfPreview } from '../utils/pdfPreviewBus';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  pdfWorkerUrl || `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const MAX_PREVIEW_PAGES = 3;
const ZOOM_STEPS = [75, 100, 125, 150];

interface RenderedSamplePage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export const PdfPreviewModal: React.FC = () => {
  const [request, setRequest] = useState<PdfPreviewRequest | null>(null);
  const [pages, setPages] = useState<RenderedSamplePage[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [downloaded, setDownloaded] = useState(false);

  // Subscribe to all generated PDF reports across the app
  useEffect(() => {
    return subscribeToPdfPreview((nextReq) => {
      setRequest(nextReq);
      setPages([]);
      setRenderError('');
      setActivePageIndex(0);
      setViewMode('single');
      setZoomPercent(100);
      setDownloaded(false);
    });
  }, []);

  // Render the first 3 pages of the generated PDF onto crisp canvases via pdfjs-dist
  useEffect(() => {
    if (!request) return;

    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    const renderSamplePages = async () => {
      setIsRendering(true);
      setRenderError('');

      try {
        // Pass a fresh copy of Uint8Array since pdf.js transfers/detaches the buffer to its worker
        loadingTask = pdfjsLib.getDocument({ data: request.pdfBytes.slice() });
        const pdfDoc = await loadingTask.promise;

        const pagesToRender = Math.min(MAX_PREVIEW_PAGES, pdfDoc.numPages);
        const rendered: RenderedSamplePage[] = [];

        for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(pageNum);
          // Render at crisp 2.0 scale so dense 30-column BSEB tables stay razor-sharp even when zoomed
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d');

          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport, canvas }).promise;
            rendered.push({
              pageNumber: pageNum,
              dataUrl: canvas.toDataURL('image/png'),
              width: viewport.width,
              height: viewport.height,
            });
          }
        }

        if (!cancelled) {
          setPages(rendered);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('PDF preview render failed:', err);
          setRenderError(
            'Preview rendering encountered an error, but the full PDF is ready to download.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    };

    renderSamplePages();

    return () => {
      cancelled = true;
      if (loadingTask) {
        loadingTask.destroy().catch(() => {
          // ignore cleanup errors
        });
      }
    };
  }, [request]);

  const handleClose = useCallback(() => {
    setRequest(null);
  }, []);

  const handleDownloadFull = useCallback(() => {
    if (!request) return;
    request.downloadFullPdf();
    setDownloaded(true);
    window.setTimeout(() => {
      setRequest(null);
    }, 350);
  }, [request]);

  // Keyboard shortcuts: Escape to close, Left/Right arrows to switch pages
  useEffect(() => {
    if (!request) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (viewMode === 'single' && pages.length > 1) {
        if (e.key === 'ArrowRight') {
          setActivePageIndex((i) => Math.min(pages.length - 1, i + 1));
        } else if (e.key === 'ArrowLeft') {
          setActivePageIndex((i) => Math.max(0, i - 1));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request, viewMode, pages.length, handleClose]);

  const samplePageCount = request ? Math.min(MAX_PREVIEW_PAGES, request.totalPages) : 0;
  const remainingPages = request ? Math.max(0, request.totalPages - MAX_PREVIEW_PAGES) : 0;
  const currentZoomIndex = ZOOM_STEPS.indexOf(zoomPercent);

  const handleZoomIn = () => {
    if (currentZoomIndex < ZOOM_STEPS.length - 1) {
      setZoomPercent(ZOOM_STEPS[currentZoomIndex + 1]);
    }
  };

  const handleZoomOut = () => {
    if (currentZoomIndex > 0) {
      setZoomPercent(ZOOM_STEPS[currentZoomIndex - 1]);
    }
  };

  return (
    <AnimatePresence>
      {request && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pdf-preview-modal-title"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={handleClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />

          {/* Modal Surface */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2
                  id="pdf-preview-modal-title"
                  className="text-base sm:text-lg font-bold tracking-tight text-slate-900 truncate"
                >
                  {request.title}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  <span className="font-mono text-slate-700 truncate max-w-[260px] sm:max-w-[420px]">
                    {request.filename}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {request.totalPages} {request.totalPages === 1 ? 'page' : 'pages'} total
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-indigo-700">
                    {request.totalPages > MAX_PREVIEW_PAGES
                      ? `Sample preview: first ${MAX_PREVIEW_PAGES} pages`
                      : `Previewing all ${request.totalPages} ${request.totalPages === 1 ? 'page' : 'pages'}`}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                aria-label="Close PDF preview"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 transition-colors shrink-0 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Preview Controls Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-2.5 sm:px-6">
              {/* Left: Page Selector & View Toggle */}
              <div className="flex flex-wrap items-center gap-2">
                {samplePageCount > 1 && (
                  <div
                    role="group"
                    aria-label="Preview view mode"
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => setViewMode('single')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        viewMode === 'single'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Single Page</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('all')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        viewMode === 'all'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>All {samplePageCount} Pages</span>
                    </button>
                  </div>
                )}

                {viewMode === 'single' && samplePageCount > 1 && (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setActivePageIndex((i) => Math.max(0, i - 1))}
                      disabled={activePageIndex === 0 || isRendering}
                      aria-label="Previous preview page"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
                      {Array.from({ length: samplePageCount }, (_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActivePageIndex(idx)}
                          disabled={isRendering}
                          className={`rounded-md px-2.5 py-1 font-mono text-xs font-semibold tabular-nums transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            activePageIndex === idx
                              ? 'bg-indigo-50 text-indigo-800'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          Page {idx + 1}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setActivePageIndex((i) => Math.min(samplePageCount - 1, i + 1))
                      }
                      disabled={activePageIndex >= samplePageCount - 1 || isRendering}
                      aria-label="Next preview page"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Right: Zoom Controls */}
              <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={currentZoomIndex <= 0 || isRendering}
                  aria-label="Zoom out"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-35 transition-colors cursor-pointer"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="min-w-[48px] text-center font-mono text-xs font-semibold tabular-nums text-slate-700">
                  {zoomPercent}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={currentZoomIndex >= ZOOM_STEPS.length - 1 || isRendering}
                  aria-label="Zoom in"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-35 transition-colors cursor-pointer"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                {zoomPercent !== 100 && (
                  <button
                    type="button"
                    onClick={() => setZoomPercent(100)}
                    aria-label="Reset zoom to 100%"
                    className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Fit</span>
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Preview Canvas */}
            <div className="flex-1 overflow-auto bg-slate-100/90 p-4 sm:p-6">
              {isRendering ? (
                <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 py-8">
                  <div className="aspect-[1.414/1] w-full animate-pulse rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
                    <div className="mx-auto h-4 w-1/3 rounded bg-slate-200" />
                    <div className="mx-auto mt-3 h-3 w-2/3 rounded bg-slate-100" />
                    <div className="mt-6 space-y-2.5">
                      <div className="h-8 w-full rounded bg-slate-100" />
                      <div className="h-6 w-full rounded bg-slate-50" />
                      <div className="h-6 w-full rounded bg-slate-100" />
                      <div className="h-6 w-full rounded bg-slate-50" />
                      <div className="h-6 w-full rounded bg-slate-100" />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-slate-600">
                    Rendering sample pages (1–{samplePageCount})...
                  </p>
                </div>
              ) : renderError ? (
                <div className="mx-auto my-12 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                  <AlertCircle className="mx-auto h-8 w-8 text-amber-600" />
                  <p className="mt-3 text-sm font-semibold text-amber-950">{renderError}</p>
                  <p className="mt-1 text-xs text-amber-800">
                    Use the Download Full PDF button below to save {request.filename}.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-6">
                  {(viewMode === 'all' ? pages : pages.slice(activePageIndex, activePageIndex + 1)).map(
                    (page) => (
                      <figure
                        key={page.pageNumber}
                        className="flex flex-col items-center"
                        style={{
                          width: `${zoomPercent}%`,
                          maxWidth: zoomPercent === 100 ? '100%' : 'none',
                        }}
                      >
                        <div className="w-full overflow-hidden rounded-lg border border-slate-300/90 bg-white shadow-md">
                          <img
                            src={page.dataUrl}
                            alt={`${request.title} — Page ${page.pageNumber} of ${request.totalPages}`}
                            className="block h-auto w-full select-none"
                          />
                        </div>
                        <figcaption className="mt-2 font-mono text-xs tabular-nums text-slate-500">
                          Page {page.pageNumber} of {request.totalPages}
                        </figcaption>
                      </figure>
                    )
                  )}

                  {remainingPages > 0 &&
                    (viewMode === 'all' || activePageIndex === pages.length - 1) && (
                      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
                        <p className="text-xs font-semibold text-slate-800">
                          End of {MAX_PREVIEW_PAGES}-page sample preview
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {remainingPages} additional {remainingPages === 1 ? 'page' : 'pages'}{' '}
                          (Pages {MAX_PREVIEW_PAGES + 1}–{request.totalPages}) will be included when
                          you download the full PDF report.
                        </p>
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Footer Action Bar */}
            <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="text-xs text-slate-600">
                Ready to save complete report{' '}
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  ({request.totalPages} {request.totalPages === 1 ? 'page' : 'pages'})
                </span>
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDownloadFull}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {downloaded ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Downloading PDF...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>Download Full PDF</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
