
"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, getDocs, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// This interface will be used by DonneePage and PanoramaPage
export interface ProcessedStudentData {
  id: string; // INE
  nom: string;
  prenom: string;
  etablissement: string;
  anneeOriginale: string; // The raw data.serie from Firestore
  academicYear?: string; // Parsed e.g., "2023-2024"
  serieType?: string; // Parsed e.g., "GÉNÉRALE"
  resultat: string;
  moyenne?: number;
  // Panorama specific fields
  scoreFrancais?: number;
  scoreMaths?: number;
  scoreHistoireGeo?: number;
  scoreSciences?: number;
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

  // Constants for "all" options
  ALL_ACADEMIC_YEARS_VALUE: string;
  ALL_SERIE_TYPES_VALUE: string;
  ALL_ESTABLISHMENTS_VALUE: string;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const ALL_ACADEMIC_YEARS_VALUE = "__ALL_ACADEMIC_YEARS__";
export const ALL_SERIE_TYPES_VALUE = "__ALL_SERIE_TYPES__";
export const ALL_ESTABLISHMENTS_VALUE = "__ALL_ESTABLISHMENTS__";

const normalizeTextForComparison = (text: string): string => {
  if (text === null || text === undefined) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

// Basic parsing function for 'serie' field
// Example: "2023-2024 GÉNÉRALE" -> { academicYear: "2023-2024", serieType: "GÉNÉRALE" }
// Example: "2023" -> { academicYear: "2023", serieType: "N/A" }
// Example: "PROFESSIONNELLE" -> { academicYear: "N/A", serieType: "PROFESSIONNELLE" }
const parseSerieField = (rawSerie: string): { academicYear: string; serieType: string } => {
  if (!rawSerie) return { academicYear: "N/A", serieType: "N/A" };

  const yearRegex = /(\d{4}-\d{4}|\b\d{4}\b)/;
  const yearMatch = rawSerie.match(yearRegex);
  let academicYear = "N/A";
  let serieTypePart = rawSerie;

  if (yearMatch) {
    academicYear = yearMatch[0];
    serieTypePart = rawSerie.replace(yearMatch[0], '').trim();
  }

  // Keywords for series, case-insensitive
  const serieKeywords = ["GÉNÉRALE", "GENERALE", "PROFESSIONNELLE", "PRO", "BEPC", "TECHNIQUE", "TECHNOLOGIQUE"];
  let foundSerieKeyword = "N/A";

  for (const keyword of serieKeywords) {
    if (normalizeTextForComparison(serieTypePart).includes(normalizeTextForComparison(keyword))) {
      // Find the original casing of the keyword in serieTypePart
      const originalKeywordRegex = new RegExp(keyword.split('').map(char => `[${char.toUpperCase()}${char.toLowerCase()}]`).join(''), 'i');
      const originalKeywordMatch = serieTypePart.match(originalKeywordRegex);
      foundSerieKeyword = originalKeywordMatch ? originalKeywordMatch[0] : keyword; // Use original casing if possible
      serieTypePart = serieTypePart.replace(originalKeywordRegex, '').trim();
      break;
    }
  }
  
  if (foundSerieKeyword === "N/A" && serieTypePart && !yearMatch) { // If no year and no keyword, assume the whole string is type
      foundSerieKeyword = serieTypePart;
  } else if (foundSerieKeyword === "N/A" && serieTypePart && yearMatch) { // Year found, rest is type
      foundSerieKeyword = serieTypePart || "N/A";
  } else if (foundSerieKeyword === "N/A" && !serieTypePart && yearMatch) { // Only year found
      foundSerieKeyword = "N/A";
  }


  return { academicYear, serieType: foundSerieKeyword === "" ? "N/A" : foundSerieKeyword };
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
      if (!db) {
        setError("La base de données Firestore n'est pas initialisée.");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const studentCollectionRef = collection(db, 'brevetResults');
        const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(studentCollectionRef);
        
        const students: ProcessedStudentData[] = [];
        const academicYearsSet = new Set<string>();
        const serieTypesSet = new Set<string>();
        const establishmentsSet = new Set<string>();

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const rawSerie = data.serie || "N/A";
          const { academicYear, serieType } = parseSerieField(rawSerie);

          students.push({
            id: doc.id, 
            nom: data.nomCandidat || 'N/A',
            prenom: data.prenomsCandidat || 'N/A',
            etablissement: data.libelleEtablissement || 'N/A',
            anneeOriginale: rawSerie,
            academicYear: academicYear,
            serieType: serieType,
            resultat: data.resultat || 'N/A',
            moyenne: data.totalPourcentage !== undefined && data.totalPourcentage !== null ? Number(data.totalPourcentage) : undefined,
            scoreFrancais: data.scoreFrancais !== undefined && data.scoreFrancais !== null ? Number(data.scoreFrancais) : undefined,
            scoreMaths: data.scoreMaths !== undefined && data.scoreMaths !== null ? Number(data.scoreMaths) : undefined,
            scoreHistoireGeo: data.scoreHistoireGeo !== undefined && data.scoreHistoireGeo !== null ? Number(data.scoreHistoireGeo) : undefined,
            scoreSciences: data.scoreSciences !== undefined && data.scoreSciences !== null ? Number(data.scoreSciences) : undefined,
          });

          if (academicYear !== "N/A") academicYearsSet.add(academicYear);
          if (serieType !== "N/A") serieTypesSet.add(serieType);
          if (data.libelleEtablissement) establishmentsSet.add(data.libelleEtablissement);
        });

        setAllProcessedStudents(students);
        
        const sortedAcademicYears = Array.from(academicYearsSet).sort((a, b) => b.localeCompare(a)); // Sort descending for "most recent"
        setAvailableAcademicYears(sortedAcademicYears);
        if (sortedAcademicYears.length > 0) {
          setSelectedAcademicYear(sortedAcademicYears[0]); // Default to most recent
        } else {
          setSelectedAcademicYear(ALL_ACADEMIC_YEARS_VALUE);
        }

        const sortedSerieTypes = Array.from(serieTypesSet).sort();
        setAvailableSerieTypes(sortedSerieTypes);
        // Default to "GÉNÉRALE" if available, case-insensitive check
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
        if (sortedEstablishments.length > 0) {
          setSelectedEstablishment(sortedEstablishments[0]); // Default to first found
        } else {
          setSelectedEstablishment(ALL_ESTABLISHMENTS_VALUE);
        }

      } catch (err: any) {
        console.error("Erreur de récupération des données Firestore:", err);
        setError(`Impossible de charger les données: ${err.message}.`);
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
