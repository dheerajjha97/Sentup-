import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { AdmitCardRecord, ExamType, FacultyType } from '../types/admitCard';

interface ManualEntryModalProps {
  nextSerialNo: number;
  initialExamType?: ExamType;
  onClose: () => void;
  onAdd: (record: AdmitCardRecord) => void;
}

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({
  nextSerialNo,
  initialExamType,
  onClose,
  onAdd,
}) => {
  const [examType, setExamType] = useState<ExamType>(initialExamType || 'INTERMEDIATE (+2)');
  const [faculty, setFaculty] = useState<FacultyType>('SECONDARY');
  const [bsebUniqueId, setBsebUniqueId] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [maritalStatus, setMaritalStatus] = useState('Unmarried');
  const [aadhaarNo, setAadhaarNo] = useState('');
  const [registrationNo, setRegistrationNo] = useState('');
  const [studentCategory, setStudentCategory] = useState('REGULAR');
  const [casteCategory, setCasteCategory] = useState('BC');
  const [differentlyAbled, setDifferentlyAbled] = useState('No');
  const [rollNumber, setRollNumber] = useState('');
  const [langSubject1, setLangSubject1] = useState('MIL - HINDI');
  const [langSubject2, setLangSubject2] = useState('SIL - SANSKRIT');
  const [compulsorySubject1, setCompulsorySubject1] = useState('MATHEMATICS');
  const [compulsorySubject2, setCompulsorySubject2] = useState('SOCIAL SCIENCE');
  const [compulsorySubject3, setCompulsorySubject3] = useState('SCIENCE');
  const [compulsorySubject4, setCompulsorySubject4] = useState('ENGLISH');
  const [additionalSubject, setAdditionalSubject] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setErrorMessage('Student Name is required.');
      return;
    }

    const allSubjects = [
      langSubject1,
      langSubject2,
      compulsorySubject1,
      compulsorySubject2,
      compulsorySubject3,
      compulsorySubject4,
      additionalSubject,
    ]
      .map((s) => s.trim())
      .filter(Boolean);

    const newRecord: AdmitCardRecord = {
      id: `manual-${Date.now()}-${nextSerialNo}`,
      serialNo: nextSerialNo,
      examType,
      examYear: '2027',
      faculty: examType === 'MATRIC (10th)' ? 'SECONDARY' : faculty,
      bsebUniqueId: bsebUniqueId.trim(),
      schoolCode: schoolCode.trim(),
      schoolName: schoolName.trim()
        ? schoolCode.trim()
          ? `${schoolCode.trim()} - ${schoolName.trim().toUpperCase()}`
          : schoolName.trim().toUpperCase()
        : '',
      studentName: studentName.trim().toUpperCase(),
      fatherName: fatherName.trim().toUpperCase(),
      motherName: motherName.trim().toUpperCase(),
      dob: dob.trim() || 'N/A',
      gender,
      maritalStatus: examType === 'MATRIC (10th)' ? 'N/A' : maritalStatus,
      aadhaarNo: aadhaarNo.trim(),
      studentCategory: studentCategory.trim().toUpperCase() || 'REGULAR',
      casteCategory: examType === 'MATRIC (10th)' ? casteCategory : 'N/A',
      differentlyAbled,
      registrationNo: registrationNo.trim(),
      rollCode: schoolCode.trim(),
      rollNumber: rollNumber.trim() || 'XXXXXXXX',
      examCenter: 'XXXXXXXX',
      langSubject1: langSubject1.trim(),
      langSubject2: langSubject2.trim(),
      compulsorySubject1: compulsorySubject1.trim(),
      compulsorySubject2: compulsorySubject2.trim(),
      compulsorySubject3: compulsorySubject3.trim(),
      compulsorySubject4: examType === 'MATRIC (10th)' ? compulsorySubject4.trim() : '',
      additionalSubject: additionalSubject.trim(),
      allSubjectsSummary: allSubjects.join(', '),
      sourceFileName: 'Manual Entry',
      sourcePageNumber: 1,
      extractionMethod: 'PDF_TEXT_LAYER',
    };

    onAdd(newRecord);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-entry-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="manual-entry-title" className="text-lg font-semibold text-slate-900">
              Add Manual Admit Card Record
            </h2>
            <p className="text-xs text-slate-500">
              Append an individual student record directly into your current report table
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close manual entry modal"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
              {errorMessage}
            </div>
          )}

          {/* Module Selector Segment in Modal */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Select School Module
            </label>
            <div className="flex items-center gap-1.5 rounded-2xl bg-[#F4F6FB] p-1 border border-indigo-100">
              <button
                type="button"
                onClick={() => {
                  setExamType('INTERMEDIATE (+2)');
                  setFaculty('SCIENCE');
                  setLangSubject1('306 - Hindi');
                  setLangSubject2('305 - English');
                  setCompulsorySubject1('117 - Physics');
                  setCompulsorySubject2('118 - Chemistry');
                  setCompulsorySubject3('119 - Biology');
                  setCompulsorySubject4('');
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                  examType === 'INTERMEDIATE (+2)'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-indigo-50/70 hover:text-indigo-900'
                }`}
              >
                🎓 Intermediate (+2 / 12th)
              </button>
              <button
                type="button"
                onClick={() => {
                  setExamType('MATRIC (10th)');
                  setFaculty('SECONDARY');
                  setLangSubject1('MIL - HINDI');
                  setLangSubject2('SIL - SANSKRIT');
                  setCompulsorySubject1('MATHEMATICS');
                  setCompulsorySubject2('SOCIAL SCIENCE');
                  setCompulsorySubject3('SCIENCE');
                  setCompulsorySubject4('ENGLISH');
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                  examType === 'MATRIC (10th)'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-emerald-50/70 hover:text-emerald-900'
                }`}
              >
                🏫 Matric (10th)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

            <div>
              <label htmlFor="man-faculty" className="block text-xs font-medium text-slate-700">
                Faculty / Stream
              </label>
              <select
                id="man-faculty"
                value={faculty}
                disabled={examType === 'MATRIC (10th)'}
                onChange={(e) => setFaculty(e.target.value as FacultyType)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 disabled:bg-slate-100"
              >
                <option value="SECONDARY">SECONDARY (10th)</option>
                <option value="ARTS">ARTS</option>
                <option value="SCIENCE">SCIENCE</option>
                <option value="COMMERCE">COMMERCE</option>
              </select>
            </div>

            <div>
              <label htmlFor="man-bseb-id" className="block text-xs font-medium text-slate-700">
                BSEB Unique ID
              </label>
              <input
                id="man-bseb-id"
                type="text"
                placeholder="e.g. 1261518030042"
                value={bsebUniqueId}
                onChange={(e) => setBsebUniqueId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="man-student-name" className="block text-xs font-medium text-slate-700">
                Student Name *
              </label>
              <input
                id="man-student-name"
                type="text"
                placeholder="Full Name"
                value={studentName}
                onChange={(e) => {
                  setStudentName(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="man-father-name" className="block text-xs font-medium text-slate-700">
                Father&apos;s Name
              </label>
              <input
                id="man-father-name"
                type="text"
                placeholder="Father's Name"
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="man-mother-name" className="block text-xs font-medium text-slate-700">
                Mother&apos;s Name
              </label>
              <input
                id="man-mother-name"
                type="text"
                placeholder="Mother's Name"
                value={motherName}
                onChange={(e) => setMotherName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="man-school-code" className="block text-xs font-medium text-slate-700">
                School / Roll Code
              </label>
              <input
                id="man-school-code"
                type="text"
                placeholder="e.g. 51803"
                value={schoolCode}
                onChange={(e) => setSchoolCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="man-school-name" className="block text-xs font-medium text-slate-700">
                School / +2 College Name
              </label>
              <input
                id="man-school-name"
                type="text"
                placeholder="e.g. HIGH SECONDARY SCHOOL BERUA"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="man-dob" className="block text-xs font-medium text-slate-700">
                Date of Birth
              </label>
              <input
                id="man-dob"
                type="text"
                placeholder="DD/MM/YYYY"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="man-gender" className="block text-xs font-medium text-slate-700">
                Gender
              </label>
              <select
                id="man-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
              >
                <option value="MALE">MALE</option>
                <option value="FEMALE">FEMALE</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>

            <div>
              <label htmlFor="man-aadhaar" className="block text-xs font-medium text-slate-700">
                Aadhaar Number
              </label>
              <input
                id="man-aadhaar"
                type="text"
                placeholder="XXXX-XXXX-XXXX"
                value={aadhaarNo}
                onChange={(e) => setAadhaarNo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="man-reg" className="block text-xs font-medium text-slate-700">
                Registration / Listing No.
              </label>
              <input
                id="man-reg"
                type="text"
                placeholder="e.g. 51803-00001-26 / 2026"
                value={registrationNo}
                onChange={(e) => setRegistrationNo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="man-category" className="block text-xs font-medium text-slate-700">
                Examinee Category
              </label>
              <select
                id="man-category"
                value={studentCategory}
                onChange={(e) => setStudentCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
              >
                <option value="REGULAR">REGULAR</option>
                <option value="EX">EX</option>
                <option value="COMPARTMENTAL">COMPARTMENTAL</option>
                <option value="IMPROVEMENT">IMPROVEMENT</option>
                <option value="PRIVATE">PRIVATE</option>
              </select>
            </div>

            <div>
              <label htmlFor="man-caste" className="block text-xs font-medium text-slate-700">
                Caste Category
              </label>
              <select
                id="man-caste"
                value={casteCategory}
                onChange={(e) => setCasteCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
              >
                <option value="GENERAL">GENERAL</option>
                <option value="BC">BC</option>
                <option value="EBC">EBC</option>
                <option value="SC">SC</option>
                <option value="ST">ST</option>
              </select>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3">
            <h3 className="text-xs font-semibold text-slate-900 mb-2">Subjects</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="man-lang1" className="block text-xs font-medium text-slate-700">
                  Language 1
                </label>
                <input
                  id="man-lang1"
                  type="text"
                  value={langSubject1}
                  onChange={(e) => setLangSubject1(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="man-lang2" className="block text-xs font-medium text-slate-700">
                  Language 2
                </label>
                <input
                  id="man-lang2"
                  type="text"
                  value={langSubject2}
                  onChange={(e) => setLangSubject2(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="man-sub1" className="block text-xs font-medium text-slate-700">
                  Subject / Elective 1
                </label>
                <input
                  id="man-sub1"
                  type="text"
                  value={compulsorySubject1}
                  onChange={(e) => setCompulsorySubject1(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="man-sub2" className="block text-xs font-medium text-slate-700">
                  Subject / Elective 2
                </label>
                <input
                  id="man-sub2"
                  type="text"
                  value={compulsorySubject2}
                  onChange={(e) => setCompulsorySubject2(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="man-sub3" className="block text-xs font-medium text-slate-700">
                  Subject / Elective 3
                </label>
                <input
                  id="man-sub3"
                  type="text"
                  value={compulsorySubject3}
                  onChange={(e) => setCompulsorySubject3(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="man-addl" className="block text-xs font-medium text-slate-700">
                  Additional Subject
                </label>
                <input
                  id="man-addl"
                  type="text"
                  value={additionalSubject}
                  onChange={(e) => setAdditionalSubject(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Add Student Record</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
