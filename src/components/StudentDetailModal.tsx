import React, { useState } from 'react';
import { X, Save, Check, User, FileText } from 'lucide-react';
import { AdmitCardRecord, ExamType, FacultyType } from '../types/admitCard';
import {
  calculateStudentMarksSummary,
  getEffectiveInterSentUp,
  getEffectiveMatricSentUp,
} from '../utils/marksAndFormat';

interface StudentDetailModalProps {
  record: AdmitCardRecord;
  onClose: () => void;
  onSave: (updated: AdmitCardRecord) => void;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  record,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<AdmitCardRecord>({ ...record });
  const [savedNotice, setSavedNotice] = useState(false);

  const handleChange = (field: keyof AdmitCardRecord, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      const allSubjects = [
        next.langSubject1,
        next.langSubject2,
        next.compulsorySubject1,
        next.compulsorySubject2,
        next.compulsorySubject3,
        next.compulsorySubject4,
        next.additionalSubject,
      ].filter(Boolean);
      next.allSubjectsSummary = allSubjects.join(', ');
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 300);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-student-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="modal-student-title" className="text-lg font-semibold text-slate-900">
              Student Admit Card Details &amp; Correction
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              <span>Serial #{formData.serialNo}</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span>Source: {formData.sourceFileName} (Page {formData.sourcePageNumber})</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">BSEB ID: {formData.bsebUniqueId || 'N/A'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close student details modal"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column: Photo & Signature Preview */}
            <div className="flex flex-col items-center justify-start rounded-lg border border-slate-200 bg-slate-50 p-4 lg:col-span-3">
              <div className="text-xs font-medium text-slate-600 mb-2">Extracted Photograph</div>
              {formData.photoDataUrl ? (
                <img
                  src={formData.photoDataUrl}
                  alt={`${formData.studentName} photograph`}
                  referrerPolicy="no-referrer"
                  className="h-36 w-28 rounded border border-slate-300 bg-white object-contain p-0.5"
                />
              ) : (
                <div className="flex h-36 w-28 flex-col items-center justify-center rounded border border-dashed border-slate-300 bg-white text-slate-400">
                  <User className="h-8 w-8 mb-1" />
                  <span className="text-[11px]">No Photo</span>
                </div>
              )}

              <div className="text-xs font-medium text-slate-600 mt-4 mb-1.5">Extracted Signature</div>
              {formData.signatureDataUrl ? (
                <img
                  src={formData.signatureDataUrl}
                  alt={`${formData.studentName} signature`}
                  referrerPolicy="no-referrer"
                  className="h-12 w-36 rounded border border-slate-300 bg-white object-contain p-0.5"
                />
              ) : (
                <div className="flex h-12 w-36 items-center justify-center rounded border border-dashed border-slate-300 bg-white text-[11px] text-slate-400">
                  No Signature
                </div>
              )}

