import React, { useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'login' | 'drawer';
  onAction?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  onAction,
}) => {
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled || (!isInstallable && !isIOS)) return null;

  const handleClick = () => {
    if (isIOS) {
      setShowIOSGuide(true);
    } else {
      promptInstall();
      onAction?.();
    }
  };

  return (
    <>
      {variant === 'drawer' ? (
        <button
          type="button"
          onClick={handleClick}
          className="flex w-full items-center gap-3 rounded-full bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition-colors cursor-pointer"
        >
          <Smartphone className="h-4 w-4 text-blue-600 shrink-0" />
          <span>Install App (PWA)</span>
        </button>
      ) : variant === 'login' ? (
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-2 text-xs font-semibold text-[#1D4ED8] hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span>Install BSEB Portal App</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          title="Install BSEB Portal on your device"
          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5 text-blue-600 shrink-0" />
          <span className="hidden sm:inline">Install App</span>
        </button>
      )}

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          onClick={() => setShowIOSGuide(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-guide-title"
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="ios-install-guide-title" className="text-sm font-bold text-slate-900">
                    Install BSEB Portal on iPhone / iPad
                  </h3>
                  <p className="text-[11px] text-slate-500">Safari Add to Home Screen</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                aria-label="Close install instructions"
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ol className="space-y-3 text-xs text-slate-700">
              <li className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white shrink-0">
                  1
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  Tap the <Share className="inline h-4 w-4 text-blue-600" />{' '}
                  <strong>Share</strong> button in Safari&apos;s toolbar.
                </span>
              </li>
              <li className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white shrink-0">
                  2
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  Scroll down and tap <PlusSquare className="inline h-4 w-4 text-blue-600" />{' '}
                  <strong>Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white shrink-0">
                  3
                </span>
                <span>
                  Tap <strong>Add</strong> in the top-right corner to launch as a standalone app.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => {
                setShowIOSGuide(false);
                onAction?.();
              }}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
