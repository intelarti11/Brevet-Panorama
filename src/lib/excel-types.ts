
import { z } from 'zod';

// Helper to convert various inputs to string or undefined
const preprocessToStringOptional = (val: unknown): string | undefined => {
  if (val === undefined || val === null) return undefined;
  const strVal = String(val).trim();
  return strVal === '' ? undefined : strVal;
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

const preprocessOptionalStringToNumber = (val: unknown) => {
  if (val === undefined || val === null || String(val).trim() === '') return undefined;
  return parseScoreValue(String(val));
};


export const studentDataSchema = z.object({
  'anneeScolaireImportee': z.string().min(1, "Année scolaire d'importation requise"),
  
  // Fields matching Excel headers exactly
  'Série': z.preprocess(preprocessToStringOptional, z.string().optional()),
  'Code Etablissement': z.preprocess(preprocessToStringOptional, z.string().optional()),
  'Libellé Etablissement': z.preprocess(preprocessToStringOptional, z.string().optional()),
  'Commune Etablissement': z.preprocess(preprocessToStringOptional, z.string().optional()),
  'Division de classe': z.preprocess(preprocessToStringOptional, z.string().optional()),
  'Catégorie candidat': z.preprocess(preprocessToStringOptional, z.string().optional()),
  'Numéro Candidat': z.preprocess(preprocessToStringOptional, z.string().optional()), // Handles number or string
  'INE': z.preprocess(preprocessToStringOptional, z.string().min(1, "INE requis")),
  'Nom candidat': z.preprocess(preprocessToStringOptional, z.string().min(1, "Nom candidat requis")),
  'Prénom candidat': z.preprocess(preprocessToStringOptional, z.string().min(1, "Prénom candidat requis")),
  'Date de naissance': z.preprocess(preprocessToStringOptional, z.string().optional()),
  'Résultat': z.preprocess(preprocessToStringOptional, z.string().optional()),
  'TOTAL GENERAL': z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  'Moyenne sur 20': z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  // 'TOTAL POUR MENTION' is removed as it's always empty

  // Score fields retain camelCase names from original complex headers
  scoreFrancais: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreMaths: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreHistoireGeo: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreSciences: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreOralDNB: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreLVE: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreArtsPlastiques: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreEducationMusicale: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreEPS: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scorePhysiqueChimie: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreSciencesVie: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),

  options: z.record(z.string()).optional(),
  rawRowData: z.any().optional(), 
});

export type StudentData = z.infer<typeof studentDataSchema>;
