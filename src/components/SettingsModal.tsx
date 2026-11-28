import React, { useState, useMemo } from 'react';
import {
  X,
  Settings,
  Sparkles,
  Check,
  CheckCircle2,
  Trash2,
  SlidersHorizontal,
  FlaskConical,
  BookOpen,
  Shuffle,
  AlertCircle,
  HelpCircle,
  GraduationCap,
  School,
} from 'lucide-react';
import { AdmitCardRecord, InterSentUpMarks, MatricSentUpMarks } from '../types/admitCard';
import { getEffectiveInterSentUp, getEffectiveMatricSentUp } from '../utils/marksAndFormat';

export interface SubjectConfig {
  subjectName: string;
  hasPractical: boolean;
  maxTheory: number;
  maxPractical: number;
  isMatric?: boolean;
}

interface SettingsModalProps {
  records: AdmitCardRecord[];
  activeModule: 'INTERMEDIATE' | 'MATRIC';
  isOpen: boolean;
  onClose: () => void;
  onUpdateRecords: (updated: AdmitCardRecord[]) => void;
  onSwitchTab?: (tab: 'register' | 'marks' | 'analytics') => void;
  allowRandomMarksGenerator?: boolean;
}

// Default BSEB Practical subjects for 12th Intermediate
const BSEB_12TH_PRACTICAL_PATTERNS = [
  /117|physics/i,
  /118|chemistry/i,
  /119|biology/i,
  /120|agriculture/i,
  /122|computer/i,
  /123|multimedia/i,
  /317|yoga|physical/i,
  /318|music/i,
  /319|home\s*sc|h\.?\s*sc/i,
  /323|geography/i,
  /324|psychology/i,
];

