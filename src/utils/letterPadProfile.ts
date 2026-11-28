import { AdmitCardRecord } from '../types/admitCard';
import { getEffectiveInterSentUp } from './marksAndFormat';
import {
  isMatricAbsentOrNonSentUp,
  isMatricVisuallyImpaired,
} from './exportReports';

export type LetterClassMode = 'INTERMEDIATE' | 'MATRIC';
export type LetterDocMode = 'LETTER_PAD' | 'ENVELOPE_SLIP';

export interface InterLetterCounts {
  presentRegular: string;
  vocational: string;
  absentNonSentUp: string;
  visuallyImpaired: string;
  privateStudents: string;
}

export interface MatricLetterCounts {
  presentRegular: string;
  presentEx: string;
  absentFail: string;
  blindSentUp: string;
  blindAbsent: string;
  presentPrivate: string;
}

export interface SavedLetterProfile {
  designation: string;
  signatureDesignation: string;
  schoolNameHindi: string;
  blockDistrictHindi: string;
  recipientTitle: string;
  recipientDistrict: string;
  annualYear: string;
  sentUpYear: string;
  examStartDate: string;
  examEndDate: string;
  topMarginMm: number;
  sideMarginMm: number;
  paperMode: 'PREPRINTED_PAD' | 'PLAIN_A4';
  envelopeCopiesPerPage: 1 | 2;
  envelopeBoxStyle: 'CREAM' | 'WHITE';
  envelopeShowCutBorder: boolean;
  envelopeShowSchoolFooter: boolean;
  headerDeptLine: string;
  headerOfficeLine: string;
  headerSchoolCode: string;
  headerUdiseCode: string;
  headerEstYear: string;
  headerPhone: string;
  headerEmail: string;
  headerTheme: 'OFFICIAL_COLOR' | 'CLASSIC_BW';
  headerShowEmblem: boolean;
  headerLogoDataUrl: string;
}

export const STORAGE_KEY_12TH_V1 = 'bseb_12th_letter_pad_profile_v1';
export const STORAGE_KEY_10TH_V1 = 'bseb_10th_letter_pad_profile_v1';
export const STORAGE_KEY_12TH = 'bseb_12th_letter_pad_profile_v2';
export const STORAGE_KEY_10TH = 'bseb_10th_letter_pad_profile_v2';

export const DEFAULT_PROFILE_12TH: SavedLetterProfile = {
  designation: 'प्रधानाध्यापक',
  signatureDesignation: 'प्रधानाध्यापक',
  schoolNameHindi: 'उच्च माध्यमिक विद्यालय बेरूआ',
  blockDistrictHindi: 'गायघाट, मुजफ्फरपुर (बिहार)',
  recipientTitle: 'जिला शिक्षा पदाधिकारी',
  recipientDistrict: 'मुजफ्फरपुर',
  annualYear: '2027',
  sentUpYear: '2026',
  examStartDate: '11-11-2026',
  examEndDate: '25-11-2026',
  topMarginMm: 42,
  sideMarginMm: 16,
  paperMode: 'PLAIN_A4',
  envelopeCopiesPerPage: 1,
  envelopeBoxStyle: 'CREAM',
  envelopeShowCutBorder: true,
  envelopeShowSchoolFooter: false,
  headerDeptLine: 'बिहार सरकार · शिक्षा विभाग',
  headerOfficeLine: 'कार्यालय : प्रधानाध्यापक',
  headerSchoolCode: '',
  headerUdiseCode: '',
  headerEstYear: '',
  headerPhone: '',
  headerEmail: '',
  headerTheme: 'OFFICIAL_COLOR',
  headerShowEmblem: true,
  headerLogoDataUrl: '',
};

export const DEFAULT_PROFILE_10TH: SavedLetterProfile = {
  designation: 'प्रभारी प्रधानाध्यापक',
  signatureDesignation: 'प्रभारी/प्रधानाध्यापक',
  schoolNameHindi: 'उच्च माध्यमिक विद्यालय बेरूआ',
  blockDistrictHindi: 'गायघाट, मुजफ्फरपुर (बिहार)',
  recipientTitle: 'जिला शिक्षा पदाधिकारी',
  recipientDistrict: 'मुजफ्फरपुर',
  annualYear: '2027',
  sentUpYear: '2026',
  examStartDate: '19-11-2026',
  examEndDate: '22-11-2026',
  topMarginMm: 42,
  sideMarginMm: 16,
  paperMode: 'PLAIN_A4',
  envelopeCopiesPerPage: 1,
  envelopeBoxStyle: 'CREAM',
  envelopeShowCutBorder: true,
  envelopeShowSchoolFooter: false,
  headerDeptLine: 'बिहार सरकार · शिक्षा विभाग',
  headerOfficeLine: 'कार्यालय : प्रभारी प्रधानाध्यापक',
  headerSchoolCode: '',
  headerUdiseCode: '',
  headerEstYear: '',
  headerPhone: '',
  headerEmail: '',
  headerTheme: 'OFFICIAL_COLOR',
  headerShowEmblem: true,
  headerLogoDataUrl: '',
};

