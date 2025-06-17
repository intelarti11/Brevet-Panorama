
"use client";

import type { ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, SlidersHorizontal, Loader2, AlertTriangle, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { getFirestore, collection, getDocs, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { app, db } from '@/lib/firebase'; 

interface DisplayStudentData {
  id: string;
  nom: string;
  prenom: string;
  etablissement: string;
  annee: string; 
  resultat: string;
  moyenne?: number;
}

const ALL_YEARS_VALUE = "__ALL_YEARS__";
const ALL_ESTABLISHMENTS_VALUE = "__ALL_ESTABLISHMENTS__";

const normalizeText = (text: string): string => {
  if (text === null || text === undefined) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

export default function DonneePage() {
  const [allStudentsData, setAllStudentsData] = useState<DisplayStudentData[]>([]);
  const [filteredData, setFilteredData] = useState<DisplayStudentData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>(ALL_YEARS_VALUE);
  const [selectedEstablishment, setSelectedEstablishment] = useState<string>(ALL_ESTABLISHMENTS_VALUE);
  
  const [sortConfig, setSortConfig] = useState<{ key: keyof DisplayStudentData | null; direction: 'ascending' | 'descending' }>({ key: null, direction: 'ascending' });

  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [availableEstablishments, setAvailableEstablishments] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!db) {
        setError("La base de données Firestore n'est pas initialisée. Vérifiez la configuration Firebase.");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const studentCollectionRef = collection(db, 'brevetResults');
        const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(studentCollectionRef);
        
        const students: DisplayStudentData[] = [];
        const years = new Set<string>();
        const establishments = new Set<string>();

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const studentToAdd: DisplayStudentData = {
            id: doc.id, 
            nom: data.nomCandidat || 'N/A',
            prenom: data.prenomsCandidat || 'N/A',
            etablissement: data.libelleEtablissement || 'N/A',
            annee: data.serie || 'N/A', 
            resultat: data.resultat || 'N/A',
            moyenne: data.totalPourcentage !== undefined && data.totalPourcentage !== null ? Number(data.totalPourcentage) : undefined,
          };
          students.push(studentToAdd);
          if (data.serie) years.add(data.serie);
          if (data.libelleEtablissement) establishments.add(data.libelleEtablissement);
        });

        setAllStudentsData(students);
        setAvailableYears(Array.from(years).sort());
        setAvailableEstablishments(Array.from(establishments).sort());

      } catch (err: any) {
        console.error("Erreur de récupération des données Firestore:", err);
        setError(`Impossible de charger les données des élèves: ${err.message}. Vérifiez la console pour plus de détails et assurez-vous que la collection 'brevetResults' existe et que les règles de sécurité le permettent.`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    let data = [...allStudentsData]; 

    if (selectedYear && selectedYear !== ALL_YEARS_VALUE) {
      data = data.filter(student => student.annee === selectedYear);
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
  }, [searchTerm, selectedYear, selectedEstablishment, allStudentsData, sortConfig]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleSort = (key: keyof DisplayStudentData) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getBadgeVariant = (resultat: string): "default" | "secondary" | "destructive" | "outline" => {
    const lowerResultat = resultat.toLowerCase();
    if (lowerResultat.includes('refusé')) return "destructive";
    if (lowerResultat.includes('admis')) return "default";
    return "secondary";
  };

  const renderSortIcon = (columnKey: keyof DisplayStudentData) => {
    if (sortConfig.key !== columnKey) {
      return <ChevronsUpDown className="ml-2 h-4 w-4 text-muted-foreground/60" />;
    }
    return sortConfig.direction === 'ascending' 
      ? <ArrowUp className="ml-2 h-4 w-4 text-foreground" /> 
      : <ArrowDown className="ml-2 h-4 w-4 text-foreground" />;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-1 md:p-4">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Chargement des données des élèves...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-1 md:p-4 text-center">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-destructive mb-2">Erreur de chargement</h2>
        <p className="text-muted-foreground max-w-md">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Gestion des Données Élèves</h1>
        <p className="text-muted-foreground mt-1">
          Recherchez, filtrez, triez et consultez les résultats détaillés des élèves au brevet.
        </p>
      </header>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <SlidersHorizontal className="mr-2 h-5 w-5 text-primary" />
            Filtres et Recherche
          </CardTitle>
          <CardDescription>Affinez votre recherche pour trouver les informations spécifiques.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="search" className="block text-sm font-medium text-foreground">
                Rechercher
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

            <div className="space-y-1.5">
              <label htmlFor="year" className="block text-sm font-medium text-foreground">Série / Année</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger id="year" className="w-full">
                  <SelectValue placeholder="Sélectionner une série/année" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_YEARS_VALUE}>Toutes les séries/années</SelectItem>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="establishment" className="block text-sm font-medium text-foreground">Établissement</label>
              <Select value={selectedEstablishment} onValueChange={setSelectedEstablishment}>
                <SelectTrigger id="establishment" className="w-full">
                  <SelectValue placeholder="Sélectionner un établissement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ESTABLISHMENTS_VALUE}>Tous les établissements</SelectItem>
                  {availableEstablishments.map(est => (
                    <SelectItem key={est} value={est}>{est}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl">Résultats des Élèves</CardTitle>
          <CardDescription>
            Liste des élèves correspondant aux critères de recherche et filtres sélectionnés. Affichage de {filteredData.length} sur {allStudentsData.length} élèves.
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
                    <TableHead className="cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleSort('annee')}>
                      <div className="flex items-center">Série/Année{renderSortIcon('annee')}</div>
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
                    <TableRow key={student.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs">{student.id}</TableCell>
                      <TableCell className="font-medium">{student.nom}</TableCell>
                      <TableCell>{student.prenom}</TableCell>
                      <TableCell>{student.etablissement}</TableCell>
                      <TableCell>{student.annee}</TableCell>
                      <TableCell>
                        <Badge variant={getBadgeVariant(student.resultat)} className="text-xs">
                          {student.resultat}
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
    </div>
  );
}

