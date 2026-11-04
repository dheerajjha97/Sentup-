import React from 'react';
import { SummaryStats } from '../types/admitCard';

interface SummaryAnalyticsViewProps {
  stats: SummaryStats;
}

export const SummaryAnalyticsView: React.FC<SummaryAnalyticsViewProps> = ({ stats }) => {
  const subjectEntries = Object.entries(stats.bySubject).sort((a, b) => b[1] - a[1]);
  const facultyEntries = Object.entries(stats.byFaculty).sort((a, b) => b[1] - a[1]);
  const categoryEntries = Object.entries(stats.byStudentCategory).sort((a, b) => b[1] - a[1]);
  const casteEntries = Object.entries(stats.byCasteCategory).sort((a, b) => b[1] - a[1]);
  const schoolEntries = Object.entries(stats.bySchool).sort((a, b) => b[1] - a[1]);

  if (stats.totalStudents === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <h3 className="text-base font-semibold text-slate-900">
          No Student Records Extracted Yet
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Upload one or more BSEB Admit Card PDFs or images above to automatically generate
          stream-wise, category-wise, caste-wise, and subject-wise enrollment registers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Row 1: Stream/Faculty, Examinee Category, and Caste Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Stream / Faculty Table */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-900">
              01. Stream &amp; Faculty Distribution
            </h3>
            <p className="text-xs text-slate-500">
              Candidate count by examination level and faculty
            </p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
              <tr>
                <th className="px-5 py-2.5">Faculty / Stream</th>
                <th className="px-5 py-2.5 text-right">Candidates</th>
                <th className="px-5 py-2.5 text-right">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {facultyEntries.map(([fac, count]) => {
                const pct = ((count / stats.totalStudents) * 100).toFixed(1);
                return (
                  <tr key={fac} className="hover:bg-slate-50/80">
                    <td className="px-5 py-2.5 font-medium text-slate-900">{fac}</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-slate-800">
                      {count}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-xs text-slate-500">
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Examinee Category Table */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-900">
              02. Examinee Category Breakdown
            </h3>
            <p className="text-xs text-slate-500">
              Regular, Ex-Regular, Compartmental, and Improvement
            </p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
              <tr>
                <th className="px-5 py-2.5">Category</th>
                <th className="px-5 py-2.5 text-right">Candidates</th>
                <th className="px-5 py-2.5 text-right">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categoryEntries.map(([cat, count]) => {
                const pct = ((count / stats.totalStudents) * 100).toFixed(1);
                return (
                  <tr key={cat} className="hover:bg-slate-50/80">
                    <td className="px-5 py-2.5 font-medium text-slate-900">{cat}</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-slate-800">
                      {count}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-xs text-slate-500">
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Caste & Gender Summary Table */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-900">
              03. Caste &amp; Gender Distribution
            </h3>
            <p className="text-xs text-slate-500">
              Demographic distribution across uploaded admit cards
            </p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
              <tr>
                <th className="px-5 py-2.5">Group</th>
                <th className="px-5 py-2.5 text-right">Candidates</th>
                <th className="px-5 py-2.5 text-right">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-2.5 font-medium text-slate-900">Gender: MALE</td>
                <td className="px-5 py-2.5 text-right font-mono tabular-nums text-slate-800">
                  {stats.maleCount}
                </td>
                <td className="px-5 py-2.5 text-right font-mono tabular-nums text-xs text-slate-500">
                  {((stats.maleCount / stats.totalStudents) * 100).toFixed(1)}%
                </td>
              </tr>
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-2.5 font-medium text-slate-900">Gender: FEMALE</td>
                <td className="px-5 py-2.5 text-right font-mono tabular-nums text-slate-800">
                  {stats.femaleCount}
                </td>
                <td className="px-5 py-2.5 text-right font-mono tabular-nums text-xs text-slate-500">
                  {((stats.femaleCount / stats.totalStudents) * 100).toFixed(1)}%
                </td>
              </tr>
              {casteEntries.map(([caste, count]) => {
                const pct = ((count / stats.totalStudents) * 100).toFixed(1);
                return (
                  <tr key={caste} className="hover:bg-slate-50/80">
                    <td className="px-5 py-2.5 font-medium text-slate-900">Caste: {caste}</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-slate-800">
                      {count}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-xs text-slate-500">
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 2: Subject-Wise Enrollment Matrix & School Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden lg:col-span-7">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-900">
              04. Subject-Wise Candidate Enrollment Matrix
            </h3>
            <p className="text-xs text-slate-500">
              Total candidates registered per subject across language, compulsory, elective, and additional slots
            </p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <tr>
                  <th className="px-5 py-2.5">Subject Code &amp; Name</th>
                  <th className="px-5 py-2.5 text-right">Enrolled Students</th>
                  <th className="px-5 py-2.5 text-right">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjectEntries.map(([subj, count]) => {
                  const pct = ((count / stats.totalStudents) * 100).toFixed(1);
                  return (
                    <tr key={subj} className="hover:bg-slate-50/80">
                      <td className="px-5 py-2.5 font-medium text-slate-900">{subj}</td>
                      <td className="px-5 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {count}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono tabular-nums text-xs text-slate-500">
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden lg:col-span-5">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-900">
              05. School / +2 Institution Summary
            </h3>
            <p className="text-xs text-slate-500">
              Institutions identified in the current uploaded batch
            </p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
              <tr>
                <th className="px-5 py-2.5">School / College Code &amp; Name</th>
                <th className="px-5 py-2.5 text-right">Students</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schoolEntries.map(([school, count]) => (
                <tr key={school} className="hover:bg-slate-50/80">
                  <td className="px-5 py-3 font-medium text-slate-900">{school}</td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
