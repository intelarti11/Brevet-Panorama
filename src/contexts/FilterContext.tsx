
"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, getDocs, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface ProcessedStudentData {
  id: string; // INE, used as document ID
  nom: string;
  prenom: string;
  etablissement: string;
  anneeOriginale: string; // The raw data['Série'] or other original year/serie field from Firestore
  academicYear?: string; // Parsed or directly imported e.g., "2023-2024"
  serieType?: string; // Parsed e.g., "GÉNÉRALE"
  resultat: string;
  moyenne?: number;
  scoreFrancais?: number;
  scoreMaths?: number;
  scoreHistoireGeo?: number;
  scoreSciences?: number;
  // Potentially add other fields from StudentData if needed directly in components, like 'TOTAL POUR MENTION'
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

const parseOriginalSerieField = (rawSerieOriginale: string | undefined): { academicYearFallback: string; serieType: string } => {
  if (!rawSerieOriginale) return { academicYearFallback: "N/A", serieType: "N/A" };

  const yearRegex = /(\d{4}[-\/]\d{4}|\b\d{4}\b)/;
  const yearMatch = rawSerieOriginale.match(yearRegex);
  let academicYearFallback = "N/A";
  let serieTypePart = rawSerieOriginale;

  if (yearMatch) {
    academicYearFallback = yearMatch[0];
    serieTypePart = rawSerieOriginale.replace(yearMatch[0], '').trim();
  }

  const serieKeywords = ["GÉNÉRALE", "GENERALE", "PROFESSIONNELLE", "PRO", "BEPC", "TECHNIQUE", "TECHNOLOGIQUE", "MODERNE LONG", "MODERNE COURT"];
  let foundSerieKeyword = "N/A";

  for (const keyword of serieKeywords) {
    if (normalizeTextForComparison(serieTypePart).includes(normalizeTextForComparison(keyword))) {
      const originalKeywordRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const originalKeywordMatch = serieTypePart.match(originalKeywordRegex);
      foundSerieKeyword = originalKeywordMatch ? originalKeywordMatch[0] : keyword;
      break;
    }
  }

  if (foundSerieKeyword === "N/A" && serieTypePart && serieTypePart.trim() !== "") {
      foundSerieKeyword = serieTypePart.trim();
  }

  return { academicYearFallback, serieType: foundSerieKeyword === "" ? "N/A" : foundSerieKeyword };
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
        setError("La base de données Firestore n'est pas initialisée. Vérifiez la configuration Firebase (src/lib/firebase.ts) et votre connexion internet. Assurez-vous que Firestore est activé dans votre projet Firebase et que les règles de sécurité autorisent la lecture.");
        setIsLoading(false);
        return;
      }

      try {
        const studentCollectionRef = collection(db, 'brevetResults');
        const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(studentCollectionRef);

        if (querySnapshot.empty) {
          // No error, but filters will be empty. User should import data.
        }

        const students: ProcessedStudentData[] = [];
        const academicYearsSet = new Set<string>();
        const serieTypesSet = new Set<string>();
        const establishmentsSet = new Set<string>();

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // Use the new harmonized field names for reading from Firestore
          const anneeOriginaleField = data['Série'] || ""; // From Excel 'Série' field
          const importedYear = data.anneeScolaireImportee; // Field added by the app during import

          const { academicYearFallback, serieType } = parseOriginalSerieField(anneeOriginaleField);

          const finalAcademicYear = importedYear || academicYearFallback;

          students.push({
            id: doc.id, // doc.id is the INE
            nom: data['Nom candidat'] || 'N/A',
            prenom: data['Prénom candidat'] || 'N/A',
            etablissement: data['Libellé Etablissement'] || 'N/A',
            anneeOriginale: anneeOriginaleField,
            academicYear: finalAcademicYear,
            serieType: serieType,
            resultat: data['Résultat'] || 'N/A',
            moyenne: data['Moyenne sur 20'] !== undefined && data['Moyenne sur 20'] !== null ? Number(data['Moyenne sur 20']) : undefined,
            // Score fields are still read by their camelCase names from data (as defined in Zod schema)
            scoreFrancais: data.scoreFrancais !== undefined && data.scoreFrancais !== null ? Number(data.scoreFrancais) : undefined,
            scoreMaths: data.scoreMaths !== undefined && data.scoreMaths !== null ? Number(data.scoreMaths) : undefined,
            scoreHistoireGeo: data.scoreHistoireGeo !== undefined && data.scoreHistoireGeo !== null ? Number(data.scoreHistoireGeo) : undefined,
            scoreSciences: data.scoreSciences !== undefined && data.scoreSciences !== null ? Number(data.scoreSciences) : undefined,
          });

          if (finalAcademicYear && finalAcademicYear !== "N/A" && String(finalAcademicYear).trim() !== "") {
             academicYearsSet.add(String(finalAcademicYear).trim());
          }
          if (serieType && serieType !== "N/A" && String(serieType).trim() !== "") {
            serieTypesSet.add(String(serieType).trim());
          }
          // Use 'Libellé Etablissement' for establishmentsSet
          const etablissementName = data['Libellé Etablissement'];
          if (etablissementName && String(etablissementName).trim() !== "") {
            establishmentsSet.add(String(etablissementName).trim());
          }
        });

        setAllProcessedStudents(students);

        const sortedAcademicYears = Array.from(academicYearsSet).sort((a, b) => {
            if (!a || !b) return 0;
            const yearAVal = parseInt(String(a).substring(0,4));
            const yearBVal = parseInt(String(b).substring(0,4));
            if (isNaN(yearAVal) || isNaN(yearBVal)) return String(b).localeCompare(String(a));
            if (yearBVal !== yearAVal) return yearBVal - yearAVal;
            return String(b).localeCompare(String(a));
        });

        setAvailableAcademicYears(sortedAcademicYears);
        if (sortedAcademicYears.length > 0) {
          setSelectedAcademicYear(sortedAcademicYears[0]);
        } else {
          setSelectedAcademicYear(ALL_ACADEMIC_YEARS_VALUE);
        }

        const sortedSerieTypes = Array.from(serieTypesSet).sort();
        setAvailableSerieTypes(sortedSerieTypes);
        const generaleEquivalent = sortedSerieTypes.find(s => normalizeTextForComparison(s) === normalizeTextForComparison("GÉNÉRALE"));
        if (generaleEquivalent) {
          setSelectedSerieType(generaleEquivalent);
        } else if (sortedSerieTypes.length > 0) {
          setSelectedSerieType(sortedSerieTypes[0]);
        } else {
          setSelectedSerieType(ALL_SERIE_TYPES_VALUE);
        }

        const sortedEstablishments = Array.from(establishmentsSet).sort();
        setAvailableEstablishments(sortedEstablishments);
        // Default to "All Establishments"
        setSelectedEstablishment(ALL_ESTABLISHMENTS_VALUE);


      } catch (err: any) {
        console.error("Erreur de récupération des données Firestore:", err);
        setError(`Impossible de charger les données des filtres: ${err.message}. Vérifiez les règles de sécurité Firestore et la console du navigateur pour plus de détails.`);
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
