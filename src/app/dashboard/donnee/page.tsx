
"use client";

import type { ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, SlidersHorizontal } from 'lucide-react';

interface DisplayStudentData {
  id: string; 
  nom: string;
  prenom: string;
  etablissement: string;
  annee: string; 
  resultat: string; 
  moyenne?: number;
}

const FAKE_YEARS = ["2024-2025", "2023-2024", "2022-2023", "2021-2022"];
const FAKE_ESTABLISHMENTS = ["Collège A. Camus", "Collège V. Hugo", "Lycée J. Moulin", "Collège P. Valéry"];

const FAKE_STUDENT_DATA: DisplayStudentData[] = [
  { id: '123456789AB', nom: 'Dupont', prenom: 'Jean', etablissement: 'Collège A. Camus', annee: '2023-2024', resultat: 'Admis Mention Bien', moyenne: 15.5 },
  { id: '987654321CD', nom: 'Martin', prenom: 'Alice', etablissement: 'Collège V. Hugo', annee: '2023-2024', resultat: 'Admis', moyenne: 12.0 },
  { id: '112233445EF', nom: 'Durand', prenom: 'Paul', etablissement: 'Collège A. Camus', annee: '2022-2023', resultat: 'Refusé', moyenne: 8.5 },
  { id: '556677889GH', nom: 'Petit', prenom: 'Clara', etablissement: 'Lycée J. Moulin', annee: '2023-2024', resultat: 'Admis Mention Très Bien', moyenne: 17.0 },
  { id: 'AB9876543XY', nom: 'Leroy', prenom: 'Lucas', etablissement: 'Collège P. Valéry', annee: '2022-2023', resultat: 'Admis Mention Assez Bien', moyenne: 13.2 },
  { id: 'CD1234567ZA', nom: 'Moreau', prenom: 'Manon', etablissement: 'Collège V. Hugo', annee: '2024-2025', resultat: 'Admis', moyenne: 11.8 },
];

const ALL_YEARS_VALUE = "__ALL_YEARS__";
const ALL_ESTABLISHMENTS_VALUE = "__ALL_ESTABLISHMENTS__";

export default function DonneePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>(''); // Empty string for placeholder
  const [selectedEstablishment, setSelectedEstablishment] = useState<string>(''); // Empty string for placeholder
  const [filteredData, setFilteredData] = useState<DisplayStudentData[]>(FAKE_STUDENT_DATA);

  useEffect(() => {
    let data = FAKE_STUDENT_DATA;
    if (selectedYear && selectedYear !== ALL_YEARS_VALUE) {
      data = data.filter(student => student.annee === selectedYear);
    }
    if (selectedEstablishment && selectedEstablishment !== ALL_ESTABLISHMENTS_VALUE) {
      data = data.filter(student => student.etablissement === selectedEstablishment);
    }
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      data = data.filter(student =>
        student.nom.toLowerCase().includes(lowerSearchTerm) ||
        student.prenom.toLowerCase().includes(lowerSearchTerm) ||
        student.id.toLowerCase().includes(lowerSearchTerm)
      );
    }
    setFilteredData(data);
  }, [searchTerm, selectedYear, selectedEstablishment]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const getBadgeVariant = (resultat: string): "default" | "secondary" | "destructive" | "outline" => {
    const lowerResultat = resultat.toLowerCase();
    if (lowerResultat.includes('refusé')) return "destructive";
    if (lowerResultat.includes('admis')) return "default";
    return "secondary";
  };

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Gestion des Données Élèves</h1>
        <p className="text-muted-foreground mt-1">
          Recherchez, filtrez et consultez les résultats détaillés des élèves au brevet.
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
              <label htmlFor="year" className="block text-sm font-medium text-foreground">Année Scolaire</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger id="year" className="w-full">
                  <SelectValue placeholder="Sélectionner une année" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_YEARS_VALUE}>Toutes les années</SelectItem>
                  {FAKE_YEARS.map(year => (
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
                  {FAKE_ESTABLISHMENTS.map(est => (
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
            Liste des élèves correspondant aux critères de recherche et filtres sélectionnés.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredData.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[120px]">INE</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Prénom</TableHead>
                    <TableHead>Établissement</TableHead>
                    <TableHead>Année</TableHead>
                    <TableHead>Résultat</TableHead>
                    <TableHead className="text-right">Moyenne (/20)</TableHead>
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
                        {student.moyenne !== undefined ? student.moyenne.toFixed(2) : 'N/A'}
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
                Veuillez ajuster vos filtres ou votre terme de recherche.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
