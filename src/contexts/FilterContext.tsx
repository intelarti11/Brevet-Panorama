
"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, getDocs, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase'; // Ensure db is correctly initialized and exported

export interface ProcessedStudentData {
  id: string; // INE, used as document ID
  nom: string;
  prenom: string;
  etablissement: string;
  anneeOriginale?: string; // The raw data['Série'] or other original year/serie field from Firestore
  academicYear?: string; // Parsed or directly imported e.g., "2023"
  serieType?: string; // Parsed e.g., "GÉNÉRALE"
  resultat?: string;
  moyenne?: number;
  scoreFrancais?: number;
  scoreMaths?: number;
  scoreHistoireGeo?: number;
  scoreSciences?: number;
  scoreOralDNB?: number;
  scoreLVE?: number;
  scoreArtsPlastiques?: number;
  scoreEducationMusicale?: number;
  scoreEPS?: number;
  scorePhysiqueChimie?: number;
  scoreSciencesVie?: number;
}

interface FilterContextType {
  allProcessedStudents: ProcessedStudentData[];
  isLoading: boolean;
  error: string | null;

  availableAcademicYears: string[];
  selectedAcademicYear: string;
  setSelectedAcademicYear: (year: string) => void;

  availableSerieTypes: string[];
  selectedSerieType: string;
  setSelectedSerieType: (serie: string) => void;

  availableEstablishments: string[];
  selectedEstablishment: string;
  setSelectedEstablishment: (establishment: string) => void;

