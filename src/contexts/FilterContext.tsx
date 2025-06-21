
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
  anneeOriginale?: string; // The raw data['Série'] or other original year/serie field from Firestore
  academicYear?: string; // Parsed or directly imported e.g., "2023"
  serieType?: string; // Parsed e.g., "GÉNÉRALE"
  resultat?: string;
  moyenne?: number;
  totalGeneral?: number;
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
  isLoading: boolean; // Is loading filter options
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

  parseStudentDoc: (doc: DocumentData) => ProcessedStudentData;
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

const parseOriginalSerieField = (rawSerieOriginale: string | undefined): { academicYearFallback?: string; serieType?: string } => {
  if (!rawSerieOriginale || String(rawSerieOriginale).trim() === "") return { academicYearFallback: undefined, serieType: undefined };

  const serieStr = String(rawSerieOriginale);
  const yearRegex = /(\d{4}[-\/]\d{4}|\b\d{4}\b)/;
  const yearMatch = serieStr.match(yearRegex);
  let academicYearFallback: string | undefined = undefined;
  let serieTypePart = serieStr;

  if (yearMatch && yearMatch[0]) {
    academicYearFallback = yearMatch[0];
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

const parseStudentDoc = (doc: DocumentData): ProcessedStudentData => {
    const data = doc.data();
    const anneeOriginaleField = data['Série'];
    const importedYear: string | undefined = data['anneeScolaireImportee'] || data.anneeScolaireImportee;
    const { academicYearFallback, serieType: parsedSerieType } = parseOriginalSerieField(anneeOriginaleField);
    const finalAcademicYear = importedYear || academicYearFallback;
    const finalSerieType = parsedSerieType;

    return {
        id: doc.id,
        nom: data['Nom candidat'] || 'N/A',
        prenom: data['Prénom candidat'] || 'N/A',
        etablissement: data['Libellé Etablissement'] || 'N/A',
        anneeOriginale: anneeOriginaleField,
        academicYear: finalAcademicYear,
        serieType: finalSerieType,
        resultat: data['Résultat'],
        moyenne: data['Moyenne sur 20'] !== undefined && data['Moyenne sur 20'] !== null ? Number(data['Moyenne sur 20']) : undefined,
        totalGeneral: data['TOTAL GENERAL'] !== undefined && data['TOTAL GENERAL'] !== null ? Number(data['TOTAL GENERAL']) : undefined,
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
};

export function FilterProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [availableAcademicYears, setAvailableAcademicYears] = useState<string[]>([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');

  const [availableSerieTypes, setAvailableSerieTypes] = useState<string[]>([]);
  const [selectedSerieType, setSelectedSerieType] = useState<string>('');

  const [availableEstablishments, setAvailableEstablishments] = useState<string[]>([]);
  const [selectedEstablishment, setSelectedEstablishment] = useState<string>('');

  useEffect(() => {
    const fetchFilterOptions = async () => {
      setIsLoading(true);
      setError(null);

      if (!db) {
        const dbErrorMsg = "La base de données Firestore n'est pas initialisée.";
        setError(dbErrorMsg);
        setIsLoading(false);
        return;
      }

      try {
        const studentCollectionRef = collection(db, 'brevetResults');
        const querySnapshot = await getDocs(studentCollectionRef);

        const academicYearsSet = new Set<string>();
        const serieTypesSet = new Set<string>();
        const establishmentsSet = new Set<string>();

        querySnapshot.forEach((doc) => {
          const student = parseStudentDoc(doc);
          if (student.academicYear) academicYearsSet.add(student.academicYear);
          if (student.serieType) serieTypesSet.add(student.serieType);
          if (student.etablissement) establishmentsSet.add(student.etablissement);
        });

        const sortedAcademicYears = Array.from(academicYearsSet).sort((a, b) => b.localeCompare(a));
        setAvailableAcademicYears(sortedAcademicYears);
        if (sortedAcademicYears.length > 0) {
          const latestYear = sortedAcademicYears[0];
          setSelectedAcademicYear(latestYear);
        } else {
            setSelectedAcademicYear(ALL_ACADEMIC_YEARS_VALUE);
        }

        const sortedSerieTypes = Array.from(serieTypesSet).sort();
        setAvailableSerieTypes(sortedSerieTypes);
        const generaleEquivalent = sortedSerieTypes.find(s => normalizeTextForComparison(s) === "générale");
        if (generaleEquivalent) {
            setSelectedSerieType(generaleEquivalent);
        } else if (sortedSerieTypes.length > 0) {
            setSelectedSerieType(sortedSerieTypes[0]);
        } else {
            setSelectedSerieType(ALL_SERIE_TYPES_VALUE);
        }

        const sortedEstablishments = Array.from(establishmentsSet).sort();
        setAvailableEstablishments(sortedEstablishments);
        if(sortedEstablishments.length > 0) {
            setSelectedEstablishment(ALL_ESTABLISHMENTS_VALUE); // Default to all establishments
        }

      } catch (err: any) {
        console.error("Erreur de récupération des options de filtre:", err);
        setError(`Impossible de charger les filtres: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchFilterOptions();
  }, []);

  const contextValue: FilterContextType = {
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
    parseStudentDoc,
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
