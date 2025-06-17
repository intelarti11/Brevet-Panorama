
import { z } from 'zod';

const parseScoreValue = (valueWithMax: string | number | undefined): number | undefined => {
  if (valueWithMax === undefined || valueWithMax === null || String(valueWithMax).trim() === '') return undefined;
  // For values like "45,5/50" or just "45,5" or "45.5"
  const s = String(valueWithMax).split('/')[0].replace(',', '.').trim();
  const num = parseFloat(s);
  return isNaN(num) ? undefined : num;
};

const preprocessOptionalStringToNumber = (val: unknown) => {
  if (val === undefined || val === null || String(val).trim() === '') return undefined;
  return parseScoreValue(String(val));
};


export const studentDataSchema = z.object({
  serie: z.string().optional(),
  codeEtablissement: z.string().optional(),
  libelleEtablissement: z.string().optional(),
  communeEtablissement: z.string().optional(),
  divisionEleve: z.string().optional(),
  categorieSocioPro: z.string().optional(),
  numeroCandidatINE: z.string().min(1, "Numéro INE requis"),
  nomCandidat: z.string().min(1, "Nom requis"),
  prenomsCandidat: z.string().min(1, "Prénom requis"),
  dateNaissance: z.string().optional(), // Keep as string after formatting
  resultat: z.string().optional(),

  totalGeneral: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  totalPourcentage: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),

  scoreFrancais: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreMaths: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreHistoireGeo: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreSciencesVie: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scorePhysiqueChimie: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreLVE: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreArtsPlastiques: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreEducationMusicale: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreEPS: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  scoreOralDNB: z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),

  // For optional subjects like LCA, LCE, etc.
  // Storing them as a record of strings for flexibility.
  options: z.record(z.string()).optional(),
  rawRowData: z.any().optional(), // To store the original row for debugging or further processing
});

export type StudentData = z.infer<typeof studentDataSchema>;
