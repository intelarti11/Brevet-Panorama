
"use client";

import type { ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, AlertTriangle, ArrowUp, ArrowDown, ChevronsUpDown, SlidersHorizontal } from 'lucide-react';
import { useFilters, type ProcessedStudentData, ALL_ACADEMIC_YEARS_VALUE, ALL_SERIE_TYPES_VALUE, ALL_ESTABLISHMENTS_VALUE } from '@/contexts/FilterContext';
import { StudentDetailModal } from '@/components/student-detail-modal';

const normalizeText = (text: string | undefined): string => {
  if (text === null || text === undefined) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

export default function DonneePage() {
  const { 
    allProcessedStudents, 
    isLoading: isLoadingContext, 
    error: errorContext,
    selectedAcademicYear,
    selectedSerieType,
    selectedEstablishment
  } = useFilters();
  
  const [filteredData, setFilteredData] = useState<ProcessedStudentData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof ProcessedStudentData | null; direction: 'ascending' | 'descending' }>({ key: null, direction: 'ascending' });
  const [selectedStudentForModal, setSelectedStudentForModal] = useState<ProcessedStudentData | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  useEffect(() => {
    let data = [...allProcessedStudents]; 

    if (selectedAcademicYear && selectedAcademicYear !== ALL_ACADEMIC_YEARS_VALUE) {
      data = data.filter(student => student.academicYear === selectedAcademicYear);
    }
    if (selectedSerieType && selectedSerieType !== ALL_SERIE_TYPES_VALUE) {
      data = data.filter(student => student.serieType === selectedSerieType);
    }
    if (selectedEstablishment && selectedEstablishment !== ALL_ESTABLISHMENTS_VALUE) {
      data = data.filter(student => student.etablissement === selectedEstablishment);
    }
    
    if (searchTerm) {
      const normalizedSearchTerm = normalizeText(searchTerm);
      data = data.filter(student =>
        normalizeText(student.nom).includes(normalizedSearchTerm) ||
        normalizeText(student.prenom).includes(normalizedSearchTerm) ||
        normalizeText(student.id).includes(normalizedSearchTerm)
      );
    }

    if (sortConfig.key) {
      const sortKey = sortConfig.key;
      data.sort((a, b) => {
        const valA = a[sortKey];
        const valB = b[sortKey];

        if (valA === null || valA === undefined) {
          return (valB === null || valB === undefined) ? 0 : 1;
        }
        if (valB === null || valB === undefined) {
          return -1;
        }
        
        let comparison = 0;
        if (sortKey === 'moyenne') {
          comparison = (valA as number) - (valB as number);
        } else {
          comparison = normalizeText(String(valA)).localeCompare(normalizeText(String(valB)));
        }
        return sortConfig.direction === 'ascending' ? comparison : -comparison;
      });
    }
    setFilteredData(data);
  }, [searchTerm, selectedAcademicYear, selectedSerieType, selectedEstablishment, allProcessedStudents, sortConfig]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleSort = (key: keyof ProcessedStudentData) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getBadgeVariant = (resultat: string | undefined): "default" | "secondary" | "destructive" | "outline" => {
    if (!resultat) return "secondary";
    const lowerResultat = resultat.toLowerCase();
    if (lowerResultat.includes('refusé')) return "destructive";
    if (lowerResultat.includes('admis')) return "default";
    return "secondary";
  };

  const renderSortIcon = (columnKey: keyof ProcessedStudentData) => {
    if (sortConfig.key !== columnKey) {
      return <ChevronsUpDown className="ml-2 h-4 w-4 text-muted-foreground/60" />;
    }
    return sortConfig.direction === 'ascending' 
      ? <ArrowUp className="ml-2 h-4 w-4 text-foreground" /> 
      : <ArrowDown className="ml-2 h-4 w-4 text-foreground" />;
  };

  const handleRowClick = (student: ProcessedStudentData) => {
    setSelectedStudentForModal(student);
    setIsDetailModalOpen(true);
  };

  if (isLoadingContext) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-1 md:p-4">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Chargement des données des élèves...</p>
      </div>
    );
  }

  if (errorContext) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-1 md:p-4 text-center">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-destructive mb-2">Erreur de chargement</h2>
        <p className="text-muted-foreground max-w-md">{errorContext}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Gestion des Données Élèves</h1>
        <p className="text-muted-foreground mt-1">
          Recherchez et consultez les résultats détaillés des élèves au brevet. Les filtres se trouvent dans la barre latérale.
        </p>
      </header>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
            <CardTitle className="flex items-center text-xl">
                <SlidersHorizontal className="mr-2 h-5 w-5 text-primary" />
                Recherche Locale
            </CardTitle>
            <CardDescription>Affinez votre recherche sur les données actuellement filtrées.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label htmlFor="search" className="block text-sm font-medium text-foreground">
                Rechercher (Nom, Prénom, INE)
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search"
                  type="text"
                  placeholder="Nom, Prénom, INE..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="pl-10"
                />
              </div>
            </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl">Résultats des Élèves</CardTitle>
          <CardDescription>
            Liste des élèves correspondant aux critères sélectionnés. Affichage de {filteredData.length} sur {allProcessedStudents.length} élèves au total.
            Cliquez sur une ligne pour voir les détails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredData.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[120px] cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleSort('id')}>
                      <div className="flex items-center">INE{renderSortIcon('id')}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleSort('nom')}>
                      <div className="flex items-center">Nom{renderSortIcon('nom')}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleSort('prenom')}>
                      <div className="flex items-center">Prénom{renderSortIcon('prenom')}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleSort('etablissement')}>
                      <div className="flex items-center">Établissement{renderSortIcon('etablissement')}</div>
                    </TableHead>
                     <TableHead className="cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleSort('academicYear')}>
                      <div className="flex items-center">Année Scolaire{renderSortIcon('academicYear')}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleSort('serieType')}>
                      <div className="flex items-center">Série{renderSortIcon('serieType')}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleSort('resultat')}>
                      <div className="flex items-center">Résultat{renderSortIcon('resultat')}</div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleSort('moyenne')}>
                      <div className="flex items-center justify-end">Moyenne (/20){renderSortIcon('moyenne')}</div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((student) => (
                    <TableRow 
                        key={student.id} 
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => handleRowClick(student)}
                    >
                      <TableCell className="font-mono text-xs">{student.id}</TableCell>
                      <TableCell className="font-medium">{student.nom}</TableCell>
                      <TableCell>{student.prenom}</TableCell>
                      <TableCell>{student.etablissement}</TableCell>
                      <TableCell>{student.academicYear || 'N/A'}</TableCell>
                      <TableCell>{student.serieType || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant={getBadgeVariant(student.resultat)} className="text-xs">
                          {student.resultat || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {student.moyenne !== undefined && student.moyenne !== null ? student.moyenne.toFixed(2) : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg">
              <Search className="w-16 h-16 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">Aucun élève trouvé</p>
              <p className="text-sm text-muted-foreground">
                Veuillez ajuster vos filtres ou votre terme de recherche. Il se peut aussi qu'aucune donnée n'ait été importée.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedStudentForModal && (
        <StudentDetailModal
          student={selectedStudentForModal}
          isOpen={isDetailModalOpen}
          onOpenChange={setIsDetailModalOpen}
        />
      )}
    </div>
  );
}
