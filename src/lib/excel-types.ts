
import { z } from 'zod';

const parseScoreValue = (valueWithMax: string | number | undefined): number | undefined => {
  if (valueWithMax === undefined || valueWithMax === null || String(valueWithMax).trim() === '') return undefined;
  // For values like "45,5/50" or just "45,5" or "45.5" or "AB"
  const s = String(valueWithMax).split('/')[0].replace(',', '.').trim();
  if (s === 'AB' || s === 'DI' || s === 'NE' || s === 'EA') return undefined; // Explicitly handle common non-numeric codes
  const num = parseFloat(s);
  return isNaN(num) ? undefined : num;
};

const preprocessOptionalStringToNumber = (val: unknown) => {
  if (val === undefined || val === null || String(val).trim() === '') return undefined;
  return parseScoreValue(String(val));
};


export const studentDataSchema = z.object({
  serie: z.string().optional(), // This will now primarily be for "Type de Série" like "GÉNÉRALE"
  anneeScolaireImportee: z.string(), // Nouveau champ pour l'année d'import, ex: "2023-2024" ou "2024"
  codeEtablissement: z.string().optional(),
  libelleEtablissement: z.string().optional(),
  communeEtablissement: z.string().optional(),
  divisionEleve: z.string().optional(), // Mapped from "Division de classe"
  categorieSocioPro: z.string().optional(), // Mapped from "Catégorie candidat"
  numeroCandidatINE: z.string().min(1, "Numéro INE requis"), // Mapped from "INE"
  nomCandidat: z.string().min(1, "Nom requis"),
  prenomsCandidat: z.string().min(1, "Prénom requis"), // Mapped from "Prénom candidat"
  dateNaissance: z.string().optional(), // Keep as string after formatting, mapped from "Date de naissance"
  resultat: z.string().optional(),

  totalGeneral: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()), // Mapped from "TOTAL GENERAL"
  totalPourcentage: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()), // Mapped from "Moyenne sur 20"

  scoreFrancais: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()), // Mapped from "001 - 1 - Français - Ponctuel"
  scoreMaths: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()), // Mapped from "002 - 1 - Mathématiques - Ponctuel"
  scoreHistoireGeo: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()), // Mapped from "003 - 1 - Histoire, géographie, enseignement moral et civique - Ponctuel"
  scoreSciences: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()), // Mapped from "004 - 1 - Sciences - Ponctuel"
  
  scoreOralDNB: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()), // Mapped from "005 - 1 - Soutenance orale de projet - Evaluation en cours d'année"

  // These will likely be undefined with the new headers unless specific columns are found
  scoreLVE: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreArtsPlastiques: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreEducationMusicale: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreEPS: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scorePhysiqueChimie: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreSciencesVie: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),


  // For optional subjects and other data like "007..." columns
  options: z.record(z.string()).optional(),
  rawRowData: z.any().optional(), // To store the original row for debugging or further processing
});

export type StudentData = z.infer<typeof studentDataSchema>;

