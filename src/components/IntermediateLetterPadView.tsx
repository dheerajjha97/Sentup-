import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Printer,
  RotateCcw,
  FileText,
  Building2,
  SlidersHorizontal,
  Sparkles,
  GraduationCap,
  School,
  Mail,
  Scissors,
  Upload,
  X,
  Stamp,
  FolderArchive,
  Loader2,
} from 'lucide-react';
import { AdmitCardRecord } from '../types/admitCard';
import { normalizeSchoolCode } from '../utils/teacherSubjectMatcher';
import {
  InterLetterCounts,
  LetterClassMode,
  LetterDocMode,
  MatricLetterCounts,
  STORAGE_KEY_10TH,
  STORAGE_KEY_12TH,
  SavedLetterProfile,
  compute10thLetterCounts,
  compute12thLetterCounts,
  loadSavedProfile,
  padTwoDigits,
  parseCountInt,
} from '../utils/letterPadProfile';
import { downloadCompleteClassPackZip } from '../utils/completePackExporter';

export type { LetterClassMode, LetterDocMode };

interface IntermediateLetterPadViewProps {
  records: AdmitCardRecord[];
  initialClassMode?: LetterClassMode;
  initialDocMode?: LetterDocMode;
  allowedClasses?: LetterClassMode[];
}

