
"use client";

import type { ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { StudentData } from '@/lib/excel-types';
import { studentDataSchema } from '@/lib/excel-types';
import { Loader2, Import, AlertTriangle, CalendarDays } from 'lucide-react';
import * as XLSX from 'xlsx';

import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { YearPicker } from '@/components/ui/year-picker';

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  
  const [importYear, setImportYear] = useState<string>(''); 
  const [selectedStartYear, setSelectedStartYear] = useState<number | null>(null); 
  const [initialPickerYear, setInitialPickerYear] = useState<number>(new Date().getFullYear());
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    const currentMonth = new Date().getMonth(); 
    const currentCalYear = new Date().getFullYear();
    let academicStartYear;

    if (currentMonth < 7) { 
        academicStartYear = currentCalYear - 1;
    } else { 
        academicStartYear = currentCalYear;
    }
    setInitialPickerYear(academicStartYear); 
  }, []);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      const fileType = selectedFile.type;
      const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
      if (validTypes.includes(fileType) || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        setFile(selectedFile);
        setFileName(selectedFile.name);
        setError(null);
      } else {
        setError("Format de fichier invalide. Veuillez sélectionner un fichier .xlsx ou .xls.");
        setFile(null);
        setFileName(null);
        toast({ variant: "destructive", title: "Erreur de fichier", description: "Format de fichier invalide. Veuillez sélectionner un fichier .xlsx ou .xls." });
      }
    }
  };

  const handleImportToFirestore = async (dataToImport: StudentData[], yearToImportForToast: string) => {
    if (dataToImport.length === 0) {
      toast({ variant: "destructive", title: "Aucune Donnée", description: "Aucune donnée valide à importer." });
      return;
    }
    setIsImporting(true);
    setError(null);

    const db = getFirestore(app);
    const batch = writeBatch(db);
    const collectionRef = collection(db, 'brevetResults');
    let documentsAddedToBatch = 0;

    dataToImport.forEach(student => {
      const docId = student['INE']; 
      if (docId) { 
        const studentRef = doc(collectionRef, docId);
        batch.set(studentRef, student);
        documentsAddedToBatch++;
      } else {
        console.warn("Skipping student due to missing or invalid INE (should be caught by Zod):", student);
      }
    });

    if (documentsAddedToBatch === 0) {
      setError("Aucun élève avec un INE valide n'a été trouvé dans les données pour l'importation. Vérifiez le fichier Excel.");
      toast({ variant: "destructive", title: "Importation Annulée", description: "Aucun élève avec un INE valide à importer.", duration: 7000 });
      setIsImporting(false);
      return;
    }

    try {
      await batch.commit();
      toast({ title: "Importation Réussie", description: `${documentsAddedToBatch} enregistrements importés pour l'année ${yearToImportForToast} dans Firestore.` });
      setFile(null);
      setFileName(null);
      setSelectedStartYear(null); 
      setImportYear(''); 
    } catch (importError: any) {
      console.error("Erreur d'importation Firestore:", importError);
      let userMessage = `Échec de l'importation: ${importError.message}.`;
      if (importError.message && (importError.message.includes('transport errored') || importError.message.includes('RPC'))) {
          userMessage += " Vérifiez votre connexion internet, la configuration de votre projet Firebase (Firestore activé, région sélectionnée), vos règles de sécurité Firestore, et consultez la console du navigateur pour d'éventuelles erreurs d'initialisation Firebase (notamment liées aux variables d'environnement Firebase).";
      } else if (importError.code === 'permission-denied') {
        userMessage = "Échec de l'importation: Permission refusée. Vérifiez vos règles de sécurité Firestore.";
      }
      setError(userMessage);
      toast({ variant: "destructive", title: "Erreur d'Importation Firestore", description: userMessage, duration: 10000 });
    } finally {
      setIsImporting(false);
    }
  };

  const parseAndImportData = async () => {
    if (!file) {
      setError("Aucun fichier sélectionné.");
      toast({ variant: "destructive", title: "Erreur", description: "Aucun fichier sélectionné." });
      return;
    }
    if (!importYear || importYear.trim() === "") {
      setError("L'année d'importation est requise.");
      toast({ variant: "destructive", title: "Erreur", description: "Veuillez spécifier l'année d'importation.", duration: 5000 });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target?.result;
          if (!arrayBuffer) {
            throw new Error("Le fichier Excel est vide ou n'a pas pu être lu.");
          }
          const data = new Uint8Array(arrayBuffer as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });

          if (!workbook.SheetNames.length) {
            throw new Error("Le classeur Excel ne contient aucune feuille.");
          }

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawDataObjects = XLSX.utils.sheet_to_json<any>(worksheet, { raw: false, defval: undefined });


          if (rawDataObjects.length === 0) {
            throw new Error("Aucune donnée trouvée dans la première feuille du fichier Excel. Assurez-vous que la première ligne contient les en-têtes.");
          }

          const transformedData: StudentData[] = [];
          const validationErrors: { row: number; errors: any }[] = [];

          const explicitlyMappedHeaders = new Set([
            'Série', 'Code Etablissement', 'Libellé Etablissement', 'Commune Etablissement',
            'Division de classe', 'Catégorie candidat', 'Numéro Candidat', 'INE',
            'Nom candidat', 'Prénom candidat', 'Date de naissance', 'Résultat',
            'TOTAL GENERAL', 'Moyenne sur 20',
            '001 - 1 - Français - Ponctuel',
            '002 - 1 - Mathématiques - Ponctuel',
            '003 - 1 - Histoire, géographie, enseignement moral et civique - Ponctuel',
            '004 - 1 - Sciences - Ponctuel',
            '005 - 1 - Soutenance orale de projet - Evaluation en cours d\'année',
            '007AB - 1 - Langues étrangères ou régionales - Contrôle continu',
            '007AD - 1 - Langages des arts et du corps - Contrôle continu',
            'Edu Mus01A /50',
            'EPS CCF01A /100',
            'Phy Chi01A /50',
            'Sci Vie01A /50'
          ]);


          rawDataObjects.forEach((rawRow, index) => {
            const studentInput: any = {
              'anneeScolaireImportee': importYear, // Use the YYYY formatted string
              'Série': rawRow['Série'],
              'Code Etablissement': rawRow['Code Etablissement'],
              'Libellé Etablissement': rawRow['Libellé Etablissement'],
              'Commune Etablissement': rawRow['Commune Etablissement'],
              'Division de classe': rawRow['Division de classe'],
              'Catégorie candidat': rawRow['Catégorie candidat'],
              'Numéro Candidat': rawRow['Numéro Candidat'],
              'INE': rawRow['INE'],
              'Nom candidat': rawRow['Nom candidat'],
              'Prénom candidat': rawRow['Prénom candidat'],
              'Date de naissance': rawRow['Date de naissance'],
              'Résultat': rawRow['Résultat'],
              'TOTAL GENERAL': rawRow['TOTAL GENERAL'],
              'Moyenne sur 20': rawRow['Moyenne sur 20'],
              scoreFrancais: rawRow['001 - 1 - Français - Ponctuel'],
              scoreMaths: rawRow['002 - 1 - Mathématiques - Ponctuel'],
              scoreHistoireGeo: rawRow['003 - 1 - Histoire, géographie, enseignement moral et civique - Ponctuel'],
              scoreSciences: rawRow['004 - 1 - Sciences - Ponctuel'],
              scoreOralDNB: rawRow['005 - 1 - Soutenance orale de projet - Evaluation en cours d\'année'],
              scoreLVE: rawRow['007AB - 1 - Langues étrangères ou régionales - Contrôle continu'],
              scoreArtsPlastiques: rawRow['007AD - 1 - Langages des arts et du corps - Contrôle continu'],
              scoreEducationMusicale: rawRow['Edu Mus01A /50'],
              scoreEPS: rawRow['EPS CCF01A /100'],
              scorePhysiqueChimie: rawRow['Phy Chi01A /50'],
              scoreSciencesVie: rawRow['Sci Vie01A /50'],
              rawRowData: rawRow, 
              options: {} 
            };
            
            const currentOptions: Record<string, string> = {};
            for (const excelHeader in rawRow) {
              if (rawRow.hasOwnProperty(excelHeader) && !explicitlyMappedHeaders.has(excelHeader)) {
                const value = rawRow[excelHeader];
                if (value !== undefined && value !== null) {
                    currentOptions[excelHeader] = String(value);
                }
              }
            }
            if (Object.keys(currentOptions).length > 0) {
              studentInput.options = currentOptions;
            }

            const validationResult = studentDataSchema.safeParse(studentInput);
            if (validationResult.success) {
              transformedData.push(validationResult.data);
            } else {
              validationErrors.push({ row: index + 2, errors: validationResult.error.flatten() });
            }
          });

          if (validationErrors.length > 0) {
            const firstError = validationErrors[0];
            const errorMessages = Object.entries(firstError.errors.fieldErrors)
              .map(([field, messages]) => {
                if (messages && messages.length > 0) {
                  return `${field}: ${messages[0]}`;
                }
                return `${field}: Erreur de validation inconnue`;
              })
              .join('; ');
            throw new Error(`Validation échouée pour certaines lignes. Ex: Ligne ${firstError.row}: ${errorMessages}`);
          }

          if (transformedData.length > 0) {
            await handleImportToFirestore(transformedData, importYear);
          } else if (error) { 
            // Do nothing, error is already set and will be displayed
          } else if (rawDataObjects.length > 0 && transformedData.length === 0 && validationErrors.length === 0) {
             throw new Error("Aucune ligne n'a pu être traitée. Vérifiez que les colonnes 'INE', 'Nom candidat', et 'Prénom candidat' sont présentes, correctement nommées et remplies dans le fichier Excel.");
          } else { 
            throw new Error("Aucune donnée valide trouvée dans le fichier Excel après parsing. Vérifiez le format du fichier et la présence de données.");
          }

        } catch (parseOrImportError: any) {
          console.error("Erreur lors du parsing Excel ou de l'importation:", parseOrImportError);
          setError(`Erreur: ${parseOrImportError.message}`);
          toast({ variant: "destructive", title: "Erreur de Fichier Excel", description: parseOrImportError.message, duration: 7000 });
        } finally {
          setIsLoading(false);
        }
      };
      reader.onerror = () => {
        console.error("Erreur FileReader:", reader.error);
        setError("Impossible de lire le fichier Excel.");
        toast({ variant: "destructive", title: "Erreur", description: "Impossible de lire le fichier Excel." });
        setIsLoading(false);
      };
      reader.readAsArrayBuffer(file);
    } catch (e: any) {
      console.error("Erreur générale d'import Excel:", e);
      setError(e.message);
      toast({ variant: "destructive", title: "Erreur Inconnue", description: e.message });
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Importer les Données du Brevet</h1>
        <p className="text-muted-foreground mt-1">
          Téléversez un fichier Excel (.xlsx, .xls) avec les résultats des élèves et spécifiez l'année scolaire.
        </p>
      </header>
      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl">Téléversement et Importation</CardTitle>
          <CardDescription>
            Sélectionnez votre fichier Excel et l'année scolaire correspondante.
            Les en-têtes de colonnes dans Excel doivent correspondre aux champs attendus 
            (ex: 'INE', 'Nom candidat', 'Moyenne sur 20', etc.).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="importYear-trigger" className="text-sm font-medium">Année Scolaire d'Importation</Label>
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="importYear-trigger"
                  variant={"outline"}
                  className={`w-full justify-start text-left font-normal ${!selectedStartYear && "text-muted-foreground"}`}
                  disabled={isLoading || isImporting}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {selectedStartYear ? String(selectedStartYear) : "Choisissez l'année"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <YearPicker
                  selectedYear={selectedStartYear}
                  onSelectYear={(year) => {
                    setSelectedStartYear(year);
                    setImportYear(String(year)); // Set the YYYY string for logic
                    setIsPopoverOpen(false);
                  }}
                  initialDisplayYear={initialPickerYear}
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              L'année scolaire commence en septembre. Ce champ est obligatoire.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto] items-end">
            <div className="space-y-2">
              <Label htmlFor="file-upload" className="text-sm font-medium">Fichier Excel</Label>
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileChange}
                className="w-full"
                disabled={isLoading || isImporting}
              />
               {fileName && <p className="text-xs text-muted-foreground">Fichier sélectionné : {fileName}</p>}
            </div>
            <Button onClick={parseAndImportData} disabled={!file || isLoading || isImporting || !importYear.trim()} className="w-full sm:w-auto">
              {(isLoading || isImporting) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Import className="mr-2 h-4 w-4" />}
              {isLoading ? "Lecture..." : (isImporting ? "Importation..." : "Importer")}
            </Button>
          </div>
          {error && (
            <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertTriangle className="mr-2 h-4 w-4" /> {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

    