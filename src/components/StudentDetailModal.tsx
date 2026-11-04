import React, { useState } from 'react';
import { X, Save, Check, User, FileText } from 'lucide-react';
import { AdmitCardRecord, ExamType, FacultyType } from '../types/admitCard';

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
                <h3 className="text-xs font-semibold text-slate-900 pb-2 border-b border-slate-200">
                  02. Registered Examination Subjects &amp; Marks Obtained
                </h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      ['langSubject1', 'Language Subject 1'],
                      ['langSubject2', 'Language Subject 2'],
                      ['compulsorySubject1', 'Compulsory / Elective 1'],
                      ['compulsorySubject2', 'Compulsory / Elective 2'],
                      ['compulsorySubject3', 'Compulsory / Elective 3'],
                      ['compulsorySubject4', 'Compulsory 4 (Matric Eng)'],
                      ['additionalSubject', 'Additional / Optional Subject'],
                    ] as const
                  ).map(([fieldKey, label]) => {
                    const subjVal = formData[fieldKey] || '';
                    const markVal = subjVal ? formData.subjectMarks?.[subjVal] || '' : '';
                    return (
                      <div
                        key={fieldKey}
                        className="grid grid-cols-12 gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5"
                      >
                        <div className="col-span-8">
                          <label
                            htmlFor={`edit-${fieldKey}`}
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            {label}
                          </label>
                          <input
                            id={`edit-${fieldKey}`}
                            type="text"
                            value={subjVal}
                            onChange={(e) => handleChange(fieldKey, e.target.value)}
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                          />
                        </div>
                        <div className="col-span-4">
                          <label
                            htmlFor={`edit-mark-${fieldKey}`}
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            Marks (0–100)
                          </label>
                          <input
                            id={`edit-mark-${fieldKey}`}
                            type="text"
                            disabled={!subjVal.trim()}
                            placeholder="Marks"
                            value={markVal}
                            onChange={(e) => {
                              if (!subjVal.trim()) return;
                              const val = e.target.value;
                              setFormData((prev) => ({
                                ...prev,
                                subjectMarks: {
                                  ...(prev.subjectMarks || {}),
                                  [subjVal]: val,
                                },
                              }));
                            }}
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs font-semibold tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none disabled:bg-slate-100"
                          />
                        </div>
                      </div>
                    );
                  })}

                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                    <label htmlFor="edit-remarks" className="block text-[11px] font-medium text-slate-700">
                      Verification Remarks / Correction Note
                    </label>
                    <input
                      id="edit-remarks"
                      type="text"
                      placeholder="e.g., Spelling verified, Photo verified"
                      value={formData.remarks || ''}
                      onChange={(e) => handleChange('remarks', e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
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