export const IntermediateLetterPadView: React.FC<IntermediateLetterPadViewProps> = ({
  records,
  initialClassMode = 'INTERMEDIATE',
  initialDocMode = 'LETTER_PAD',
  allowedClasses = ['INTERMEDIATE', 'MATRIC'],
}) => {
  const safeInitialMode: LetterClassMode = allowedClasses.includes(initialClassMode)
    ? initialClassMode
    : allowedClasses[0] || 'INTERMEDIATE';

  const [classMode, setClassMode] = useState<LetterClassMode>(safeInitialMode);
  const [docMode, setDocMode] = useState<LetterDocMode>(initialDocMode);

  // Sync classMode when parent module changes
  useEffect(() => {
    if (allowedClasses.includes(initialClassMode)) {
      setClassMode(initialClassMode);
    }
  }, [initialClassMode, allowedClasses]);

  const targetExamType = classMode === 'INTERMEDIATE' ? 'INTERMEDIATE (+2)' : 'MATRIC (10th)';

  const classRecords = useMemo(
    () => records.filter((r) => r.examType === targetExamType),
    [records, targetExamType]
  );

  const schools = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    classRecords.forEach((r) => {
      const code = normalizeSchoolCode(r.schoolCode, r.rollCode);
      if (!code) return;
      const prev = map.get(code) || {
        code,
        name: (r.schoolName || `School ${code}`).trim(),
        count: 0,
      };
      prev.count += 1;
      map.set(code, prev);
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [classRecords]);

  const [selectedSchoolCode, setSelectedSchoolCode] = useState<string>('ALL');

  // Reset school filter when switching class
  useEffect(() => {
    setSelectedSchoolCode('ALL');
  }, [classMode]);

  const scopedRecords = useMemo(() => {
    if (selectedSchoolCode === 'ALL') return classRecords;
    return classRecords.filter(
      (r) => normalizeSchoolCode(r.schoolCode, r.rollCode) === selectedSchoolCode
    );
  }, [classRecords, selectedSchoolCode]);

  const autoInterCounts = useMemo(
    () => compute12thLetterCounts(classMode === 'INTERMEDIATE' ? scopedRecords : []),
    [classMode, scopedRecords]
  );

  const autoMatricCounts = useMemo(
    () => compute10thLetterCounts(classMode === 'MATRIC' ? scopedRecords : []),
    [classMode, scopedRecords]
  );

  const [profile12th, setProfile12th] = useState<SavedLetterProfile>(() =>
    loadSavedProfile('INTERMEDIATE')
  );
  const [profile10th, setProfile10th] = useState<SavedLetterProfile>(() =>
    loadSavedProfile('MATRIC')
  );

  const profile = classMode === 'INTERMEDIATE' ? profile12th : profile10th;

  const [letterNumber, setLetterNumber] = useState<string>('');
  const [letterDate, setLetterDate] = useState<string>('');

  const [interCounts, setInterCounts] = useState<InterLetterCounts>(autoInterCounts);
  const [matricCounts, setMatricCounts] = useState<MatricLetterCounts>(autoMatricCounts);
  const [isManualInterOverride, setIsManualInterOverride] = useState<boolean>(false);
  const [isManualMatricOverride, setIsManualMatricOverride] = useState<boolean>(false);
  const [manualInterTotal, setManualInterTotal] = useState<string | null>(null);
  const [manualMatricTotal, setManualMatricTotal] = useState<string | null>(null);

  useEffect(() => {
    if (!isManualInterOverride) setInterCounts(autoInterCounts);
  }, [autoInterCounts, isManualInterOverride]);

  useEffect(() => {
    if (!isManualMatricOverride) setMatricCounts(autoMatricCounts);
  }, [autoMatricCounts, isManualMatricOverride]);

  const computedInterTotal = useMemo(() => {
    if (manualInterTotal !== null) return manualInterTotal;
    if (!isManualInterOverride && classMode === 'INTERMEDIATE') {
      return padTwoDigits(scopedRecords.length);
    }
    const sum =
      parseCountInt(interCounts.presentRegular) +
      parseCountInt(interCounts.vocational) +
      parseCountInt(interCounts.absentNonSentUp) +
      parseCountInt(interCounts.visuallyImpaired) +
      parseCountInt(interCounts.privateStudents);
    return padTwoDigits(sum);
  }, [manualInterTotal, isManualInterOverride, classMode, scopedRecords.length, interCounts]);

  const computedMatricTotal = useMemo(() => {
    if (manualMatricTotal !== null) return manualMatricTotal;
    const sum =
      parseCountInt(matricCounts.presentRegular) +
      parseCountInt(matricCounts.presentEx) +
      parseCountInt(matricCounts.absentFail) +
      parseCountInt(matricCounts.blindSentUp) +
      parseCountInt(matricCounts.blindAbsent) +
      parseCountInt(matricCounts.presentPrivate);
    return padTwoDigits(sum);
  }, [manualMatricTotal, matricCounts]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY_12TH, JSON.stringify(profile12th));
    } catch {
      // ignore storage errors
    }
  }, [profile12th]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY_10TH, JSON.stringify(profile10th));
    } catch {
      // ignore storage errors
    }
  }, [profile10th]);

  const updateProfile = <K extends keyof SavedLetterProfile>(
    key: K,
    value: SavedLetterProfile[K]
  ) => {
    if (classMode === 'INTERMEDIATE') {
      setProfile12th((prev) => ({ ...prev, [key]: value }));
    } else {
      setProfile10th((prev) => ({ ...prev, [key]: value }));
    }
  };

  const handleInterCountChange = (key: keyof InterLetterCounts, value: string) => {
    setIsManualInterOverride(true);
    setInterCounts((prev) => ({ ...prev, [key]: value.slice(0, 8) }));
  };

  const handleMatricCountChange = (key: keyof MatricLetterCounts, value: string) => {
    setIsManualMatricOverride(true);
    setMatricCounts((prev) => ({ ...prev, [key]: value.slice(0, 8) }));
  };

  const handleSyncCountsFromData = () => {
    if (classMode === 'INTERMEDIATE') {
      setIsManualInterOverride(false);
      setManualInterTotal(null);
      setInterCounts(autoInterCounts);
    } else {
      setIsManualMatricOverride(false);
      setManualMatricTotal(null);
      setMatricCounts(autoMatricCounts);
    }
  };

  const activeSchoolInfo = useMemo(() => {
    if (selectedSchoolCode !== 'ALL') {
      return schools.find((s) => s.code === selectedSchoolCode) || null;
    }
    return schools.length === 1 ? schools[0] : null;
  }, [schools, selectedSchoolCode]);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [zipStatus, setZipStatus] = useState<string>('');

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadCompleteZip = async () => {
    if (scopedRecords.length === 0 || zipStatus) return;
    try {
      setZipStatus('Preparing Pack...');
      await downloadCompleteClassPackZip({
        classMode,
        records: scopedRecords,
        schoolCode: activeSchoolInfo?.code,
        schoolName: activeSchoolInfo?.name,
        onProgress: (msg) => setZipStatus(msg),
      });
    } catch (err) {
      console.error('Complete pack export failed:', err);
    } finally {
      setZipStatus('');
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        const maxDim = 220;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/png');
          updateProfile('headerLogoDataUrl', dataUrl);
          updateProfile('headerShowEmblem', true);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const isInter = classMode === 'INTERMEDIATE';
  const isEnvelope = docMode === 'ENVELOPE_SLIP';
  const effectiveSchoolCode = profile.headerSchoolCode.trim() || activeSchoolInfo?.code || '';
  const isColorHeader = profile.headerTheme === 'OFFICIAL_COLOR';

  const renderEnvelopeSlip = (copyIndex: number) => (
    <div
      key={copyIndex}
      className={`font-hindi text-black w-full ${
        profile.envelopeShowCutBorder
          ? 'border border-dashed border-slate-500 p-5 sm:p-6 print:border-black'
          : 'p-3 sm:p-4'
      }`}
    >
      {/* Official Double-Bordered Header Box matching uploaded 12th & 10th templates */}
      <div className="mx-auto w-[92%] border-[3px] border-black p-[2px]">
        <div
          className={`border border-black px-4 py-3.5 text-center font-bold text-[17px] sm:text-[18.5px] leading-[1.68] text-black ${
            profile.envelopeBoxStyle === 'CREAM' ? 'bg-[#fff6d6]' : 'bg-white'
          }`}
        >
          {isInter ? (
            <>
              <div>
                इन्टरमीडिएट वार्षिक परीक्षा—
                <span className="font-mono">{profile.annualYear}</span> में सम्मिलित होने वाले
              </div>
              <div>
                परीक्षार्थियों का उत्प्रेषण (Sent-Up)/जाँच परीक्षा—
                <span className="font-mono">{profile.sentUpYear}</span> का
              </div>
              <div>प्राप्तांक विहित प्रपत्रों में (हार्ड एवं सॉफ्ट कॉपी में)</div>
            </>
          ) : (
            <>
              <div>
                माध्यमिक वार्षिक परीक्षा—
                <span className="font-mono">{profile.annualYear}</span> में सम्मिलित होने वाले परीक्षार्थियों का
              </div>
              <div>
                उत्प्रेषण (Sent-Up)/जाँच परीक्षा—
                <span className="font-mono">{profile.sentUpYear}</span> का प्राप्तांक विहित प्रपत्रों में
              </div>
              <div>(हार्ड एवं सॉफ्ट कॉपी में)</div>
            </>
          )}
        </div>
      </div>

      {/* Underlined Bold Lead-in */}
      <div className="mt-4 text-[14.5px] font-bold underline underline-offset-4">
        परीक्षा में उपस्थित/अनुपस्थित नियमित/स्वतन्त्र छात्र–छात्राओं की विवरणी निम्नांकित है :—
      </div>

      {/* Exact Numbered Breakdown + Total Row */}
      {isInter ? (
        <table className="mt-2.5 w-full border-collapse text-[14px] leading-[1.78]">
          <tbody>
            {[
              {
                num: '1.',
                node: <>उत्प्रेषित (Sent-Up)/जाँच परीक्षा में उपस्थित नियमित छात्र–छात्राओं की संख्या</>,
                value: interCounts.presentRegular || '00',
              },
              {
                num: '2.',
                node: <>व्यवसायिक पाठ्यक्रम के परीक्षार्थियों की संख्या</>,
                value: interCounts.vocational || '00',
              },
              {
                num: '3.',
                node: <>अनुपस्थित/अनुत्तीर्ण (Absent/Non Sent-up) नियमित छात्र–छात्राओं की संख्या</>,
                value: interCounts.absentNonSentUp || '00',
              },
              {
                num: '4.',
                node: <>दृष्टिबाधित (Visually Impaired/Blind) छात्र–छात्राओं की संख्या</>,
                value: interCounts.visuallyImpaired || '00',
              },
              {
                num: '5.',
                node: <>स्वतन्त्र (Private) छात्र–छात्राओं की संख्या</>,
                value: interCounts.privateStudents || '00',
              },
            ].map((row) => (
              <tr key={row.num}>
                <td className="w-7 align-top font-mono pr-1 py-0.5">{row.num}</td>
                <td className="align-top pr-2 py-0.5">{row.node}</td>
                <td className="w-8 align-top text-center py-0.5">:-</td>
                <td className="w-16 align-top text-center font-mono tabular-nums font-semibold py-0.5">
                  {row.value}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="pt-3 pr-2 text-right font-bold text-[15px]">
                विद्यालय में नामांकित कुल छात्रों की संख्या:—
              </td>
              <td className="w-16 pt-3 text-center font-mono tabular-nums font-bold text-[15px]">
                {computedInterTotal || '00'}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <table className="mt-2.5 w-full border-collapse text-[14px] leading-[1.74]">
          <tbody>
            {[
              {
                num: '1.',
                node: (
                  <>
                    उत्प्रेषण (Sent-Up)/जाँच परीक्षा में{' '}
                    <strong className="font-bold">उपस्थित नियमित</strong> छात्र–छात्राओं की संख्या
                  </>
                ),
                value: matricCounts.presentRegular || '00',
              },
              {
                num: '2.',
                node: (
                  <>
                    उत्प्रेषण (Sent-Up)/जाँच परीक्षा में{' '}
                    <strong className="font-bold">उपस्थित पूर्ववर्ती</strong> छात्र–छात्राओं की संख्या
                  </>
                ),
                value: matricCounts.presentEx || '00',
              },
              {
                num: '3.',
                node: (
                  <>
                    उत्प्रेषण (Sent-Up)/जाँच परीक्षा में{' '}
                    <strong className="font-bold">अनुपस्थित/अनुत्तीर्ण</strong> छात्र–छात्राओं की संख्या
                  </>
                ),
                value: matricCounts.absentFail || '00',
              },
              {
                num: '4.',
                node: (
                  <>
                    दृष्टिबाधित (Visually Impaired/Blind){' '}
                    <strong className="font-bold">उत्प्रेषित (Sent-Up)</strong> छात्र–छात्राओं की संख्या
                  </>
                ),
                value: matricCounts.blindSentUp || '00',
              },
              {
                num: '5.',
                node: (
                  <>
                    दृष्टिबाधित (Visually Impaired/Blind){' '}
                    <strong className="font-bold">अनुपस्थित/अनुत्तीर्ण</strong> छात्र–छात्राओं की संख्या
                  </>
                ),
                value: matricCounts.blindAbsent || '00',
              },
              {
                num: '6.',
                node: (
                  <>
                    उत्प्रेषण (Sent-Up)/जाँच परीक्षा में{' '}
                    <strong className="font-bold">उपस्थित स्वतन्त्र</strong> (Private) छात्र–छात्राओं की संख्या
                  </>
                ),
                value: matricCounts.presentPrivate || '00',
              },
            ].map((row) => (
              <tr key={row.num}>
                <td className="w-7 align-top font-mono pr-1 py-0.5">{row.num}</td>
                <td className="align-top pr-2 py-0.5">{row.node}</td>
                <td className="w-8 align-top text-center py-0.5">:-</td>
                <td className="w-16 align-top text-center font-mono tabular-nums font-semibold py-0.5">
                  {row.value}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="pt-3 pr-2 text-right font-bold text-[15px]">
                विद्यालय में पंजीकृत कुल छात्रों की संख्या:—
              </td>
              <td className="w-16 pt-3 text-center font-mono tabular-nums font-bold text-[15px]">
                {computedMatricTotal || '00'}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* Optional School Footer for Envelope */}
      {profile.envelopeShowSchoolFooter && (
        <div className="mt-4 pt-2.5 border-t border-black/40 flex flex-wrap items-baseline justify-between gap-2 text-[13px] font-semibold">
          <div>
            प्रेषक: {profile.schoolNameHindi}, {profile.blockDistrictHindi}
          </div>
          {activeSchoolInfo && (
            <div className="font-mono text-[12px]">
              {isInter ? '+2 Code' : 'Code'}: {activeSchoolInfo.code}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 print:space-y-0">
      {/* Top Toolbar (Hidden on Print) */}
      <section className="print:hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
              {isEnvelope
                ? isInter
                  ? '12th Intermediate Lifafa Slip · लिफाफा पेस्ट स्लिप प्रिंट'
                  : '10th Matric Lifafa Slip · लिफाफा पेस्ट स्लिप प्रिंट'
                : isInter
                ? '12th Intermediate Forwarding Letter · स्कूल लेटर पैड प्रिंट'
                : '10th Matric Forwarding Letter · स्कूल लेटर पैड प्रिंट'}
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
              {scopedRecords.length} Loaded {isInter ? '12th' : '10th'} Students · Auto-filled Counts ·{' '}
              {isEnvelope ? 'Cut & Paste Envelope Slip Ready' : 'Pre-Printed Letter Pad Ready'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isEnvelope ? (
              /* Paper Mode Segmented Toggle (Letter Pad) */
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => updateProfile('paperMode', 'PLAIN_A4')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    profile.paperMode === 'PLAIN_A4'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  With Letter Pad Header
                </button>
                <button
                  type="button"
                  onClick={() => updateProfile('paperMode', 'PREPRINTED_PAD')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    profile.paperMode === 'PREPRINTED_PAD'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  Pre-Printed Pad (Blank Top)
                </button>
              </div>
            ) : (
              /* Copies per A4 Sheet Toggle (Envelope Slip) */
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => updateProfile('envelopeCopiesPerPage', 1)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    profile.envelopeCopiesPerPage === 1
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  1 Slip / A4
                </button>
                <button
                  type="button"
                  onClick={() => updateProfile('envelopeCopiesPerPage', 2)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    profile.envelopeCopiesPerPage === 2
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  2 Slips / A4 (Cut)
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleDownloadCompleteZip}
              disabled={scopedRecords.length === 0 || Boolean(zipStatus)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {zipStatus ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
              ) : (
                <FolderArchive className="h-3.5 w-3.5 text-indigo-600" />
              )}
              <span>{zipStatus || `Download All ${isInter ? '12th' : '10th'} (ZIP)`}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer shadow-2xs ${
                isEnvelope
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : isInter
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-emerald-700 hover:bg-emerald-800'
              }`}
            >
              <Printer className="h-4 w-4" />
              <span>{isEnvelope ? 'Print Lifafa Slip' : 'Print on Letter Pad'}</span>
            </button>
          </div>
        </div>

        {/* Document Type Switcher + Class Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Document Type: Letter Pad vs Envelope Paste Slip */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setDocMode('LETTER_PAD')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                !isEnvelope
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Letter Pad (अग्रसारण पत्र)</span>
            </button>
            <button
              type="button"
              onClick={() => setDocMode('ENVELOPE_SLIP')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                isEnvelope
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              <span>Lifafa Slip (लिफाफा पेस्ट स्लिप)</span>
            </button>
          </div>

          {/* Class Switcher: 12th Intermediate vs 10th Matric */}
          {allowedClasses.length > 1 && (
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {allowedClasses.includes('INTERMEDIATE') && (
                <button
                  type="button"
                  onClick={() => setClassMode('INTERMEDIATE')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    isInter
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span>12th Intermediate (5 Items)</span>
                </button>
              )}
              {allowedClasses.includes('MATRIC') && (
                <button
                  type="button"
                  onClick={() => setClassMode('MATRIC')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    !isInter
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  <School className="h-3.5 w-3.5" />
                  <span>10th Matric (6 Items)</span>
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Split Workspace: Controls (Left, hidden on print) + Exact A4 Letter Preview (Right, prints full page) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start print:block">
        {/* LEFT: Letter Details & Margin Editor */}
        <aside className="print:hidden xl:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
          {/* School Filter if multiple schools exist in this class */}
          {schools.length > 1 && (
            <div className="space-y-1.5 pb-3 border-b border-slate-100">
              <label
                htmlFor="letter-school-select"
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>School Code (Count Scope)</span>
              </label>
              <select
                id="letter-school-select"
                value={selectedSchoolCode}
                onChange={(e) => {
                  setSelectedSchoolCode(e.target.value);
                  if (isInter) setIsManualInterOverride(false);
                  else setIsManualMatricOverride(false);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-800 focus:border-indigo-600 focus:outline-none"
              >
                <option value="ALL">
                  All {isInter ? '12th' : '10th'} Schools ({classRecords.length})
                </option>
                {schools.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name} ({s.count})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Mode-Specific Layout Controls */}
          {isEnvelope ? (
            <div className="space-y-3 pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Scissors className="h-3.5 w-3.5 text-amber-600" />
                  <span>लिफाफा स्लिप प्रिंट सेटिंग (Cut &amp; Paste)</span>
                </span>
              </div>

              {/* Header Box Background Style */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-600">Header Box Fill</span>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => updateProfile('envelopeBoxStyle', 'CREAM')}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                      profile.envelopeBoxStyle === 'CREAM'
                        ? 'bg-amber-100 text-amber-950 border border-amber-300'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Cream (Official)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateProfile('envelopeBoxStyle', 'WHITE')}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                      profile.envelopeBoxStyle === 'WHITE'
                        ? 'bg-white text-slate-900 border border-slate-300'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    White (B&amp;W)
                  </button>
                </div>
              </div>

              {/* Checkboxes for Cut Border & School Footer */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.envelopeShowCutBorder}
                    onChange={(e) => updateProfile('envelopeShowCutBorder', e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-amber-600"
                  />
                  <span>Show Dashed Cut Border (कैंची से काटने की लाइन)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.envelopeShowSchoolFooter}
                    onChange={(e) => updateProfile('envelopeShowSchoolFooter', e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-amber-600"
                  />
                  <span>Include School Name &amp; Code Footer (प्रेषक लाइन)</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pb-3 border-b border-slate-100">
              {/* Digital Letter Pad Header Customizer */}
              {profile.paperMode === 'PLAIN_A4' && (
                <div className="space-y-2.5 pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <Stamp className="h-3.5 w-3.5 text-rose-700" />
                      <span>लेटर पैड हेडर सेटिंग (Header Designer)</span>
                    </span>
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                      <button
                        type="button"
                        onClick={() => updateProfile('headerTheme', 'OFFICIAL_COLOR')}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold cursor-pointer ${
                          profile.headerTheme === 'OFFICIAL_COLOR'
                            ? 'bg-rose-800 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Color
                      </button>
                      <button
                        type="button"
                        onClick={() => updateProfile('headerTheme', 'CLASSIC_BW')}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold cursor-pointer ${
                          profile.headerTheme === 'CLASSIC_BW'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        B&amp;W
                      </button>
                    </div>
                  </div>

                  {/* Emblem Toggle + Custom School Logo Upload */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={profile.headerShowEmblem}
                        onChange={(e) => updateProfile('headerShowEmblem', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 accent-indigo-600"
                      />
                      <span>Show Logo / Emblem</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        <Upload className="h-3 w-3" />
                        <span>{profile.headerLogoDataUrl ? 'Change Logo' : 'Upload Logo'}</span>
                      </button>
                      {profile.headerLogoDataUrl && (
                        <button
                          type="button"
                          onClick={() => updateProfile('headerLogoDataUrl', '')}
                          title="Reset to built-in emblem"
                          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-1 text-slate-500 hover:text-rose-700 cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="header-dept-line"
                        className="block text-[11px] font-semibold text-slate-600 mb-1"
                      >
                        शीर्ष विभाग पंक्ति
                      </label>
                      <input
                        id="header-dept-line"
                        type="text"
                        value={profile.headerDeptLine}
                        onChange={(e) => updateProfile('headerDeptLine', e.target.value)}
                        placeholder="बिहार सरकार · शिक्षा विभाग"
                        className="font-hindi w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="header-office-line"
                        className="block text-[11px] font-semibold text-slate-600 mb-1"
                      >
                        कार्यालय पंक्ति
                      </label>
                      <input
                        id="header-office-line"
                        type="text"
                        value={profile.headerOfficeLine}
                        onChange={(e) => updateProfile('headerOfficeLine', e.target.value)}
                        placeholder="कार्यालय : प्रधानाध्यापक"
                        className="font-hindi w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label
                        htmlFor="header-school-code"
                        className="block text-[11px] font-semibold text-slate-600 mb-1"
                      >
                        विद्यालय कोड
                      </label>
                      <input
                        id="header-school-code"
                        type="text"
                        value={profile.headerSchoolCode}
                        onChange={(e) => updateProfile('headerSchoolCode', e.target.value)}
                        placeholder={activeSchoolInfo?.code || 'e.g. 51042'}
                        className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="header-udise-code"
                        className="block text-[11px] font-semibold text-slate-600 mb-1"
                      >
                        UDISE कोड
                      </label>
                      <input
                        id="header-udise-code"
                        type="text"
                        value={profile.headerUdiseCode}
                        onChange={(e) => updateProfile('headerUdiseCode', e.target.value)}
                        placeholder="e.g. 1014..."
                        className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="header-est-year"
                        className="block text-[11px] font-semibold text-slate-600 mb-1"
                      >
                        स्थापना वर्ष
                      </label>
                      <input
                        id="header-est-year"
                        type="text"
                        value={profile.headerEstYear}
                        onChange={(e) => updateProfile('headerEstYear', e.target.value)}
                        placeholder="e.g. 1965"
                        className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="header-phone"
                        className="block text-[11px] font-semibold text-slate-600 mb-1"
                      >
                        मोबाइल नंबर (वैकल्पिक)
                      </label>
                      <input
                        id="header-phone"
                        type="text"
                        value={profile.headerPhone}
                        onChange={(e) => updateProfile('headerPhone', e.target.value)}
                        placeholder="e.g. 9876543210"
                        className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="header-email"
                        className="block text-[11px] font-semibold text-slate-600 mb-1"
                      >
                        ईमेल (वैकल्पिक)
                      </label>
                      <input
                        id="header-email"
                        type="text"
                        value={profile.headerEmail}
                        onChange={(e) => updateProfile('headerEmail', e.target.value)}
                        placeholder="school@gmail.com"
                        className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Letter Pad Margin Calibration */}
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Letter Pad Margin Alignment</span>
                </span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {profile.paperMode === 'PREPRINTED_PAD'
                    ? `Top ${profile.topMarginMm} mm · Side ${profile.sideMarginMm} mm`
                    : `Side ${profile.sideMarginMm} mm`}
                </span>
              </div>

              {profile.paperMode === 'PREPRINTED_PAD' && (
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                    <label htmlFor="letter-top-margin">
                      Top Blank Space (स्कूल के छपे हेडर के लिए जगह)
                    </label>
                    <span className="font-mono font-semibold tabular-nums text-indigo-700">
                      {profile.topMarginMm} mm
                    </span>
                  </div>
                  <input
                    id="letter-top-margin"
                    type="range"
                    min={0}
                    max={90}
                    step={1}
                    value={profile.topMarginMm}
                    onChange={(e) => updateProfile('topMarginMm', Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>0 mm</span>
                    <span>35 mm (Std)</span>
                    <span>55 mm (Tall)</span>
                    <span>90 mm</span>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                  <label htmlFor="letter-side-margin">Left / Right Side Margin</label>
                  <span className="font-mono font-semibold tabular-nums text-slate-700">
                    {profile.sideMarginMm} mm
                  </span>
                </div>
                <input
                  id="letter-side-margin"
                  type="range"
                  min={8}
                  max={28}
                  step={1}
                  value={profile.sideMarginMm}
                  onChange={(e) => updateProfile('sideMarginMm', Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Letter No, Date & Exam Years */}
          <div className="space-y-3 pb-3 border-b border-slate-100">
            <div className="text-xs font-bold text-slate-900">
              {isEnvelope ? 'परीक्षा वर्ष (हेडिंग बॉक्स के लिए)' : 'पत्रांक, दिनांक एवं परीक्षा वर्ष'}
            </div>

            {!isEnvelope && (
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="letter-no-input"
                    className="block text-[11px] font-semibold text-slate-600 mb-1"
                  >
                    पत्रांक (खाली छोड़ें तो डॉट लाइन)
                  </label>
                  <input
                    id="letter-no-input"
                    type="text"
                    value={letterNumber}
                    onChange={(e) => setLetterNumber(e.target.value)}
                    placeholder="e.g. 142/2026"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="letter-date-input"
                    className="block text-[11px] font-semibold text-slate-600 mb-1"
                  >
                    दिनांक (खाली छोड़ें तो डॉट लाइन)
                  </label>
                  <input
                    id="letter-date-input"
                    type="text"
                    value={letterDate}
                    onChange={(e) => setLetterDate(e.target.value)}
                    placeholder="e.g. 28/11/2026"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="annual-year-input"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  वार्षिक परीक्षा वर्ष
                </label>
                <input
                  id="annual-year-input"
                  type="text"
                  value={profile.annualYear}
                  onChange={(e) => updateProfile('annualYear', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="sentup-year-input"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  जाँच (Sent-Up) परीक्षा वर्ष
                </label>
                <input
                  id="sentup-year-input"
                  type="text"
                  value={profile.sentUpYear}
                  onChange={(e) => updateProfile('sentUpYear', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>

            {!isEnvelope && (
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="exam-start-input"
                    className="block text-[11px] font-semibold text-slate-600 mb-1"
                  >
                    परीक्षा प्रारंभ तिथि
                  </label>
                  <input
                    id="exam-start-input"
                    type="text"
                    value={profile.examStartDate}
                    onChange={(e) => updateProfile('examStartDate', e.target.value)}
                    placeholder={isInter ? '11-11-2026' : '19-11-2026'}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="exam-end-input"
                    className="block text-[11px] font-semibold text-slate-600 mb-1"
                  >
                    परीक्षा समाप्ति तिथि
                  </label>
                  <input
                    id="exam-end-input"
                    type="text"
                    value={profile.examEndDate}
                    onChange={(e) => updateProfile('examEndDate', e.target.value)}
                    placeholder={isInter ? '25-11-2026' : '22-11-2026'}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* School & Officer Hindi Details (shown in Letter Pad mode, or when Envelope School Footer is checked) */}
          {(!isEnvelope || profile.envelopeShowSchoolFooter) && (
            <div className="space-y-2.5 pb-3 border-b border-slate-100">
              <div className="text-xs font-bold text-slate-900">
                {isEnvelope
                  ? 'विद्यालय का नाम (लिफाफा फुटर के लिए)'
                  : 'प्रेषक एवं सेवा में (विद्यालय का नाम — हिन्दी)'}
              </div>
              <div>
                <label
                  htmlFor="school-hindi-name"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  विद्यालय का नाम
                </label>
                <input
                  id="school-hindi-name"
                  type="text"
                  value={profile.schoolNameHindi}
                  onChange={(e) => updateProfile('schoolNameHindi', e.target.value)}
                  className="font-hindi w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
              <div className={`grid grid-cols-1 ${!isEnvelope ? 'sm:grid-cols-2' : ''} gap-2.5`}>
                <div>
                  <label
                    htmlFor="school-block-district"
                    className="block text-[11px] font-semibold text-slate-600 mb-1"
                  >
                    प्रखण्ड एवं जिला
                  </label>
                  <input
                    id="school-block-district"
                    type="text"
                    value={profile.blockDistrictHindi}
                    onChange={(e) => updateProfile('blockDistrictHindi', e.target.value)}
                    className="font-hindi w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
                {!isEnvelope && (
                  <div>
                    <label
                      htmlFor="sender-designation"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      प्रेषक पदनाम (शीर्ष)
                    </label>
                    <input
                      id="sender-designation"
                      type="text"
                      value={profile.designation}
                      onChange={(e) => updateProfile('designation', e.target.value)}
                      className="font-hindi w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                )}
              </div>
              {!isEnvelope && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label
                      htmlFor="signature-designation"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      हस्ताक्षर पदनाम (नीचे)
                    </label>
                    <input
                      id="signature-designation"
                      type="text"
                      value={profile.signatureDesignation}
                      onChange={(e) => updateProfile('signatureDesignation', e.target.value)}
                      className="font-hindi w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="recipient-title"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      सेवा में (पदाधिकारी)
                    </label>
                    <input
                      id="recipient-title"
                      type="text"
                      value={profile.recipientTitle}
                      onChange={(e) => updateProfile('recipientTitle', e.target.value)}
                      className="font-hindi w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="recipient-district"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      जिला (सेवा में)
                    </label>
                    <input
                      id="recipient-district"
                      type="text"
                      value={profile.recipientDistrict}
                      onChange={(e) => updateProfile('recipientDistrict', e.target.value)}
                      className="font-hindi w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Auto-Calculated Counts with Manual Override */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                <span>छात्र-छात्राओं की विवरणी (Auto Counts)</span>
              </span>
              <button
                type="button"
                onClick={handleSyncCountsFromData}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:underline whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Auto-Fill ({scopedRecords.length})</span>
              </button>
            </div>

            {isInter ? (
              <div className="space-y-2">
                {(
                  [
                    { key: 'presentRegular', label: '1. उपस्थित नियमित (Sent-Up)' },
                    { key: 'vocational', label: '2. व्यवसायिक पाठ्यक्रम (Vocational)' },
                    { key: 'absentNonSentUp', label: '3. अनुपस्थित/अनुत्तीर्ण (Absent/Non Sent-Up)' },
                    { key: 'visuallyImpaired', label: '4. दृष्टिबाधित (Visually Impaired/Blind)' },
                    { key: 'privateStudents', label: '5. स्वतन्त्र (Private)' },
                  ] as const
                ).map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3">
                    <label
                      htmlFor={`count-12-${item.key}`}
                      className="font-hindi text-xs text-slate-700 truncate"
                    >
                      {item.label}
                    </label>
                    <input
                      id={`count-12-${item.key}`}
                      type="text"
                      value={interCounts[item.key]}
                      onChange={(e) => handleInterCountChange(item.key, e.target.value)}
                      className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-center font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-indigo-600 focus:outline-none shrink-0"
                    />
                  </div>
                ))}

                {isEnvelope && (
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200">
                    <label
                      htmlFor="count-12-total"
                      className="font-hindi text-xs font-bold text-slate-900 truncate"
                    >
                      कुल नामांकित छात्र (Total)
                    </label>
                    <input
                      id="count-12-total"
                      type="text"
                      value={computedInterTotal}
                      onChange={(e) => setManualInterTotal(e.target.value.slice(0, 8))}
                      className="w-20 rounded-lg border border-amber-400 bg-amber-50 px-2.5 py-1 text-center font-mono text-xs font-bold tabular-nums text-slate-950 focus:border-amber-600 focus:outline-none shrink-0"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {(
                  [
                    { key: 'presentRegular', label: '1. उपस्थित नियमित छात्र–छात्रा' },
                    { key: 'presentEx', label: '2. उपस्थित पूर्ववर्ती (Ex) छात्र–छात्रा' },
                    { key: 'absentFail', label: '3. अनुपस्थित/अनुत्तीर्ण छात्र–छात्रा' },
                    { key: 'blindSentUp', label: '4. दृष्टिबाधित उत्प्रेषित (Sent-Up)' },
                    { key: 'blindAbsent', label: '5. दृष्टिबाधित अनुपस्थित/अनुत्तीर्ण' },
                    { key: 'presentPrivate', label: '6. उपस्थित स्वतन्त्र (Private)' },
                  ] as const
                ).map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3">
                    <label
                      htmlFor={`count-10-${item.key}`}
                      className="font-hindi text-xs text-slate-700 truncate"
                    >
                      {item.label}
                    </label>
                    <input
                      id={`count-10-${item.key}`}
                      type="text"
                      value={matricCounts[item.key]}
                      onChange={(e) => handleMatricCountChange(item.key, e.target.value)}
                      className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-center font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-emerald-700 focus:outline-none shrink-0"
                    />
                  </div>
                ))}

                {isEnvelope && (
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200">
                    <label
                      htmlFor="count-10-total"
                      className="font-hindi text-xs font-bold text-slate-900 truncate"
                    >
                      कुल पंजीकृत छात्र (Total)
                    </label>
                    <input
                      id="count-10-total"
                      type="text"
                      value={computedMatricTotal}
                      onChange={(e) => setManualMatricTotal(e.target.value.slice(0, 8))}
                      className="w-20 rounded-lg border border-amber-400 bg-amber-50 px-2.5 py-1 text-center font-mono text-xs font-bold tabular-nums text-slate-950 focus:border-amber-600 focus:outline-none shrink-0"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT: Exact A4 Printable Official Hindi Letter OR Lifafa Slip Preview */}
        <div className="xl:col-span-7 print:w-full">
          <div className="print:hidden mb-2 flex items-center justify-between text-xs text-slate-500 px-1">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
              {isEnvelope ? (
                <Mail className="h-3.5 w-3.5 text-amber-600" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-indigo-600" />
              )}
              <span>
                {isEnvelope
                  ? `Lifafa Paste Slip Preview (${isInter ? '12th Intermediate' : '10th Matric'})`
                  : `A4 Letter Pad Live Preview (${isInter ? '12th Intermediate' : '10th Matric'})`}
              </span>
            </span>
            <span className="font-mono text-[11px]">
              {isEnvelope
                ? `${profile.envelopeCopiesPerPage} Slip${profile.envelopeCopiesPerPage > 1 ? 's' : ''} / A4 · ${
                    profile.envelopeBoxStyle === 'CREAM' ? 'Cream Box' : 'B&W Box'
                  }`
                : profile.paperMode === 'PREPRINTED_PAD'
                ? `Top Header Blank: ${profile.topMarginMm} mm`
                : 'Plain A4 Digital Header'}
            </span>
          </div>

          {isEnvelope ? (
            <article className="letter-pad-print-page font-hindi mx-auto w-full max-w-[210mm] rounded-2xl border border-slate-300 bg-white p-6 sm:p-8 text-black shadow-sm overflow-hidden print:p-4">
              {renderEnvelopeSlip(0)}

              {profile.envelopeCopiesPerPage === 2 && (
                <>
                  <div className="my-6 flex items-center gap-3 text-[11px] font-sans text-slate-500 print:my-5 print:text-black">
                    <div className="flex-1 border-t border-dashed border-slate-400 print:border-black" />
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Scissors className="h-3 w-3" />
                      <span>काटने की रेखा (Cut Here)</span>
                    </span>
                    <div className="flex-1 border-t border-dashed border-slate-400 print:border-black" />
                  </div>
                  {renderEnvelopeSlip(1)}
                </>
              )}
            </article>
          ) : (
            <article
              className="letter-pad-print-page font-hindi mx-auto w-full max-w-[210mm] min-h-[282mm] rounded-2xl border border-slate-300 bg-white text-black shadow-sm overflow-hidden"
              style={{
                paddingLeft: `${profile.sideMarginMm}mm`,
                paddingRight: `${profile.sideMarginMm}mm`,
                paddingBottom: '16mm',
              }}
            >
            {/* Top Letter Pad Space OR Official Designed School Letterhead */}
            {profile.paperMode === 'PREPRINTED_PAD' ? (
              <div
                style={{ height: `${profile.topMarginMm}mm` }}
                className="flex items-center justify-center border-b border-dashed border-slate-300 bg-slate-50/70 text-[11px] font-sans text-slate-400 print:border-transparent print:bg-transparent"
              >
                <span className="print:hidden">
                  School Pre-Printed Letter Pad Header Space ({profile.topMarginMm} mm — Prints Completely Blank)
                </span>
              </div>
            ) : (
              <header className="pt-5 pb-1">
                {/* Top Strip: Email (Left) | Dept Line (Center) | Phone (Right) */}
                {(profile.headerDeptLine.trim() ||
                  profile.headerEmail.trim() ||
                  profile.headerPhone.trim()) && (
                  <div
                    className={`grid grid-cols-3 items-baseline text-[11px] font-semibold mb-1.5 ${
                      isColorHeader ? 'text-[#1e3a8a]' : 'text-black'
                    }`}
                  >
                    <div className="text-left font-mono truncate">
                      {profile.headerEmail.trim() ? `Email: ${profile.headerEmail.trim()}` : ''}
                    </div>
                    <div className="text-center font-hindi font-bold text-[12.5px] tracking-wide">
                      {profile.headerDeptLine.trim()}
                    </div>
                    <div className="text-right font-mono truncate">
                      {profile.headerPhone.trim() ? `मो०: ${profile.headerPhone.trim()}` : ''}
                    </div>
                  </div>
                )}

                {/* Main Banner: Emblem/Logo + Centered Official School Name & Block/District */}
                <div className="flex items-center justify-between gap-3">
                  {profile.headerShowEmblem && (
                    <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                      {profile.headerLogoDataUrl ? (
                        <img
                          src={profile.headerLogoDataUrl}
                          alt="School Logo"
                          className="max-h-16 max-w-16 object-contain"
                        />
                      ) : (
                        <svg
                          viewBox="0 0 80 80"
                          className="h-15 w-15"
                          aria-label="Official School Education Emblem"
                        >
                          <circle
                            cx="40"
                            cy="40"
                            r="36"
                            fill="none"
                            stroke={isColorHeader ? '#881337' : '#000000'}
                            strokeWidth="2.4"
                          />
                          <circle
                            cx="40"
                            cy="40"
                            r="31"
                            fill="none"
                            stroke={isColorHeader ? '#1e3a8a' : '#000000'}
                            strokeWidth="1"
                            strokeDasharray="2.2 2"
                          />
                          {/* Sun / Flame of Knowledge */}
                          <circle
                            cx="40"
                            cy="27"
                            r="6.5"
                            fill={isColorHeader ? '#b45309' : '#000000'}
                          />
                          <g
                            stroke={isColorHeader ? '#b45309' : '#000000'}
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          >
                            <line x1="40" y1="14" x2="40" y2="18" />
                            <line x1="30" y1="17" x2="32.5" y2="20" />
                            <line x1="50" y1="17" x2="47.5" y2="20" />
                            <line x1="25.5" y1="25" x2="29" y2="26" />
                            <line x1="54.5" y1="25" x2="51" y2="26" />
                          </g>
                          {/* Open Book */}
                          <path
                            d="M21 44 C28 40, 35 42, 40 46 C45 42, 52 40, 59 44 L59 56 C52 52, 45 54, 40 58 C35 54, 28 52, 21 56 Z"
                            fill="none"
                            stroke={isColorHeader ? '#1e3a8a' : '#000000'}
                            strokeWidth="2.2"
                            strokeLinejoin="round"
                          />
                          <line
                            x1="40"
                            y1="46"
                            x2="40"
                            y2="58"
                            stroke={isColorHeader ? '#1e3a8a' : '#000000'}
                            strokeWidth="1.8"
                          />
                          <text
                            x="40"
                            y="68"
                            textAnchor="middle"
                            fontSize="7.5"
                            fontWeight="700"
                            fill={isColorHeader ? '#881337' : '#000000'}
                          >
                            विद्या ददाति विनयम्
                          </text>
                        </svg>
                      )}
                    </div>
                  )}

                  <div className="flex-1 text-center">
                    {profile.headerOfficeLine.trim() && (
                      <div
                        className={`text-[13px] font-bold tracking-wide ${
                          isColorHeader ? 'text-[#1e3a8a]' : 'text-black'
                        }`}
                      >
                        {profile.headerOfficeLine.trim()}
                      </div>
                    )}
                    <div
                      className={`text-[23px] sm:text-[26px] font-extrabold tracking-tight leading-[1.22] mt-0.5 ${
                        isColorHeader ? 'text-[#881337]' : 'text-black'
                      }`}
                    >
                      {profile.schoolNameHindi}
                    </div>
                    <div
                      className={`text-[14.5px] font-bold mt-0.5 ${
                        isColorHeader ? 'text-[#1e3a8a]' : 'text-black'
                      }`}
                    >
                      {profile.blockDistrictHindi}
                    </div>
                  </div>

                  {/* Symmetric spacer when emblem is displayed so title stays mathematically centered */}
                  {profile.headerShowEmblem && <div className="w-16 shrink-0" />}
                </div>

                {/* Official Codes Bar: School Code | UDISE Code | Est. Year */}
                {(effectiveSchoolCode ||
                  profile.headerUdiseCode.trim() ||
                  profile.headerEstYear.trim()) && (
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-0.5 text-[12px] font-semibold text-black">
                    {effectiveSchoolCode && (
                      <span>
                        {isInter ? '+2 विद्यालय कोड' : 'विद्यालय कोड'} :{' '}
                        <strong className="font-mono">{effectiveSchoolCode}</strong>
                      </span>
                    )}
                    {profile.headerUdiseCode.trim() && (
                      <span>
                        UDISE कोड :{' '}
                        <strong className="font-mono">{profile.headerUdiseCode.trim()}</strong>
                      </span>
                    )}
                    {profile.headerEstYear.trim() && (
                      <span>
                        स्थापना वर्ष :{' '}
                        <strong className="font-mono">{profile.headerEstYear.trim()}</strong>
                      </span>
                    )}
                  </div>
                )}

                {/* Classic Official Double-Rule Divider */}
                <div className="mt-2.5 space-y-[2px]">
                  <div
                    className={`h-[2.5px] w-full ${
                      isColorHeader ? 'bg-[#881337]' : 'bg-black'
                    }`}
                  />
                  <div
                    className={`h-[1px] w-full ${
                      isColorHeader ? 'bg-[#1e3a8a]' : 'bg-black'
                    }`}
                  />
                </div>
              </header>
            )}

            {/* Main Official Letter Body */}
            <div className="pt-4 text-[14.5px] leading-[1.82] text-black">
              {/* Row 1: Patrank & Dinank */}
              <div className="flex items-baseline justify-between gap-4 font-semibold">
                <div>
                  पत्रांक :-{' '}
                  {letterNumber.trim() ? (
                    <span className="font-mono">{letterNumber.trim()}</span>
                  ) : (
                    <span className="tracking-widest">.............../</span>
                  )}
                </div>
                <div>
                  दिनांक :-{' '}
                  {letterDate.trim() ? (
                    <span className="font-mono">{letterDate.trim()}</span>
                  ) : (
                    <span>
                      ........../......../ <span className="font-mono">{profile.sentUpYear}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Preshak (From) */}
              <div className="mt-5 grid grid-cols-[92px_1fr] gap-2">
                <div>प्रेषक :-</div>
                <div className="leading-[1.7]">
                  <div>{profile.designation},</div>
                  <div>{profile.schoolNameHindi},</div>
                  <div>{profile.blockDistrictHindi}।</div>
                </div>
              </div>

              {/* Sewa Mein (To) */}
              <div className="mt-4 grid grid-cols-[92px_1fr] gap-2">
                <div>सेवा में,</div>
                <div className="leading-[1.7] mt-5">
                  <div>{profile.recipientTitle},</div>
                  <div>{profile.recipientDistrict}।</div>
                </div>
              </div>

              {/* Vishay (Subject) */}
              <div className="mt-4 grid grid-cols-[92px_1fr] gap-2">
                <div>विषय :-</div>
                <div className="leading-[1.7] text-justify">
                  {isInter ? (
                    <>
                      इन्टरमीडिएट वार्षिक परीक्षा, <span className="font-mono">{profile.annualYear}</span> में सम्मिलित होने वाले परीक्षार्थियों के उत्प्रेषण (Sent-Up)/जाँच परीक्षा,{' '}
                      <span className="font-mono">{profile.sentUpYear}</span> का परीक्षाफल (हार्ड एवं सॉफ्ट कॉपी) का विहित प्रपत्र में आवश्यक कार्यार्थ प्रेषण।
                    </>
                  ) : (
                    <>
                      वार्षिक माध्यमिक परीक्षा, <span className="font-mono">{profile.annualYear}</span> में सम्मिलित होने वाले परीक्षार्थियों के उत्प्रेषण (Sent-Up)/जाँच परीक्षा,{' '}
                      <span className="font-mono">{profile.sentUpYear}</span> का परीक्षाफल (हार्ड एवं सॉफ्ट कॉपी) का विहित प्रपत्र में आवश्यक कार्यार्थ प्रेषण।
                    </>
                  )}
                </div>
              </div>

              {/* Mahashay + Body Paragraph */}
              <div className="mt-4">
                <div>महाशय,</div>
                <p className="mt-1 text-justify indent-16 leading-[1.82]">
                  {isInter ? (
                    <>
                      उपर्युक्त विषयक प्रासंगिक पत्र के सम्बन्ध में अंकित करना है कि इन्टरमीडिएट वार्षिक परीक्षा,{' '}
                      <span className="font-mono">{profile.annualYear}</span> में सम्मिलित होने वाले पंजीकृत छात्र/छात्राओं का उत्प्रेषण (Sent-up)/जाँच परीक्षा दिनांक{' '}
                      <span className="font-mono font-semibold">{profile.examStartDate}</span> से दिनांक{' '}
                      <span className="font-mono font-semibold">{profile.examEndDate}</span> तक विद्यालय में संचालित की गई।
                    </>
                  ) : (
                    <>
                      उपर्युक्त विषयक प्रासंगिक पत्र के सम्बन्ध में अंकित करना है कि वार्षिक माध्यमिक परीक्षा,{' '}
                      <span className="font-mono">{profile.annualYear}</span> में सम्मिलित होने वाले पंजीकृत छात्र/छात्राओं का उत्प्रेषण (Sent-up)/जाँच परीक्षा–
                      <span className="font-mono">{profile.sentUpYear}</span> दिनांक{' '}
                      <span className="font-mono font-semibold">{profile.examStartDate}</span> से दिनांक{' '}
                      <span className="font-mono font-semibold">{profile.examEndDate}</span> तक विद्यालय में संचालित की गई।
                    </>
                  )}
                </p>
              </div>

              {/* Bold Underlined Table Lead-in */}
              <div className="mt-4 font-bold underline underline-offset-4">
                परीक्षा में उपस्थित/अनुपस्थित नियमित/स्वतन्त्र छात्र–छात्राओं की विवरणी निम्नांकित है :-
              </div>

              {/* Statistical Breakdown Table (5 rows for 12th, 6 rows for 10th) */}
              {isInter ? (
                <table className="mt-3 w-full border-collapse text-[14px] leading-[1.8]">
                  <tbody>
                    {[
                      {
                        num: '1.',
                        node: (
                          <>उत्प्रेषित (Sent-Up)/जाँच परीक्षा में उपस्थित नियमित छात्र–छात्राओं की संख्या</>
                        ),
                        value: interCounts.presentRegular || '00',
                      },
                      {
                        num: '2.',
                        node: <>व्यवसायिक पाठ्यक्रम के परीक्षार्थियों की संख्या</>,
                        value: interCounts.vocational || '00',
                      },
                      {
                        num: '3.',
                        node: (
                          <>अनुपस्थित/अनुत्तीर्ण (Absent/Non Sent-up) नियमित छात्र–छात्राओं की संख्या</>
                        ),
                        value: interCounts.absentNonSentUp || '00',
                      },
                      {
                        num: '4.',
                        node: <>दृष्टिबाधित (Visually Impaired/Blind) छात्र–छात्राओं की संख्या</>,
                        value: interCounts.visuallyImpaired || '00',
                      },
                      {
                        num: '5.',
                        node: <>स्वतन्त्र (Private) छात्र–छात्राओं की संख्या</>,
                        value: interCounts.privateStudents || '00',
                      },
                    ].map((row) => (
                      <tr key={row.num}>
                        <td className="w-7 align-top font-mono pr-1 py-0.5">{row.num}</td>
                        <td className="align-top pr-3 py-0.5">{row.node}</td>
                        <td className="w-8 align-top text-center py-0.5">:-</td>
                        <td className="w-16 align-top text-center font-mono tabular-nums font-semibold py-0.5">
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="mt-3 w-full border-collapse text-[14px] leading-[1.78]">
                  <tbody>
                    {[
                      {
                        num: '1.',
                        node: (
                          <>
                            उत्प्रेषण (Sent-Up)/जाँच परीक्षा में{' '}
                            <strong className="font-bold">उपस्थित नियमित</strong> छात्र–छात्राओं की संख्या
                          </>
                        ),
                        value: matricCounts.presentRegular || '00',
                      },
                      {
                        num: '2.',
                        node: (
                          <>
                            उत्प्रेषण (Sent-Up)/जाँच परीक्षा में{' '}
                            <strong className="font-bold">उपस्थित पूर्ववर्ती</strong> छात्र–छात्राओं की संख्या
                          </>
                        ),
                        value: matricCounts.presentEx || '00',
                      },
                      {
                        num: '3.',
                        node: (
                          <>
                            उत्प्रेषण (Sent-Up)/जाँच परीक्षा में{' '}
                            <strong className="font-bold">अनुपस्थित/अनुत्तीर्ण</strong> छात्र–छात्राओं की संख्या
                          </>
                        ),
                        value: matricCounts.absentFail || '00',
                      },
                      {
                        num: '4.',
                        node: (
                          <>
                            दृष्टिबाधित (Visually Impaired/Blind){' '}
                            <strong className="font-bold">उत्प्रेषित (Sent-Up)</strong> छात्र–छात्राओं की संख्या
                          </>
                        ),
                        value: matricCounts.blindSentUp || '00',
                      },
                      {
                        num: '5.',
                        node: (
                          <>
                            दृष्टिबाधित (Visually Impaired/Blind){' '}
                            <strong className="font-bold">अनुपस्थित/अनुत्तीर्ण</strong> छात्र–छात्राओं की संख्या
                          </>
                        ),
                        value: matricCounts.blindAbsent || '00',
                      },
                      {
                        num: '6.',
                        node: (
                          <>
                            उत्प्रेषण (Sent-Up)/जाँच परीक्षा में{' '}
                            <strong className="font-bold">उपस्थित स्वतन्त्र</strong> (Private) छात्र–छात्राओं की संख्या
                          </>
                        ),
                        value: matricCounts.presentPrivate || '00',
                      },
                    ].map((row) => (
                      <tr key={row.num}>
                        <td className="w-7 align-top font-mono pr-1 py-0.5">{row.num}</td>
                        <td className="align-top pr-3 py-0.5">{row.node}</td>
                        <td className="w-8 align-top text-center py-0.5">:-</td>
                        <td className="w-16 align-top text-center font-mono tabular-nums font-semibold py-0.5">
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Closing Sentence */}
              <p className="mt-5 text-justify indent-10 leading-[1.8]">
                अतः परीक्षोपरान्त विहित प्रपत्र में परीक्षाफल की हार्ड एवं सॉफ्ट कॉपी आवश्यक कार्यार्थ भवदीय को सादर समर्पित।
              </p>

              {/* Footer: Enclosure (Left) & Vishwasbhajan + Principal Signature (Right) */}
              <div className="mt-8 flex items-start justify-between gap-6">
                <div className="pt-1 font-semibold">
                  <span className="font-bold underline underline-offset-4">संलग्नक</span> :- यथोक्त।
                </div>

                <div className="w-64 text-center">
                  <div>विश्वासभाजन</div>
                  <div className="mt-16 leading-[1.7]">
                    <div className="font-semibold">{profile.signatureDesignation}</div>
                    <div>{profile.schoolNameHindi}</div>
                    <div>{profile.blockDistrictHindi}</div>
                  </div>
                </div>
              </div>
            </div>
          </article>
          )}
        </div>
      </div>
    </div>
  );
};