// Helper to generate a random integer in range [min, max]
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  records,
  activeModule,
  isOpen,
  onClose,
  onUpdateRecords,
  onSwitchTab,
  allowRandomMarksGenerator = true,
}) => {
  const [activeTab, setActiveTab] = useState<'TAGGING' | 'RANDOM_POSTING'>('TAGGING');
  const effectiveTab = allowRandomMarksGenerator ? activeTab : 'TAGGING';

  // Filter records for current module or all
  const moduleRecords = useMemo(
    () =>
      records.filter((r) =>
        activeModule === 'INTERMEDIATE'
          ? r.examType === 'INTERMEDIATE (+2)'
          : r.examType === 'MATRIC (10th)'
      ),
    [records, activeModule]
  );

  // Extract all unique subject names present in the current batch
  const uniqueSubjectsInBatch = useMemo(() => {
    const set = new Set<string>();
    moduleRecords.forEach((r) => {
      if (r.langSubject1) set.add(r.langSubject1);
      if (r.langSubject2) set.add(r.langSubject2);
      if (r.compulsorySubject1) set.add(r.compulsorySubject1);
      if (r.compulsorySubject2) set.add(r.compulsorySubject2);
      if (r.compulsorySubject3) set.add(r.compulsorySubject3);
      if (r.compulsorySubject4) set.add(r.compulsorySubject4);
      if (r.additionalSubject) set.add(r.additionalSubject);
    });
    return Array.from(set).filter(Boolean);
  }, [moduleRecords]);

  // State for Subject Practical Tagging Config
  const [subjectConfigs, setSubjectConfigs] = useState<Record<string, SubjectConfig>>(() => {
    const initial: Record<string, SubjectConfig> = {};
    const isMatric = activeModule === 'MATRIC';

    uniqueSubjectsInBatch.forEach((subj) => {
      if (isMatric) {
        if (/science/i.test(subj) && !/social/i.test(subj)) {
          initial[subj] = {
            subjectName: subj,
            hasPractical: true,
            maxTheory: 80,
            maxPractical: 20,
            isMatric: true,
          };
        } else if (/social/i.test(subj)) {
          initial[subj] = {
            subjectName: subj,
            hasPractical: true,
            maxTheory: 80,
            maxPractical: 20, // 10 Literacy + 10 Project Work
            isMatric: true,
          };
        } else {
          initial[subj] = {
            subjectName: subj,
            hasPractical: false,
            maxTheory: 100,
            maxPractical: 0,
            isMatric: true,
          };
        }
      } else {
        const isPrac = BSEB_12TH_PRACTICAL_PATTERNS.some((pat) => pat.test(subj));
        initial[subj] = {
          subjectName: subj,
          hasPractical: isPrac,
          maxTheory: isPrac ? 70 : 100,
          maxPractical: isPrac ? 30 : 0,
          isMatric: false,
        };
      }
    });
    return initial;
  });

  // Random Posting Config State
  const [postingPreset, setPostingPreset] = useState<
    'TOPPER' | 'FIRST_DIV' | 'SECOND_DIV' | 'MIXED_BSEB'
  >('MIXED_BSEB');
  const [includeAbsentees, setIncludeAbsentees] = useState<boolean>(false);
  const [overwriteExisting, setOverwriteExisting] = useState<boolean>(true);
  const [noticeMessage, setNoticeMessage] = useState<string>('');

  if (!isOpen) return null;

  const toggleSubjectPractical = (subj: string) => {
    setSubjectConfigs((prev) => {
      const cur = prev[subj] || {
        subjectName: subj,
        hasPractical: false,
        maxTheory: 100,
        maxPractical: 0,
      };
      const nextHasPrac = !cur.hasPractical;
      return {
        ...prev,
        [subj]: {
          ...cur,
          hasPractical: nextHasPrac,
          maxTheory: nextHasPrac ? (activeModule === 'MATRIC' ? 80 : 70) : 100,
          maxPractical: nextHasPrac ? (activeModule === 'MATRIC' ? 20 : 30) : 0,
        },
      };
    });
  };

  // 1-Click Mass Fill Marks Engine
  const handleGenerateRandomMarks = () => {
    if (!allowRandomMarksGenerator) {
      setNoticeMessage('Random Marks Generator is disabled by Super Admin.');
      return;
    }
    if (records.length === 0) {
      setNoticeMessage('Error: No student records available to populate marks.');
      return;
    }

    let updatedCount = 0;
    const isMatric = activeModule === 'MATRIC';

    const updatedRecords = records.map((rec) => {
      // Check if record belongs to active module
      const isTarget = isMatric
        ? rec.examType === 'MATRIC (10th)'
        : rec.examType === 'INTERMEDIATE (+2)';

      if (!isTarget) return rec;

      // Check if absentees should be simulated (~3% chance)
      const isRandomAbsent = includeAbsentees && Math.random() < 0.03;

      if (isMatric) {
        const curMatric = getEffectiveMatricSentUp(rec);
        if (!overwriteExisting && curMatric.hasAnyMarks) {
          return rec;
        }

        const milSubj = rec.langSubject1 || 'MIL - HINDI';
        const silSubj = rec.langSubject2 || 'SIL - SANSKRIT';
        const matSubj = rec.compulsorySubject1 || 'MATHEMATICS';
        const sscSubj = rec.compulsorySubject2 || 'SOCIAL SCIENCE';
        const sciSubj = rec.compulsorySubject3 || 'SCIENCE';
        const engSubj = rec.compulsorySubject4 || 'ENGLISH';

        const hasOpt = Boolean(
          rec.additionalSubject &&
          rec.additionalSubject.trim() !== '' &&
          rec.additionalSubject.trim() !== '---'
        );

        if (isRandomAbsent) {
          updatedCount++;
          const subjMarksDict: Record<string, string> = {
            ...(rec.subjectMarks || {}),
            [milSubj]: 'AB',
            [silSubj]: 'AB',
            [matSubj]: 'AB',
            [sciSubj]: 'AB',
            [sscSubj]: 'AB',
            [engSubj]: 'AB',
          };
          if (hasOpt) {
            subjMarksDict[rec.additionalSubject!.trim()] = 'AB';
          }
          return {
            ...rec,
            subjectMarks: subjMarksDict,
            matricSentUp: {
              milTheory: 'AB',
              silTheory: 'AB',
              matTheory: 'AB',
              sciTheory: 'AB',
              sscTheory: 'AB',
              engTheory: 'AB',
              optTheory: hasOpt ? 'AB' : '---',
              vocTheory: '---',
              sciPractical: 'AB',
              sscLitAct: 'AB',
              sscPrWork: 'AB',
              optPractical: hasOpt ? 'AB' : '---',
              vocPractical: '---',
            },
          };
        }

        // Determine mark range percentage multiplier per student profile
        let thPctMin = 0.55;
        let thPctMax = 0.85;

        if (postingPreset === 'TOPPER') {
          thPctMin = 0.75;
          thPctMax = 0.95;
        } else if (postingPreset === 'FIRST_DIV') {
          thPctMin = 0.62;
          thPctMax = 0.82;
        } else if (postingPreset === 'SECOND_DIV') {
          thPctMin = 0.48;
          thPctMax = 0.62;
        } else if (postingPreset === 'MIXED_BSEB') {
          const rand = Math.random();
          if (rand < 0.7) {
            thPctMin = 0.62;
            thPctMax = 0.88;
          } else if (rand < 0.92) {
            thPctMin = 0.48;
            thPctMax = 0.61;
          } else {
            thPctMin = 0.35;
            thPctMax = 0.47;
          }
        }

        // Generate Matric Marks:
        // MIL, SIL, MAT, ENG: Theory out of 100
        const mil = randInt(Math.round(100 * thPctMin), Math.round(100 * thPctMax));
        const sil = randInt(Math.round(100 * thPctMin), Math.round(100 * thPctMax));
        const mat = randInt(Math.round(100 * thPctMin), Math.round(100 * thPctMax));
        const eng = randInt(Math.round(100 * thPctMin), Math.round(100 * thPctMax));

        // SCI: Theory out of 80 + Practical out of 20
        const sciTh = randInt(Math.round(80 * thPctMin), Math.round(80 * thPctMax));
        const sciPr = randInt(15, 19);

        // SSC: Theory out of 80 + Literacy (10) + Project Work (10)
        const sscTh = randInt(Math.round(80 * thPctMin), Math.round(80 * thPctMax));
        const sscLit = randInt(8, 10);
        const sscPr = randInt(8, 10);

        const sciTot = sciTh + sciPr;
        const sscTot = sscTh + sscLit + sscPr;

        let optTh = '---';
        let optPr = '---';
        if (hasOpt) {
          const optVal = randInt(Math.round(100 * thPctMin), Math.round(100 * thPctMax));
          optTh = String(optVal);
        }

        const subjMarksDict: Record<string, string> = {
          ...(rec.subjectMarks || {}),
          [milSubj]: String(mil),
          [silSubj]: String(sil),
          [matSubj]: String(mat),
          [sciSubj]: String(sciTot),
          [sscSubj]: String(sscTot),
          [engSubj]: String(eng),
          'HINDI': String(mil),
          'SANSKRIT': String(sil),
          'MATHEMATICS': String(mat),
          'SCIENCE': String(sciTot),
          'SOCIAL SCIENCE': String(sscTot),
          'ENGLISH': String(eng),
        };
        if (hasOpt && optTh !== '---') {
          subjMarksDict[rec.additionalSubject!.trim()] = optTh;
        }

        updatedCount++;
        return {
          ...rec,
          subjectMarks: subjMarksDict,
          matricSentUp: {
            milTheory: String(mil),
            silTheory: String(sil),
            matTheory: String(mat),
            sciTheory: String(sciTh),
            sscTheory: String(sscTh),
            engTheory: String(eng),
            optTheory: optTh,
            vocTheory: '---',
            sciPractical: String(sciPr),
            sscLitAct: String(sscLit),
            sscPrWork: String(sscPr),
            optPractical: optPr,
            vocPractical: '---',
          },
        };
      } else {
        // 12th Intermediate Marks Posting
        const curInter = getEffectiveInterSentUp(rec);
        if (!overwriteExisting && curInter.hasAnyMarks) {
          return rec;
        }

        const l1Subj = rec.langSubject1 || '306-Hindi';
        const l2Subj = rec.langSubject2 || '305-English';
        const e1Subj = rec.compulsorySubject1 || '117-PHYSICS';
        const e2Subj = rec.compulsorySubject2 || '118-CHEMISTRY';
        const e3Subj = rec.compulsorySubject3 || '119-BIOLOGY';
        const hasAdditional = Boolean(
          rec.additionalSubject &&
          rec.additionalSubject.trim() !== '' &&
          rec.additionalSubject.trim() !== '---'
        );

        if (isRandomAbsent) {
          updatedCount++;
          const subjMarksDict: Record<string, string> = {
            ...(rec.subjectMarks || {}),
            [l1Subj]: 'AB',
            [l2Subj]: 'AB',
            [e1Subj]: 'AB',
            [e2Subj]: 'AB',
            [e3Subj]: 'AB',
          };
          if (hasAdditional) {
            subjMarksDict[rec.additionalSubject!.trim()] = 'AB';
          }
          return {
            ...rec,
            subjectMarks: subjMarksDict,
            interSentUp: {
              lang1Subject: l1Subj,
              lang1Marks: 'AB',
              lang2Subject: l2Subj,
              lang2Marks: 'AB',
              elective1Subject: e1Subj,
              elective1Theory: 'AB',
              elective1Practical: 'AB',
              elective2Subject: e2Subj,
              elective2Theory: 'AB',
              elective2Practical: 'AB',
              elective3Subject: e3Subj,
              elective3Theory: 'AB',
              elective3Practical: 'AB',
              additionalSubject: rec.additionalSubject || '---',
              additionalTheory: hasAdditional ? 'AB' : '---',
              additionalPractical: hasAdditional ? 'AB' : '---',
              vocationalSubject: '---',
              vocationalTheory: '---',
              vocationalPractical: '---',
              resultStatus: 'NON SENT-UP',
            },
          };
        }

        // Multipliers
        let thPctMin = 0.58;
        let thPctMax = 0.86;

        if (postingPreset === 'TOPPER') {
          thPctMin = 0.75;
          thPctMax = 0.94;
        } else if (postingPreset === 'FIRST_DIV') {
          thPctMin = 0.62;
          thPctMax = 0.82;
        } else if (postingPreset === 'SECOND_DIV') {
          thPctMin = 0.48;
          thPctMax = 0.61;
        } else if (postingPreset === 'MIXED_BSEB') {
          const rand = Math.random();
          if (rand < 0.7) {
            thPctMin = 0.62;
            thPctMax = 0.88;
          } else if (rand < 0.92) {
            thPctMin = 0.48;
            thPctMax = 0.61;
          } else {
            thPctMin = 0.35;
            thPctMax = 0.47;
          }
        }

        // Lang 1 & Lang 2: Out of 100
        const l1 = randInt(Math.round(100 * thPctMin), Math.round(100 * thPctMax));
        const l2 = randInt(Math.round(100 * thPctMin), Math.round(100 * thPctMax));

        // Helper to generate theory + practical for electives & additional
        const genInterSubjMarks = (subjName: string) => {
          const config = subjectConfigs[subjName];
          const isPrac = config ? config.hasPractical : BSEB_12TH_PRACTICAL_PATTERNS.some((p) => p.test(subjName));
          if (isPrac) {
            const th = randInt(Math.round(70 * thPctMin), Math.round(70 * thPctMax));
            const pr = randInt(22, 29);
            return { th: String(th), pr: String(pr) };
          } else {
            const th = randInt(Math.round(100 * thPctMin), Math.round(100 * thPctMax));
            return { th: String(th), pr: '0' };
          }
        };

        const e1 = genInterSubjMarks(e1Subj);
        const e2 = genInterSubjMarks(e2Subj);
        const e3 = genInterSubjMarks(e3Subj);

        const e1Tot = Number(e1.th) + (Number(e1.pr) || 0);
        const e2Tot = Number(e2.th) + (Number(e2.pr) || 0);
        const e3Tot = Number(e3.th) + (Number(e3.pr) || 0);

        let addTheory = '---';
        let addPractical = '---';
        let addTotStr = '';

        if (hasAdditional) {
          const addSubj = rec.additionalSubject!.trim();
          const addGen = genInterSubjMarks(addSubj);
          addTheory = addGen.th;
          addPractical = addGen.pr;
          const addTot = Number(addGen.th) + (Number(addGen.pr) || 0);
          addTotStr = String(addTot);
        }

        const subjMarksDict: Record<string, string> = {
          ...(rec.subjectMarks || {}),
          [l1Subj]: String(l1),
          [l2Subj]: String(l2),
          [e1Subj]: String(e1Tot),
          [e2Subj]: String(e2Tot),
          [e3Subj]: String(e3Tot),
        };

        if (hasAdditional && addTotStr) {
          subjMarksDict[rec.additionalSubject!.trim()] = addTotStr;
        }

        updatedCount++;
        return {
          ...rec,
          subjectMarks: subjMarksDict,
          interSentUp: {
            lang1Subject: l1Subj,
            lang1Marks: String(l1),
            lang2Subject: l2Subj,
            lang2Marks: String(l2),
            elective1Subject: e1Subj,
            elective1Theory: e1.th,
            elective1Practical: e1.pr,
            elective2Subject: e2Subj,
            elective2Theory: e2.th,
            elective2Practical: e2.pr,
            elective3Subject: e3Subj,
            elective3Theory: e3.th,
            elective3Practical: e3.pr,
            additionalSubject: rec.additionalSubject || '---',
            additionalTheory: addTheory,
            additionalPractical: addPractical,
            vocationalSubject: '---',
            vocationalTheory: '---',
            vocationalPractical: '---',
            resultStatus: 'SENT-UP',
          },
        };
      }
    });

    onUpdateRecords(updatedRecords);
    setNoticeMessage(
      `✓ Successfully updated random marks for ${updatedCount} ${activeModule === 'MATRIC' ? '10th Matric' : '12th Intermediate'} students.`
    );
  };

  // Reset / Clear All Marks for Active Module
  const handleClearAllModuleMarks = () => {
    const isMatric = activeModule === 'MATRIC';
    const updatedRecords = records.map((rec) => {
      const isTarget = isMatric
        ? rec.examType === 'MATRIC (10th)'
        : rec.examType === 'INTERMEDIATE (+2)';
      if (!isTarget) return rec;

      if (isMatric) {
        return {
          ...rec,
          matricSentUp: undefined,
          subjectMarks: {},
        };
      } else {
        return {
          ...rec,
          interSentUp: undefined,
          subjectMarks: {},
        };
      }
    });

    onUpdateRecords(updatedRecords);
    setNoticeMessage(
      `✓ Reset all marks to blank for ${activeModule === 'MATRIC' ? '10th Matric' : '12th Intermediate'} records.`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-3xl border border-indigo-100 bg-white shadow-2xl overflow-hidden">
        {/* Modal Top AppBar Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-indigo-50 bg-[#F6F8FD] px-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xs">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-indigo-950">
                {allowRandomMarksGenerator
                  ? 'Settings & Random Marks Posting'
                  : 'Subject Practical Tagging Settings'}
              </h2>
              <p className="text-xs text-indigo-800">
                {allowRandomMarksGenerator
                  ? `Subject Tagging & 1-Click Mass Marks Generator (${activeModule === 'MATRIC' ? '10th Matric' : '12th Intermediate'})`
                  : `Configure Practical vs Theory Subjects (${activeModule === 'MATRIC' ? '10th Matric' : '12th Intermediate'})`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200/80 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Switcher (Subject Tagging vs Random Posting) */}
        <div className="flex shrink-0 border-b border-indigo-100 bg-white px-5 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('TAGGING')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              effectiveTab === 'TAGGING'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FlaskConical className="h-4 w-4" />
            <span>Subject Practical Tagging ({uniqueSubjectsInBatch.length})</span>
          </button>
          {allowRandomMarksGenerator && (
            <button
              type="button"
              onClick={() => setActiveTab('RANDOM_POSTING')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
                effectiveTab === 'RANDOM_POSTING'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <span>1-Click Random Marks Generator</span>
            </button>
          )}
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs text-slate-700">
          {noticeMessage && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-950 font-semibold animate-in fade-in shadow-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <span className="text-xs">{noticeMessage}</span>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                {onSwitchTab && (
                  <button
                    type="button"
                    onClick={() => {
                      onSwitchTab('marks');
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-800 shrink-0"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>View Marks Panji</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNoticeMessage('')}
                  className="text-emerald-700 hover:underline text-[11px] font-bold px-1"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {effectiveTab === 'TAGGING' ? (
            /* Tab 1: Subject Practical vs Non-Practical Tagging */
            <div className="space-y-4">
              <div className="rounded-2xl bg-indigo-50/70 border border-indigo-100 p-3.5 space-y-1">
                <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                  <HelpCircle className="h-4 w-4 text-indigo-600" />
                  <span>Subject Practical Rules ({activeModule === 'MATRIC' ? '10th Matric' : '12th Intermediate'})</span>
                </div>
                <p className="text-slate-600 text-[11px]">
                  {activeModule === 'MATRIC'
                    ? '10th Science: 80 Theory + 20 Practical. Social Science: 80 Theory + 10 Literacy + 10 Project Work. Other subjects: 100 Theory.'
                    : '12th Science & Arts Practical subjects (Physics, Chemistry, Biology, Geography, Home Science, etc.): 70 Theory + 30 Practical.'}
                </p>
              </div>

              {uniqueSubjectsInBatch.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                  No subjects detected yet in uploaded cards. Upload an Admit Card PDF or add students to configure subject tagging.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">
                    <span>Subject Name</span>
                    <span>Practical Tag & Max Marks</span>
                  </div>

                  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
                    {uniqueSubjectsInBatch.map((subj) => {
                      const cfg = subjectConfigs[subj] || {
                        subjectName: subj,
                        hasPractical: false,
                        maxTheory: 100,
                        maxPractical: 0,
                      };
                      return (
                        <div
                          key={subj}
                          className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50/80 transition-colors"
                        >
                          <div className="font-bold text-slate-900 min-w-0 truncate">
                            {subj}
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-[11px] text-slate-500 font-semibold">
                              {cfg.hasPractical
                                ? `${cfg.maxTheory} Th + ${cfg.maxPractical} Pr`
                                : '100 Theory'}
                            </span>

                            <button
                              type="button"
                              onClick={() => toggleSubjectPractical(subj)}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                cfg.hasPractical ? 'bg-indigo-600' : 'bg-slate-300'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                                  cfg.hasPractical ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Tab 2: 1-Click Random Marks Posting Engine */
            <div className="space-y-5">
              <div className="rounded-2xl bg-indigo-50/70 border border-indigo-100 p-4 space-y-2">
                <div className="font-bold text-indigo-950 text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  <span>1-Click Random Marks Generator</span>
                </div>
                <p className="text-slate-600 text-xs">
                  Populate realistic BSEB Sent-Up marks across all {moduleRecords.length} loaded {activeModule === 'MATRIC' ? '10th Matric' : '12th Intermediate'} students in 1 click.
                </p>
              </div>

              {/* Preset Selector Cards */}
              <div className="space-y-2">
                <label className="font-bold text-slate-900 block">Select Marks Generation Preset Profile:</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPostingPreset('MIXED_BSEB')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      postingPreset === 'MIXED_BSEB'
                        ? 'border-indigo-600 bg-indigo-50/80 shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-indigo-950 flex items-center justify-between">
                      <span>🎲 Realistic BSEB Pattern</span>
                      {postingPreset === 'MIXED_BSEB' && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      70% First Div (60%+), 22% Second Div (45%-59%), 8% Pass Div.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPostingPreset('TOPPER')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      postingPreset === 'TOPPER'
                        ? 'border-indigo-600 bg-indigo-50/80 shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-indigo-950 flex items-center justify-between">
                      <span>🥇 Toppers / High Scorers</span>
                      {postingPreset === 'TOPPER' && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      75% - 95% Marks across all subjects (Ideal for top rankers).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPostingPreset('FIRST_DIV')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      postingPreset === 'FIRST_DIV'
                        ? 'border-indigo-600 bg-indigo-50/80 shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-indigo-950 flex items-center justify-between">
                      <span>🥈 First Division Profile</span>
                      {postingPreset === 'FIRST_DIV' && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      62% - 82% Marks across all subjects.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPostingPreset('SECOND_DIV')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      postingPreset === 'SECOND_DIV'
                        ? 'border-indigo-600 bg-indigo-50/80 shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-indigo-950 flex items-center justify-between">
                      <span>🥉 Second Division Profile</span>
                      {postingPreset === 'SECOND_DIV' && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      48% - 62% Marks across all subjects.
                    </p>
                  </button>
                </div>
              </div>

              {/* Simulation Options */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAbsentees}
                    onChange={(e) => setIncludeAbsentees(e.target.checked)}
                    className="h-4 w-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-slate-800">
                    Randomly mark ~3% students as Absent / Non-SentUp
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overwriteExisting}
                    onChange={(e) => setOverwriteExisting(e.target.checked)}
                    className="h-4 w-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-slate-800">
                    Overwrite existing entered marks (If unchecked, only fills blank student rows)
                  </span>
                </label>
              </div>

              {/* 1-Click Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={handleGenerateRandomMarks}
                  disabled={moduleRecords.length === 0}
                  className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-indigo-700 active:scale-98 disabled:opacity-40"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>1-Click Generate & Apply Marks ({moduleRecords.length} Students)</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearAllModuleMarks}
                  disabled={moduleRecords.length === 0}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-5 py-3 text-xs font-bold text-rose-800 hover:bg-rose-100 active:scale-98 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4 text-rose-600" />
                  <span>Clear All Marks</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex shrink-0 items-center justify-end border-t border-slate-100 bg-slate-50 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-indigo-600 px-6 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
