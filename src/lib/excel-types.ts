
import { z } from 'zod';

// Helper to convert various inputs to string or null
const preprocessToStringOptional = (val: unknown): string | null => {
  if (val === undefined || val === null) return null;
  const strVal = String(val).trim();
  return strVal === '' ? null : strVal;
};

// Helper to parse score-like values (e.g., "X/Y" or just "X") to number or undefined
const parseScoreValue = (valueWithMax: string | number | undefined): number | undefined => {
  if (valueWithMax === undefined || valueWithMax === null || String(valueWithMax).trim() === '') return undefined;
  const s = String(valueWithMax).split('/')[0].replace(',', '.').trim();
  // Handle common non-numeric grade abbreviations
  if (['AB', 'DI', 'NE', 'EA', 'DISP', 'ABS'].includes(s.toUpperCase())) return undefined;
  const num = parseFloat(s);
  return isNaN(num) ? undefined : num;
};

// Helper to convert optional string/number input from Excel to a number or null
const preprocessOptionalStringToNumber = (val: unknown): number | null => {
  if (val === undefined || val === null) {
    return null;
  }
  const strVal = String(val).trim();
  if (strVal === '') {
    return null;
  }
  const parsedNum = parseScoreValue(strVal);
  return parsedNum === undefined ? null : parsedNum;
};


export const studentDataSchema = z.object({
  'anneeScolaireImportee': z.string().regex(/^\d{4}$/, "L'année d'importation doit être au format AAAA (ex: 2023)").min(1, "Année scolaire d'importation requise"),

  // Fields matching Excel headers exactly
  'Série': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Code Etablissement': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Libellé Etablissement': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Commune Etablissement': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Division de classe': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Catégorie candidat': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Numéro Candidat': z.preprocess(preprocessToStringOptional, z.string().min(1, "Numéro candidat ne peut pas être vide si fourni").nullable().optional()),
  'INE': z.preprocess(preprocessToStringOptional, z.string().min(1, "INE requis")),
  'Nom candidat': z.preprocess(preprocessToStringOptional, z.string().min(1, "Nom candidat requis")),
  'Prénom candidat': z.preprocess(preprocessToStringOptional, z.string().min(1, "Prénom candidat requis")),
  'Date de naissance': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Résultat': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'TOTAL GENERAL': z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  'Moyenne sur 20': z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),

  // Score fields retain camelCase names from original complex headers
  scoreFrancais: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreMaths: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreHistoireGeo: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreSciences: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreOralDNB: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreLVE: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreArtsPlastiques: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreEducationMusicale: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreEPS: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scorePhysiqueChimie: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreSciencesVie: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),

  options: z.record(z.string()).optional(), // This stores any other columns
  rawRowData: z.any().optional(), // Store the original raw row for debugging or future use
});

export type StudentData = z.infer<typeof studentDataSchema>;

// Schema for basic student data from CSV (e.g. school's student list)
export const studentBaseSchema = z.object({
  INE: z.preprocess(preprocessToStringOptional, z.string().min(1, "L'INE est requis")),
  NOM: z.preprocess(preprocessToStringOptional, z.string().min(1, "Le nom est requis")),
  PRENOM: z.preprocess(preprocessToStringOptional, z.string().min(1, "Le prénom est requis")),
  DATE_NAISSANCE: z.preprocess(preprocessToStringOptional, z.string().nullable().optional()), // Expecting format like DD/MM/YYYY
  SEXE: z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  CLASSE: z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  CODE_ETABLISSEMENT: z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  LIBELLE_ETABLISSEMENT: z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  CODE_DIVISION: z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
});
export type StudentBaseData = z.infer<typeof studentBaseSchema>;

// Schema for Brevet Blanc entries from CSV
export const brevetBlancEntrySchema = z.object({
  INE: z.preprocess(preprocessToStringOptional, z.string().min(1, "L'INE est requis.")),
  // NOM: z.preprocess(preprocessToStringOptional, z.string().min(1, "Le Nom est requis.")), // Optional, INE is primary key
  // PRENOM: z.preprocess(preprocessToStringOptional, z.string().min(1, "Le Prénom est requis.")), // Optional
  MATIERE: z.preprocess(preprocessToStringOptional, z.string().min(1, "La matière est requise.")),
  NOTE: z.preprocess(preprocessOptionalStringToNumber, z.number({ required_error: "La note est requise.", invalid_type_error: "La note doit être un nombre." }).nullable()),
  // BAREME: z.preprocess(preprocessOptionalStringToNumber, z.number().positive("Le barème doit être positif.").nullable().optional()), // Optional: if notes are not always /20
  // DATE_EPREUVE: z.preprocess(preprocessToStringOptional, z.string().nullable().optional()), // Optional
});
export type BrevetBlancEntry = z.infer<typeof brevetBlancEntrySchema>;