export function loadSavedProfile(mode: LetterClassMode): SavedLetterProfile {
  const keyV2 = mode === 'INTERMEDIATE' ? STORAGE_KEY_12TH : STORAGE_KEY_10TH;
  const keyV1 = mode === 'INTERMEDIATE' ? STORAGE_KEY_12TH_V1 : STORAGE_KEY_10TH_V1;
  const defaults = mode === 'INTERMEDIATE' ? DEFAULT_PROFILE_12TH : DEFAULT_PROFILE_10TH;
  try {
    const rawV2 = window.localStorage.getItem(keyV2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<SavedLetterProfile>;
      return {
        ...defaults,
        ...parsed,
        signatureDesignation:
          parsed.signatureDesignation || parsed.designation || defaults.signatureDesignation,
        topMarginMm:
          typeof parsed.topMarginMm === 'number'
            ? Math.max(0, Math.min(95, parsed.topMarginMm))
            : defaults.topMarginMm,
        sideMarginMm:
          typeof parsed.sideMarginMm === 'number'
            ? Math.max(6, Math.min(30, parsed.sideMarginMm))
            : defaults.sideMarginMm,
      };
    }

    const rawV1 = window.localStorage.getItem(keyV1);
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as Partial<SavedLetterProfile>;
      return {
        ...defaults,
        ...parsed,
        paperMode: 'PLAIN_A4',
        signatureDesignation:
          parsed.signatureDesignation || parsed.designation || defaults.signatureDesignation,
      };
    }
    return defaults;
  } catch {
    return defaults;
  }
}

export function padTwoDigits(val: number | string): string {
  const str = String(val ?? '').trim();
  if (!str) return '00';
  const num = Number(str);
  if (Number.isNaN(num) || num < 0) return str;
  return String(Math.floor(num)).padStart(2, '0');
}

export function parseCountInt(val: string): number {
  const cleaned = String(val ?? '').replace(/[^\d]/g, '');
  if (!cleaned) return 0;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function compute12thLetterCounts(interRecords: AdmitCardRecord[]): InterLetterCounts {
  let presentRegular = 0;
  let vocational = 0;
  let absentNonSentUp = 0;
  let visuallyImpaired = 0;
  let privateStudents = 0;

  interRecords.forEach((rec) => {
    const sentUp = getEffectiveInterSentUp(rec);
    const status = (sentUp.resultStatus || '').toUpperCase();
    const cat = (rec.studentCategory || 'REGULAR').toUpperCase();
    const da = (rec.differentlyAbled || '').toLowerCase();
    const vocSubj = (sentUp.vocationalSubject || '').trim();

    const isAbsent =
      status.includes('ABSENT') ||
      status.includes('NOT SENT-UP') ||
      status.includes('NON SENT-UP') ||
      status.includes('FAIL');

    const isVoc =
      rec.faculty === 'VOCATIONAL' ||
      (vocSubj !== '' && vocSubj !== '---' && vocSubj.toUpperCase() !== 'N/A');

    const isBlind =
      da.includes('blind') ||
      da.includes('visual') ||
      da.includes('low vision') ||
      da.includes('दृष्टि') ||
      da === 'vi';

    const isPrivate =
      cat.includes('PRIVATE') ||
      cat.includes('INDEPENDENT') ||
      cat.includes('SWATANTR') ||
      cat.includes('स्वतन्त्र') ||
      cat.includes('स्वतंत्र');

    if (isBlind) visuallyImpaired += 1;
    if (isVoc) vocational += 1;

    if (isPrivate) {
      privateStudents += 1;
    } else if (isAbsent) {
      absentNonSentUp += 1;
    } else if (!isVoc) {
      presentRegular += 1;
    }
  });

  return {
    presentRegular: padTwoDigits(presentRegular),
    vocational: padTwoDigits(vocational),
    absentNonSentUp: padTwoDigits(absentNonSentUp),
    visuallyImpaired: padTwoDigits(visuallyImpaired),
    privateStudents: padTwoDigits(privateStudents),
  };
}

export function compute10thLetterCounts(matricRecords: AdmitCardRecord[]): MatricLetterCounts {
  let presentRegular = 0;
  let presentEx = 0;
  let absentFail = 0;
  let blindSentUp = 0;
  let blindAbsent = 0;
  let presentPrivate = 0;

  matricRecords.forEach((rec) => {
    const isBlind = isMatricVisuallyImpaired(rec);
    const isAbsent = isMatricAbsentOrNonSentUp(rec);
    const cat = (rec.studentCategory || 'REGULAR').toUpperCase().trim();

    const isPrivate =
      cat.includes('PRIVATE') ||
      cat.includes('INDEPENDENT') ||
      cat.includes('SWATANTR') ||
      cat.includes('स्वतन्त्र') ||
      cat.includes('स्वतंत्र');

    const isEx =
      cat === 'EX' ||
      cat.startsWith('EX-') ||
      cat.startsWith('EX ') ||
      cat.includes('EX-REG') ||
      cat.includes('FORMER') ||
      cat.includes('COMPARTMENTAL') ||
      cat.includes('पूर्ववर्ती');

    if (isBlind) {
      if (isAbsent) blindAbsent += 1;
      else blindSentUp += 1;
    } else if (isAbsent) {
      absentFail += 1;
    } else if (isPrivate) {
      presentPrivate += 1;
    } else if (isEx) {
      presentEx += 1;
    } else {
      presentRegular += 1;
    }
  });

  return {
    presentRegular: padTwoDigits(presentRegular),
    presentEx: padTwoDigits(presentEx),
    absentFail: padTwoDigits(absentFail),
    blindSentUp: padTwoDigits(blindSentUp),
    blindAbsent: padTwoDigits(blindAbsent),
    presentPrivate: padTwoDigits(presentPrivate),
  };
}
