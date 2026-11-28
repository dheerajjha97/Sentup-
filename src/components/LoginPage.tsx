import React from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck,
  BookOpen,
  Printer,
  GraduationCap,
  ArrowRight,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

export type PortalRole = 'ADMIN' | 'TEACHER' | 'CLERK';

interface LoginPageProps {
  loadingRole: PortalRole | null;
  errorMessage: string;
  onClearError: () => void;
  onLogin: (role: PortalRole) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  loadingRole,
  errorMessage,
  onClearError,
  onLogin,
}) => {
  const isBusy = loadingRole !== null;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-[#0B3B91] via-[#3B82F6]/35 to-[#FFFFFF] flex flex-col items-center justify-center px-4 py-10 sm:px-6">
      {/* Animated Blue-to-White Ambient Backdrop Layers (GPU transform/opacity only) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Smooth upper sky-blue atmospheric glow */}
        <motion.div
          initial={{ opacity: 0.45, scale: 1, x: -30, y: -20 }}
          animate={{
            opacity: [0.45, 0.7, 0.45],
            scale: [1, 1.08, 1],
            x: [-30, 20, -30],
            y: [-20, 14, -20],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-[#1D4ED8]/45 blur-3xl will-change-transform"
        />

        {/* Soft azure drift on right */}
        <motion.div
          initial={{ opacity: 0.4, scale: 1, x: 24, y: 10 }}
          animate={{
            opacity: [0.4, 0.65, 0.4],
            scale: [1, 1.12, 1],
            x: [24, -26, 24],
            y: [10, -20, 10],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-12 -right-28 h-[460px] w-[460px] rounded-full bg-[#60A5FA]/40 blur-3xl will-change-transform"
        />

        {/* Crisp luminous white lower-half lift for clean blue-to-white gradient transition */}
        <motion.div
          initial={{ opacity: 0.75, y: 12 }}
          animate={{ opacity: [0.75, 0.92, 0.75], y: [12, -10, 12] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-36 left-1/2 -translate-x-1/2 h-[380px] w-[120%] rounded-[100%] bg-white/90 blur-3xl will-change-transform"
        />

        {/* Subtle geometric wave accent */}
        <svg
          className="absolute bottom-0 left-0 right-0 w-full h-40 sm:h-52 text-white/80"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
        >
          <path
            fill="currentColor"
            d="M0,192L80,186.7C160,181,320,171,480,186.7C640,203,800,245,960,245.3C1120,245,1280,203,1360,181.3L1440,160L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z"
          />
        </svg>
      </div>

      {/* Centered Login Portal Card */}
      <motion.main
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[740px]"
      >
        <div className="rounded-3xl border border-white/85 bg-white/90 backdrop-blur-xl shadow-2xl shadow-blue-950/15 p-6 sm:p-9">
          {/* Emblem & Title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F3D91] to-[#2563EB] text-white shadow-lg shadow-blue-600/25">
              <GraduationCap className="h-7 w-7" />
            </div>

            <h1
              className="mt-5 text-2xl sm:text-[28px] font-bold tracking-tight text-slate-900"
              style={{ textWrap: 'balance' }}
            >
              BSEB School &amp; Marks Portal
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-lg mx-auto">
              Select your workspace to continue. Admin, Teacher, and Read-Only Clerk Print Desk open in separate role portals.
            </p>
          </motion.div>

          {/* Error Notice */}
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={onClearError}
                aria-label="Dismiss login error"
                className="rounded-lg p-1 text-red-600 hover:bg-red-100 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}

          {/* Centered Three Separate Login Buttons: Admin, Teacher & Clerk */}
          <div className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Admin Login Button */}
            <motion.button
              type="button"
              disabled={isBusy}
              onClick={() => onLogin('ADMIN')}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              whileHover={isBusy ? undefined : { y: -3 }}
              whileTap={isBusy ? undefined : { scale: 0.98 }}
              className="group relative flex flex-col items-center justify-between text-center rounded-2xl bg-gradient-to-b from-[#1E40AF] to-[#1D4ED8] px-4 py-5 text-white shadow-lg shadow-blue-700/25 hover:from-[#1E3A8A] hover:to-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60 transition-colors cursor-pointer min-h-[172px]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25">
                {loadingRole === 'ADMIN' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
              </div>

              <div className="mt-3">
                <div className="text-[15px] font-bold tracking-tight whitespace-nowrap">
                  Admin Login
                </div>
                <p className="mt-1 text-xs text-blue-100/95 leading-snug">
                  Admit Cards, Marks Panji &amp; Staff Setup
                </p>
              </div>

              <div className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white/95">
                <span>{loadingRole === 'ADMIN' ? 'Signing in...' : 'Continue'}</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
              </div>
            </motion.button>

            {/* Teacher Login Button */}
            <motion.button
              type="button"
              disabled={isBusy}
              onClick={() => onLogin('TEACHER')}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
              whileHover={isBusy ? undefined : { y: -3 }}
              whileTap={isBusy ? undefined : { scale: 0.98 }}
              className="group relative flex flex-col items-center justify-between text-center rounded-2xl border border-blue-200 bg-white px-4 py-5 text-slate-900 shadow-md shadow-blue-900/5 hover:border-blue-400 hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60 transition-colors cursor-pointer min-h-[172px]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#1D4ED8] ring-1 ring-blue-200">
                {loadingRole === 'TEACHER' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <BookOpen className="h-5 w-5" />
                )}
              </div>

              <div className="mt-3">
                <div className="text-[15px] font-bold tracking-tight text-slate-900 whitespace-nowrap">
                  Teacher Login
                </div>
                <p className="mt-1 text-xs text-slate-600 leading-snug">
                  Subject-wise Marks Entry for Assigned Schools
                </p>
              </div>

              <div className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1D4ED8]">
                <span>{loadingRole === 'TEACHER' ? 'Signing in...' : 'Continue'}</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
              </div>
            </motion.button>

            {/* Clerk Login Button (Read-Only Print Desk) */}
            <motion.button
              type="button"
              disabled={isBusy}
              onClick={() => onLogin('CLERK')}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
              whileHover={isBusy ? undefined : { y: -3 }}
              whileTap={isBusy ? undefined : { scale: 0.98 }}
              className="group relative flex flex-col items-center justify-between text-center rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-5 text-slate-900 shadow-md shadow-slate-900/5 hover:border-sky-400 hover:bg-sky-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-60 transition-colors cursor-pointer min-h-[172px]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100/80 text-sky-700 ring-1 ring-sky-200">
                {loadingRole === 'CLERK' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Printer className="h-5 w-5" />
                )}
              </div>

              <div className="mt-3">
                <div className="text-[15px] font-bold tracking-tight text-slate-900 whitespace-nowrap">
                  Clerk Login
                </div>
                <p className="mt-1 text-xs text-slate-600 leading-snug">
                  Read-Only Print Desk for Attendance &amp; Reports
                </p>
              </div>

              <div className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700">
                <span>{loadingRole === 'CLERK' ? 'Signing in...' : 'Continue'}</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
              </div>
            </motion.button>
          </div>

          {/* Optional PWA Install CTA & Quiet Unboxed Footer Metadata */}
          <div className="mt-7 pt-5 border-t border-slate-200/80 flex flex-col items-center gap-3">
            <PWAInstallButton variant="login" />
            <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
              <span>Intermediate (+2) &amp; Matric (10th)</span>
              <span aria-hidden="true">·</span>
              <span>Separate Role Workspaces</span>
              <span aria-hidden="true">·</span>
              <span>Cloud Synced</span>
            </div>
          </div>
        </div>
      </motion.main>
    </div>
  );
};