              <div className="mt-4 w-full border-t border-slate-200 pt-3 text-left text-xs text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>Exam:</span>
                  <span className="font-medium text-slate-800">{formData.examType}</span>
                </div>
                <div className="flex justify-between">
                  <span>Stream:</span>
                  <span className="font-medium text-slate-800">{formData.faculty}</span>
                </div>
                <div className="flex justify-between">
                  <span>Page No:</span>
                  <span className="font-mono tabular-nums font-medium text-slate-800">
                    {formData.sourcePageNumber}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Editable Fields */}
            <div className="space-y-5 lg:col-span-9">
              <div>
                <h3 className="text-xs font-semibold text-slate-900 pb-2 border-b border-slate-200">
                  01. Candidate &amp; Institution Details
                </h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="edit-bseb-id" className="block text-xs font-medium text-slate-700">
                      BSEB Unique ID
                    </label>
                    <input
                      id="edit-bseb-id"
                      type="text"
                      value={formData.bsebUniqueId}
                      onChange={(e) => handleChange('bsebUniqueId', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-exam-type" className="block text-xs font-medium text-slate-700">
                      Exam Type
                    </label>
                    <select
                      id="edit-exam-type"
                      value={formData.examType}
                      onChange={(e) => handleChange('examType', e.target.value as ExamType)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    >
                      <option value="MATRIC (10th)">MATRIC (10th)</option>
                      <option value="INTERMEDIATE (+2)">INTERMEDIATE (+2)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-faculty" className="block text-xs font-medium text-slate-700">
                      Faculty / Stream
                    </label>
                    <select
                      id="edit-faculty"
                      value={formData.faculty}
                      onChange={(e) => handleChange('faculty', e.target.value as FacultyType)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    >
                      <option value="SECONDARY">SECONDARY (10th)</option>
                      <option value="ARTS">ARTS</option>
                      <option value="SCIENCE">SCIENCE</option>
                      <option value="COMMERCE">COMMERCE</option>
                      <option value="VOCATIONAL">VOCATIONAL</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="edit-school-name" className="block text-xs font-medium text-slate-700">
                      School / +2 College Name
                    </label>
                    <input
                      id="edit-school-name"
                      type="text"
                      value={formData.schoolName}
                      onChange={(e) => handleChange('schoolName', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-roll-code" className="block text-xs font-medium text-slate-700">
                      School / Roll Code
                    </label>
                    <input
                      id="edit-roll-code"
                      type="text"
                      value={formData.rollCode}
                      onChange={(e) => handleChange('rollCode', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-student-name" className="block text-xs font-medium text-slate-700">
                      Student Name
                    </label>
                    <input
                      id="edit-student-name"
                      type="text"
                      value={formData.studentName}
                      onChange={(e) => handleChange('studentName', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-father-name" className="block text-xs font-medium text-slate-700">
                      Father&apos;s Name
                    </label>
                    <input
                      id="edit-father-name"
                      type="text"
                      value={formData.fatherName}
                      onChange={(e) => handleChange('fatherName', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-mother-name" className="block text-xs font-medium text-slate-700">
                      Mother&apos;s Name
                    </label>
                    <input
                      id="edit-mother-name"
                      type="text"
                      value={formData.motherName}
                      onChange={(e) => handleChange('motherName', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-dob" className="block text-xs font-medium text-slate-700">
                      Date of Birth (DD/MM/YYYY)
                    </label>
                    <input
                      id="edit-dob"
                      type="text"
                      value={formData.dob}
                      onChange={(e) => handleChange('dob', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-gender" className="block text-xs font-medium text-slate-700">
                      Gender
                    </label>
                    <select
                      id="edit-gender"
                      value={formData.gender}
                      onChange={(e) =>
                        handleChange('gender', e.target.value as 'MALE' | 'FEMALE' | 'OTHER')
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    >
                      <option value="MALE">MALE</option>
                      <option value="FEMALE">FEMALE</option>
                      <option value="OTHER">OTHER</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-marital" className="block text-xs font-medium text-slate-700">
                      Marital Status
                    </label>
                    <input
                      id="edit-marital"
                      type="text"
                      value={formData.maritalStatus}
                      onChange={(e) => handleChange('maritalStatus', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-aadhaar" className="block text-xs font-medium text-slate-700">
                      Aadhaar Number
                    </label>
                    <input
                      id="edit-aadhaar"
                      type="text"
                      value={formData.aadhaarNo}
                      onChange={(e) => handleChange('aadhaarNo', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-reg-no" className="block text-xs font-medium text-slate-700">
                      Registration / Listing No.
                    </label>
                    <input
                      id="edit-reg-no"
                      type="text"
                      value={formData.registrationNo}
                      onChange={(e) => handleChange('registrationNo', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-roll-no" className="block text-xs font-medium text-slate-700">
                      Roll Number
                    </label>
                    <input
                      id="edit-roll-no"
                      type="text"
                      value={formData.rollNumber}
                      onChange={(e) => handleChange('rollNumber', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-category" className="block text-xs font-medium text-slate-700">
                      Student Category
                    </label>
                    <input
                      id="edit-category"
                      type="text"
                      value={formData.studentCategory}
                      onChange={(e) => handleChange('studentCategory', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-caste" className="block text-xs font-medium text-slate-700">
                      Caste Category
                    </label>
                    <input
                      id="edit-caste"
                      type="text"
                      value={formData.casteCategory}
                      onChange={(e) => handleChange('casteCategory', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-divyang" className="block text-xs font-medium text-slate-700">
                      Divyang (PwD)
                    </label>
                    <input
                      id="edit-divyang"
                      type="text"
                      value={formData.differentlyAbled}
                      onChange={(e) => handleChange('differentlyAbled', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <h3 className="text-xs font-semibold text-slate-900">
                    02. Individual Subject Marks &amp; Praptank Panji Correction ({formData.examType})
                  </h3>
                  <span className="text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                    {(() => {
                      const summary = calculateStudentMarksSummary(formData);
                      return summary.enteredCount > 0
                        ? `Total: ${summary.totalMarks}/500 (${summary.percentage} - ${summary.division})`
                        : 'No Marks Entered Yet';
                    })()}
                  </span>
                </div>

                {formData.examType === 'INTERMEDIATE (+2)' ? (
                  /* 12th Intermediate Detailed Marks Editor */
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Language 1 & 2 */}
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
                        <span className="font-bold text-xs text-indigo-950 block">Compulsory Languages (100 Marks Each)</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 truncate">
                              {formData.langSubject1 || '306-Hindi'}
                            </label>
                            <input
                              type="text"
                              placeholder="Marks"
                              value={(() => {
                                const v = formData.interSentUp?.lang1Marks ?? (formData.subjectMarks?.[formData.langSubject1 || '306-Hindi'] || '');
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const val = e.target.value;
                                const l1Name = formData.langSubject1 || '306-Hindi';
                                setFormData((prev) => {
                                  const eff = getEffectiveInterSentUp(prev);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [l1Name]: val },
                                    interSentUp: { ...eff, lang1Marks: val },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 truncate">
                              {formData.langSubject2 || '305-English'}
                            </label>
                            <input
                              type="text"
                              placeholder="Marks"
                              value={(() => {
                                const v = formData.interSentUp?.lang2Marks ?? (formData.subjectMarks?.[formData.langSubject2 || '305-English'] || '');
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const val = e.target.value;
                                const l2Name = formData.langSubject2 || '305-English';
                                setFormData((prev) => {
                                  const eff = getEffectiveInterSentUp(prev);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [l2Name]: val },
                                    interSentUp: { ...eff, lang2Marks: val },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Elective 1 */}
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
                        <span className="font-bold text-xs text-indigo-950 block truncate">
                          Elective 1: {formData.compulsorySubject1 || '117-PHYSICS'}
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600">Theory</label>
                            <input
                              type="text"
                              placeholder="Theory"
                              value={(() => {
                                const v = formData.interSentUp?.elective1Theory ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const thVal = e.target.value;
                                const e1Name = formData.compulsorySubject1 || '117-PHYSICS';
                                setFormData((prev) => {
                                  const eff = getEffectiveInterSentUp(prev);
                                  const prVal = eff.elective1Practical || '';
                                  const tot = (Number(thVal) || 0) + (Number(prVal) || 0);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [e1Name]: String(tot) },
                                    interSentUp: { ...eff, elective1Theory: thVal },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600">Practical</label>
                            <input
                              type="text"
                              placeholder="Practical"
                              value={(() => {
                                const v = formData.interSentUp?.elective1Practical ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const prVal = e.target.value;
                                const e1Name = formData.compulsorySubject1 || '117-PHYSICS';
                                setFormData((prev) => {
                                  const eff = getEffectiveInterSentUp(prev);
                                  const thVal = eff.elective1Theory || '';
                                  const tot = (Number(thVal) || 0) + (Number(prVal) || 0);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [e1Name]: String(tot) },
                                    interSentUp: { ...eff, elective1Practical: prVal },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Elective 2 */}
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
                        <span className="font-bold text-xs text-indigo-950 block truncate">
                          Elective 2: {formData.compulsorySubject2 || '118-CHEMISTRY'}
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600">Theory</label>
                            <input
                              type="text"
                              placeholder="Theory"
                              value={(() => {
                                const v = formData.interSentUp?.elective2Theory ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const thVal = e.target.value;
                                const e2Name = formData.compulsorySubject2 || '118-CHEMISTRY';
                                setFormData((prev) => {
                                  const eff = getEffectiveInterSentUp(prev);
                                  const prVal = eff.elective2Practical || '';
                                  const tot = (Number(thVal) || 0) + (Number(prVal) || 0);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [e2Name]: String(tot) },
                                    interSentUp: { ...eff, elective2Theory: thVal },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600">Practical</label>
                            <input
                              type="text"
                              placeholder="Practical"
                              value={(() => {
                                const v = formData.interSentUp?.elective2Practical ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const prVal = e.target.value;
                                const e2Name = formData.compulsorySubject2 || '118-CHEMISTRY';
                                setFormData((prev) => {
                                  const eff = getEffectiveInterSentUp(prev);
                                  const thVal = eff.elective2Theory || '';
                                  const tot = (Number(thVal) || 0) + (Number(prVal) || 0);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [e2Name]: String(tot) },
                                    interSentUp: { ...eff, elective2Practical: prVal },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Elective 3 */}
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
                        <span className="font-bold text-xs text-indigo-950 block truncate">
                          Elective 3: {formData.compulsorySubject3 || '119-BIOLOGY'}
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600">Theory</label>
                            <input
                              type="text"
                              placeholder="Theory"
                              value={(() => {
                                const v = formData.interSentUp?.elective3Theory ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const thVal = e.target.value;
                                const e3Name = formData.compulsorySubject3 || '119-BIOLOGY';
                                setFormData((prev) => {
                                  const eff = getEffectiveInterSentUp(prev);
                                  const prVal = eff.elective3Practical || '';
                                  const tot = (Number(thVal) || 0) + (Number(prVal) || 0);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [e3Name]: String(tot) },
                                    interSentUp: { ...eff, elective3Theory: thVal },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600">Practical</label>
                            <input
                              type="text"
                              placeholder="Practical"
                              value={(() => {
                                const v = formData.interSentUp?.elective3Practical ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const prVal = e.target.value;
                                const e3Name = formData.compulsorySubject3 || '119-BIOLOGY';
                                setFormData((prev) => {
                                  const eff = getEffectiveInterSentUp(prev);
                                  const thVal = eff.elective3Theory || '';
                                  const tot = (Number(thVal) || 0) + (Number(prVal) || 0);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [e3Name]: String(tot) },
                                    interSentUp: { ...eff, elective3Practical: prVal },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Additional Subject */}
                      {formData.additionalSubject && formData.additionalSubject !== '---' && (
                        <div className="col-span-1 sm:col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
                          <span className="font-bold text-xs text-indigo-950 block truncate">
                            Additional Subject: {formData.additionalSubject}
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600">Theory</label>
                              <input
                                type="text"
                                placeholder="Theory"
                                value={(() => {
                                  const v = formData.interSentUp?.additionalTheory ?? '';
                                  return v === '---' || v === '--' ? '' : v;
                                })()}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  const thVal = e.target.value;
                                  const addName = formData.additionalSubject!;
                                  setFormData((prev) => {
                                    const eff = getEffectiveInterSentUp(prev);
                                    const prVal = eff.additionalPractical || '';
                                    const tot = (Number(thVal) || 0) + (Number(prVal) || 0);
                                    return {
                                      ...prev,
                                      subjectMarks: { ...(prev.subjectMarks || {}), [addName]: String(tot) },
                                      interSentUp: { ...eff, additionalTheory: thVal },
                                    };
                                  });
                                }}
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600">Practical</label>
                              <input
                                type="text"
                                placeholder="Practical"
                                value={(() => {
                                  const v = formData.interSentUp?.additionalPractical ?? '';
                                  return v === '---' || v === '--' ? '' : v;
                                })()}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  const prVal = e.target.value;
                                  const addName = formData.additionalSubject!;
                                  setFormData((prev) => {
                                    const eff = getEffectiveInterSentUp(prev);
                                    const thVal = eff.additionalTheory || '';
                                    const tot = (Number(thVal) || 0) + (Number(prVal) || 0);
                                    return {
                                      ...prev,
                                      subjectMarks: { ...(prev.subjectMarks || {}), [addName]: String(tot) },
                                      interSentUp: { ...eff, additionalPractical: prVal },
                                    };
                                  });
                                }}
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* 10th Matric Detailed Marks Editor */
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* MIL, SIL, MAT, ENG */}
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-2 col-span-1 sm:col-span-2">
                        <span className="font-bold text-xs text-emerald-950 block">Theory Subjects (100 Marks Each)</span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 truncate">
                              MIL: {formData.langSubject1 || 'HINDI'}
                            </label>
                            <input
                              type="text"
                              placeholder="MIL Theory"
                              value={(() => {
                                const v = formData.matricSentUp?.milTheory ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const val = e.target.value;
                                const milSubj = formData.langSubject1 || 'MIL - HINDI';
                                setFormData((prev) => {
                                  const eff = getEffectiveMatricSentUp(prev);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [milSubj]: val },
                                    matricSentUp: { ...eff, milTheory: val },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 truncate">
                              SIL: {formData.langSubject2 || 'SANSKRIT'}
                            </label>
                            <input
                              type="text"
                              placeholder="SIL Theory"
                              value={(() => {
                                const v = formData.matricSentUp?.silTheory ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const val = e.target.value;
                                const silSubj = formData.langSubject2 || 'SIL - SANSKRIT';
                                setFormData((prev) => {
                                  const eff = getEffectiveMatricSentUp(prev);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [silSubj]: val },
                                    matricSentUp: { ...eff, silTheory: val },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 truncate">
                              Mathematics
                            </label>
                            <input
                              type="text"
                              placeholder="Math Theory"
                              value={(() => {
                                const v = formData.matricSentUp?.matTheory ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const val = e.target.value;
                                const matSubj = formData.compulsorySubject1 || 'MATHEMATICS';
                                setFormData((prev) => {
                                  const eff = getEffectiveMatricSentUp(prev);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [matSubj]: val },
                                    matricSentUp: { ...eff, matTheory: val },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 truncate">
                              English (Matric)
                            </label>
                            <input
                              type="text"
                              placeholder="Eng Theory"
                              value={(() => {
                                const v = formData.matricSentUp?.engTheory ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const val = e.target.value;
                                const engSubj = formData.compulsorySubject4 || 'ENGLISH';
                                setFormData((prev) => {
                                  const eff = getEffectiveMatricSentUp(prev);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [engSubj]: val },
                                    matricSentUp: { ...eff, engTheory: val },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Science: 80 Theory + 20 Practical */}
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-2">
                        <span className="font-bold text-xs text-emerald-950 block">Science (80 Theory + 20 Practical)</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600">Theory (80)</label>
                            <input
                              type="text"
                              placeholder="Sci Th"
                              value={(() => {
                                const v = formData.matricSentUp?.sciTheory ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const thVal = e.target.value;
                                const sciSubj = formData.compulsorySubject3 || 'SCIENCE';
                                setFormData((prev) => {
                                  const eff = getEffectiveMatricSentUp(prev);
                                  const prVal = eff.sciPractical || '';
                                  const tot = (Number(thVal) || 0) + (Number(prVal) || 0);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [sciSubj]: String(tot) },
                                    matricSentUp: { ...eff, sciTheory: thVal },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600">Practical (20)</label>
                            <input
                              type="text"
                              placeholder="Sci Pr"
                              value={(() => {
                                const v = formData.matricSentUp?.sciPractical ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const prVal = e.target.value;
                                const sciSubj = formData.compulsorySubject3 || 'SCIENCE';
                                setFormData((prev) => {
                                  const eff = getEffectiveMatricSentUp(prev);
                                  const thVal = eff.sciTheory || '';
                                  const tot = (Number(thVal) || 0) + (Number(prVal) || 0);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [sciSubj]: String(tot) },
                                    matricSentUp: { ...eff, sciPractical: prVal },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Social Science: 80 Theory + 10 Literacy + 10 Project */}
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-2">
                        <span className="font-bold text-xs text-emerald-950 block">Social Science (80 Th + 10 Lit + 10 Prj)</span>
                        <div className="grid grid-cols-3 gap-1.5">
                          <div>
                            <label className="block text-[9px] font-semibold text-slate-600">Theory (80)</label>
                            <input
                              type="text"
                              placeholder="SSC Th"
                              value={(() => {
                                const v = formData.matricSentUp?.sscTheory ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const thVal = e.target.value;
                                const sscSubj = formData.compulsorySubject2 || 'SOCIAL SCIENCE';
                                setFormData((prev) => {
                                  const eff = getEffectiveMatricSentUp(prev);
                                  const litVal = eff.sscLitAct || '';
                                  const prjVal = eff.sscPrWork || '';
                                  const tot = (Number(thVal) || 0) + (Number(litVal) || 0) + (Number(prjVal) || 0);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [sscSubj]: String(tot) },
                                    matricSentUp: { ...eff, sscTheory: thVal },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-semibold text-slate-600">Literacy (10)</label>
                            <input
                              type="text"
                              placeholder="Lit"
                              value={(() => {
                                const v = formData.matricSentUp?.sscLitAct ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const litVal = e.target.value;
                                const sscSubj = formData.compulsorySubject2 || 'SOCIAL SCIENCE';
                                setFormData((prev) => {
                                  const eff = getEffectiveMatricSentUp(prev);
                                  const thVal = eff.sscTheory || '';
                                  const prjVal = eff.sscPrWork || '';
                                  const tot = (Number(thVal) || 0) + (Number(litVal) || 0) + (Number(prjVal) || 0);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [sscSubj]: String(tot) },
                                    matricSentUp: { ...eff, sscLitAct: litVal },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-semibold text-slate-600">Project (10)</label>
                            <input
                              type="text"
                              placeholder="Prj"
                              value={(() => {
                                const v = formData.matricSentUp?.sscPrWork ?? '';
                                return v === '---' || v === '--' ? '' : v;
                              })()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const prjVal = e.target.value;
                                const sscSubj = formData.compulsorySubject2 || 'SOCIAL SCIENCE';
                                setFormData((prev) => {
                                  const eff = getEffectiveMatricSentUp(prev);
                                  const thVal = eff.sscTheory || '';
                                  const litVal = eff.sscLitAct || '';
                                  const tot = (Number(thVal) || 0) + (Number(litVal) || 0) + (Number(prjVal) || 0);
                                  return {
                                    ...prev,
                                    subjectMarks: { ...(prev.subjectMarks || {}), [sscSubj]: String(tot) },
                                    matricSentUp: { ...eff, sscPrWork: prjVal },
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                  <label htmlFor="edit-remarks" className="block text-[11px] font-medium text-slate-700">
                    Verification Remarks / Correction Note
                  </label>
                  <input
                    id="edit-remarks"
                    type="text"
                    placeholder="e.g., Marks manually corrected by administrator"
                    value={formData.remarks || ''}
                    onChange={(e) => handleChange('remarks', e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {savedNotice ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              <span>{savedNotice ? 'Saved' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
