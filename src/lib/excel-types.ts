
import { z } from 'zod';

const parseScoreValue = (valueWithMax: string | number | undefined): number | undefined => {
  if (valueWithMax === undefined || valueWithMax === null || String(valueWithMax).trim() === '') return undefined;
  const s = String(valueWithMax).split('/')[0].replace(',', '.').trim();
  if (s === 'AB' || s === 'DI' || s === 'NE' || s === 'EA') return undefined;
  const num = parseFloat(s);
  return isNaN(num) ? undefined : num;
};

const preprocessOptionalStringToNumber = (val: unknown) => {
  if (val === undefined || val === null || String(val).trim() === '') return undefined;
  return parseScoreValue(String(val));
};


export const studentDataSchema = z.object({
  'Série': z.string().optional(),
  anneeScolaireImportee: z.string(),
  'Code Etablissement': z.string().optional(),
  'Libellé Etablissement': z.string().optional(),
  'Commune Etablissement': z.string().optional(),
  'Division de classe': z.string().optional(),
  'Catégorie candidat': z.string().optional(),
  'Numéro Candidat': z.string().optional(),
  'INE': z.string().min(1, "INE requis"),
  'Nom candidat': z.string().min(1, "Nom candidat requis"),
  'Prénom candidat': z.string().min(1, "Prénom candidat requis"),
  'Date de naissance': z.string().optional(),
  'Résultat': z.string().optional(),

  'TOTAL GENERAL': z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  'TOTAL POUR MENTION': z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),
  'Moyenne sur 20': z.preprocess(preprocessOptionalStringToNumber, z.number().optional()),

  // Score fields remain camelCase as they map from complex Excel headers not explicitly listed for this harmonization
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