  ALL_ACADEMIC_YEARS_VALUE: string;
  ALL_SERIE_TYPES_VALUE: string;
  ALL_ESTABLISHMENTS_VALUE: string;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const ALL_ACADEMIC_YEARS_VALUE = "__ALL_ACADEMIC_YEARS__";
export const ALL_SERIE_TYPES_VALUE = "__ALL_SERIE_TYPES__";
export const ALL_ESTABLISHMENTS_VALUE = "__ALL_ESTABLISHMENTS__";

const normalizeTextForComparison = (text: string | undefined): string => {
  if (text === null || text === undefined) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

// Parses the 'Série' field which might contain year and serie type.
// Returns a potential academic year (could be YYYY or YYYY-YYYY) and serie type.
const parseOriginalSerieField = (rawSerieOriginale: string | undefined): { academicYearFallback?: string; serieType?: string } => {
  if (!rawSerieOriginale || String(rawSerieOriginale).trim() === "") return { academicYearFallback: undefined, serieType: undefined };

  const serieStr = String(rawSerieOriginale);
  // Regex to find YYYY-YYYY or just YYYY
  const yearRegex = /(\d{4}[-\/]\d{4}|\b\d{4}\b)/;
  const yearMatch = serieStr.match(yearRegex);
  let academicYearFallback: string | undefined = undefined;
  let serieTypePart = serieStr;

  if (yearMatch && yearMatch[0]) {
    academicYearFallback = yearMatch[0];
    // If it's a range YYYY-YYYY, keep it. If it's just YYYY, also keep it.
    // This part is mostly for fallback if anneeScolaireImportee is missing or old format.
    serieTypePart = serieStr.replace(yearMatch[0], '').trim();
  }

  const serieKeywords = ["GÉNÉRALE", "GENERALE", "PROFESSIONNELLE", "PRO", "BEPC", "TECHNIQUE", "TECHNOLOGIQUE", "MODERNE LONG", "MODERNE COURT"];
  let foundSerieKeyword: string | undefined = undefined;

  if (serieTypePart) {
    for (const keyword of serieKeywords) {
      if (normalizeTextForComparison(serieTypePart).includes(normalizeTextForComparison(keyword))) {
        const originalKeywordRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const originalKeywordMatch = serieTypePart.match(originalKeywordRegex);
        foundSerieKeyword = originalKeywordMatch ? originalKeywordMatch[0] : keyword;
        break;
      }
    }
    if (!foundSerieKeyword && serieTypePart.trim() !== "" && serieTypePart.trim().toUpperCase() !== academicYearFallback?.toUpperCase()) {
        foundSerieKeyword = serieTypePart.trim();
    }
  }
  
  return { academicYearFallback, serieType: foundSerieKeyword };
};


export function FilterProvider({ children }: { children: ReactNode }) {
  const [allProcessedStudents, setAllProcessedStudents] = useState<ProcessedStudentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [availableAcademicYears, setAvailableAcademicYears] = useState<string[]>([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(ALL_ACADEMIC_YEARS_VALUE);

  const [availableSerieTypes, setAvailableSerieTypes] = useState<string[]>([]);
  const [selectedSerieType, setSelectedSerieType] = useState<string>(ALL_SERIE_TYPES_VALUE);

  const [availableEstablishments, setAvailableEstablishments] = useState<string[]>([]);
  const [selectedEstablishment, setSelectedEstablishment] = useState<string>(ALL_ESTABLISHMENTS_VALUE);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      if (!db) {
        const dbErrorMsg = "La base de données Firestore n'est pas initialisée. Vérifiez la configuration Firebase (src/lib/firebase.ts), votre connexion internet, et que Firestore est activé avec les bonnes règles de sécurité.";
        setError(dbErrorMsg);
        console.error("FilterContext: Firestore DB not initialized.", dbErrorMsg);
        setIsLoading(false);
        setAvailableAcademicYears([]);
        setAvailableSerieTypes([]);
        setAvailableEstablishments([]);
        return;
      }

      try {
        const studentCollectionRef = collection(db, 'brevetResults');
        const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(studentCollectionRef);

        const students: ProcessedStudentData[] = [];
        const academicYearsSet = new Set<string>();
        const serieTypesSet = new Set<string>();
        const establishmentsSet = new Set<string>();

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          
          const anneeOriginaleField = data['Série'];
          // anneeScolaireImportee should now be in "YYYY" format from new imports.
          const importedYear: string | undefined = data['anneeScolaireImportee'] || data.anneeScolaireImportee; 

          const { academicYearFallback, serieType: parsedSerieType } = parseOriginalSerieField(anneeOriginaleField);
          
          // Prefer the direct importedYear (YYYY format). Fallback to parsed from 'Série' only if necessary.
          const finalAcademicYear = importedYear || academicYearFallback;
          const finalSerieType = parsedSerieType;

          const studentToAdd: ProcessedStudentData = {
            id: doc.id, 
            nom: data['Nom candidat'] || 'N/A',
            prenom: data['Prénom candidat'] || 'N/A',
            etablissement: data['Libellé Etablissement'] || 'N/A',
            anneeOriginale: anneeOriginaleField, 
            academicYear: finalAcademicYear, // Will be "YYYY" if importedYear is present and correct
            serieType: finalSerieType,
            resultat: data['Résultat'],
            moyenne: data['Moyenne sur 20'] !== undefined && data['Moyenne sur 20'] !== null ? Number(data['Moyenne sur 20']) : undefined,
            
            scoreFrancais: data.scoreFrancais !== undefined && data.scoreFrancais !== null ? Number(data.scoreFrancais) : undefined,
            scoreMaths: data.scoreMaths !== undefined && data.scoreMaths !== null ? Number(data.scoreMaths) : undefined,
            scoreHistoireGeo: data.scoreHistoireGeo !== undefined && data.scoreHistoireGeo !== null ? Number(data.scoreHistoireGeo) : undefined,
            scoreSciences: data.scoreSciences !== undefined && data.scoreSciences !== null ? Number(data.scoreSciences) : undefined,
            scoreOralDNB: data.scoreOralDNB !== undefined && data.scoreOralDNB !== null ? Number(data.scoreOralDNB) : undefined,
            scoreLVE: data.scoreLVE !== undefined && data.scoreLVE !== null ? Number(data.scoreLVE) : undefined,
            scoreArtsPlastiques: data.scoreArtsPlastiques !== undefined && data.scoreArtsPlastiques !== null ? Number(data.scoreArtsPlastiques) : undefined,
            scoreEducationMusicale: data.scoreEducationMusicale !== undefined && data.scoreEducationMusicale !== null ? Number(data.scoreEducationMusicale) : undefined,
            scoreEPS: data.scoreEPS !== undefined && data.scoreEPS !== null ? Number(data.scoreEPS) : undefined,
            scorePhysiqueChimie: data.scorePhysiqueChimie !== undefined && data.scorePhysiqueChimie !== null ? Number(data.scorePhysiqueChimie) : undefined,
            scoreSciencesVie: data.scoreSciencesVie !== undefined && data.scoreSciencesVie !== null ? Number(data.scoreSciencesVie) : undefined,
          };
          students.push(studentToAdd);

          if (finalAcademicYear && String(finalAcademicYear).trim() !== "" && finalAcademicYear !== "N/A") {
             academicYearsSet.add(String(finalAcademicYear).trim());
          }
          if (finalSerieType && String(finalSerieType).trim() !== "" && finalSerieType !== "N/A") {
            serieTypesSet.add(String(finalSerieType).trim());
          }
          const etablissementName = data['Libellé Etablissement'];
          if (etablissementName && String(etablissementName).trim() !== "") {
            establishmentsSet.add(String(etablissementName).trim());
          }
        });

        setAllProcessedStudents(students);

        const sortedAcademicYears = Array.from(academicYearsSet)
          .filter(year => year !== undefined && year !== null && String(year).trim() !== "")
          .sort((a, b) => {
            const sA = String(a);
            const sB = String(b);
            
            const getStartYear = (yearStr: string) => parseInt(yearStr.substring(0, 4), 10);

            const startYearA = getStartYear(sA);
            const startYearB = getStartYear(sB);

            if (isNaN(startYearA) && isNaN(startYearB)) return sB.localeCompare(sA); 
            if (isNaN(startYearA)) return 1; 
            if (isNaN(startYearB)) return -1;

            if (startYearB !== startYearA) {
                return startYearB - startYearA; 
            }
            return sB.length - sA.length; 
        });

        setAvailableAcademicYears(sortedAcademicYears);
        if (sortedAcademicYears.length > 0) {
          const latestSingleYear = sortedAcademicYears.find(year => /^\d{4}$/.test(year));
          setSelectedAcademicYear(latestSingleYear || sortedAcademicYears[0]); 
        } else {
          setSelectedAcademicYear(ALL_ACADEMIC_YEARS_VALUE);
        }

        const sortedSerieTypes = Array.from(serieTypesSet)
          .filter(serie => serie !== undefined && serie !== null && String(serie).trim() !== "")
          .sort();
        setAvailableSerieTypes(sortedSerieTypes);
        const generaleEquivalent = sortedSerieTypes.find(s => normalizeTextForComparison(s) === normalizeTextForComparison("GÉNÉRALE"));
        if (generaleEquivalent) {
          setSelectedSerieType(generaleEquivalent);
        } else if (sortedSerieTypes.length > 0) {
          setSelectedSerieType(sortedSerieTypes[0]); 
        } else {
          setSelectedSerieType(ALL_SERIE_TYPES_VALUE);
        }

        const sortedEstablishments = Array.from(establishmentsSet)
         .filter(est => est !== undefined && est !== null && String(est).trim() !== "")
         .sort();
        setAvailableEstablishments(sortedEstablishments);
        if (sortedEstablishments.length > 0) {
          setSelectedEstablishment(sortedEstablishments[0]); 
        } else {
          setSelectedEstablishment(ALL_ESTABLISHMENTS_VALUE);
        }

      } catch (err: any) {
        console.error("Erreur de récupération des données Firestore pour les filtres:", err);
        setError(`Impossible de charger les données des filtres: ${err.message}. Vérifiez les règles de sécurité Firestore et la console du navigateur.`);
        setAvailableAcademicYears([]);
        setAvailableSerieTypes([]);
        setAvailableEstablishments([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []); 

  const contextValue: FilterContextType = {
    allProcessedStudents,
    isLoading,
    error,
    availableAcademicYears,
    selectedAcademicYear,
    setSelectedAcademicYear: useCallback((year: string) => setSelectedAcademicYear(year), []),
    availableSerieTypes,
    selectedSerieType,
    setSelectedSerieType: useCallback((serie: string) => setSelectedSerieType(serie), []),
    availableEstablishments,
    selectedEstablishment,
    setSelectedEstablishment: useCallback((establishment: string) => setSelectedEstablishment(establishment), []),
    ALL_ACADEMIC_YEARS_VALUE,
    ALL_SERIE_TYPES_VALUE,
    ALL_ESTABLISHMENTS_VALUE,
  };

  return <FilterContext.Provider value={contextValue}>{children}</FilterContext.Provider>;
}

export function useFilters(): FilterContextType {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error('useFilters must be used within a FilterProvider');
  }
  return context;
}
