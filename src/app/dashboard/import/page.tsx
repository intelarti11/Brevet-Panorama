
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
import { Loader2, UploadCloud, Import, AlertTriangle, CalendarDays } from 'lucide-react';
import * as XLSX from 'xlsx';

import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';
import { app } from '@/lib/firebase';

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importYear, setImportYear] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    const currentMonth = new Date().getMonth();
    let academicYearStart = new Date().getFullYear();
    if (currentMonth < 7) {
        academicYearStart--;
    }
    setImportYear(`${academicYearStart}-${academicYearStart + 1}`);

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

  const handleImportToFirestore = async (dataToImport: StudentData[], yearToImport: string) => {
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
      if (docId && String(docId).trim() !== "") {
        const studentRef = doc(collectionRef, String(docId).trim());
        const { rawRowData, ...studentDataForFirestore } = student;

        const finalStudentData = {
            ...JSON.parse(JSON.stringify(studentDataForFirestore)), 
            anneeScolaireImportee: yearToImport 
        };
        batch.set(studentRef, finalStudentData);
        documentsAddedToBatch++;
      } else {
        console.warn("Skipping student due to missing or invalid INE for document ID:", student);
      }
    });

    if (documentsAddedToBatch === 0) {
      setError("Aucun élève avec un INE valide n'a été trouvé dans les données pour l'importation.");
      toast({ variant: "destructive", title: "Importation Annulée", description: "Aucun élève avec un INE valide à importer.", duration: 7000 });
      setIsImporting(false);
      return;
    }

    try {
      await batch.commit();
      toast({ title: "Importation Réussie", description: `${documentsAddedToBatch} enregistrements importés pour l'année ${yearToImport} dans Firestore.` });
      setFile(null);
      setFileName(null);
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
          const dataObjects = XLSX.utils.sheet_to_json<any>(worksheet);

          if (dataObjects.length === 0) {
            throw new Error("Aucune donnée trouvée dans la première feuille du fichier Excel. Assurez-vous que la première ligne contient les en-têtes.");
          }

          const transformedData: StudentData[] = [];
          const validationErrors: { row: number; errors: any }[] = [];

           const mainHeadersForOptionsLogic = new Set([
            'Série', 'Code Etablissement', 'Libellé Etablissement', 'Commune Etablissement',
            'Division de classe', 'Catégorie candidat', 'Numéro Candidat', 'INE',
            'Nom candidat', 'Prénom candidat', 'Date de naissance', 'Résultat',
            'TOTAL GENERAL', 'TOTAL POUR MENTION', 'Moyenne sur 20',
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

          dataObjects.forEach((rawRow, index) => {
            const getExcelVal = (headerName: string) => rawRow[headerName];

            const ine = String(getExcelVal('INE') || '').trim();
            const nomCandidat = String(getExcelVal('Nom candidat') || '').trim();
            const prenomsCandidat = String(getExcelVal('Prénom candidat') || '').trim();

            if (!ine || !nomCandidat || !prenomsCandidat) {
              console.warn(`Ligne ${index + 2} ignorée : INE, Nom candidat ou Prénom candidat manquant.`);
              return;
            }

            const studentInput: any = {
              'Série': getExcelVal('Série'),
              anneeScolaireImportee: importYear,
              'Code Etablissement': getExcelVal('Code Etablissement'),
              'Libellé Etablissement': getExcelVal('Libellé Etablissement'),
              'Commune Etablissement': getExcelVal('Commune Etablissement'),
              'Division de classe': getExcelVal('Division de classe'),
              'Catégorie candidat': getExcelVal('Catégorie candidat'),
              'Numéro Candidat': getExcelVal('Numéro Candidat'),
              'INE': ine,
              'Nom candidat': nomCandidat,
              'Prénom candidat': prenomsCandidat,
              'Date de naissance': getExcelVal('Date de naissance') instanceof Date
                                 ? (getExcelVal('Date de naissance') as Date).toLocaleDateString('fr-FR')
                                 : getExcelVal('Date de naissance'),
              'Résultat': getExcelVal('Résultat'),
              'TOTAL GENERAL': getExcelVal('TOTAL GENERAL'),
              'TOTAL POUR MENTION': getExcelVal('TOTAL POUR MENTION'),
              'Moyenne sur 20': getExcelVal('Moyenne sur 20'),

              scoreFrancais: getExcelVal('001 - 1 - Français - Ponctuel'),
              scoreMaths: getExcelVal('002 - 1 - Mathématiques - Ponctuel'),
              scoreHistoireGeo: getExcelVal('003 - 1 - Histoire, géographie, enseignement moral et civique - Ponctuel'),
              scoreSciences: getExcelVal('004 - 1 - Sciences - Ponctuel'),
              scoreOralDNB: getExcelVal('005 - 1 - Soutenance orale de projet - Evaluation en cours d\'année'),
              scoreLVE: getExcelVal('007AB - 1 - Langues étrangères ou régionales - Contrôle continu'),
              scoreArtsPlastiques: getExcelVal('007AD - 1 - Langages des arts et du corps - Contrôle continu'),
              scoreEducationMusicale: getExcelVal('Edu Mus01A /50'),
              scoreEPS: getExcelVal('EPS CCF01A /100'),
              scorePhysiqueChimie: getExcelVal('Phy Chi01A /50'),
              scoreSciencesVie: getExcelVal('Sci Vie01A /50'),

              options: {},
              rawRowData: rawRow,
            };

            const currentOptions: Record<string, string> = {};
            Object.keys(rawRow).forEach(excelHeader => {
                if (!mainHeadersForOptionsLogic.has(excelHeader)) {
                    const value = rawRow[excelHeader];
                    if (value !== undefined && value !== null && String(value).trim() !== '') {
                        currentOptions[excelHeader] = String(value);
                    }
                }
            });

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
            // console.error("Erreurs de validation:", validationErrors); // Removed verbose logging
            throw new Error(`Validation échouée pour certaines lignes. Ex: Ligne ${firstError.row}: ${errorMessages}`);
          }

          if (transformedData.length > 0) {
            await handleImportToFirestore(transformedData, importYear);
          } else if (error) {
            // Critical error already set
          } else if (dataObjects.length > 0 && transformedData.length === 0 && validationErrors.length === 0) {
             throw new Error("Aucune ligne n'a pu être traitée. Vérifiez que les colonnes 'INE', 'Nom candidat', et 'Prénom candidat' sont présentes, correctement nommées et remplies dans le fichier Excel.");
          } else {
            throw new Error("Aucune donnée valide trouvée dans le fichier Excel après parsing.");
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
      <h1 className="text-2xl font-semibold text-foreground">Importer les Données du Brevet (Excel)</h1>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Téléverser et Importer un fichier Excel</CardTitle>
          <CardDescription>Sélectionnez un fichier .xlsx ou .xls contenant les résultats des élèves, et spécifiez l'année scolaire pour ces données.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="importYear" className="text-sm font-medium">Année Scolaire d'Importation</Label>
            <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    id="importYear"
                    type="text"
                    placeholder="Ex: 2023-2024 ou 2024"
                    value={importYear}
                    onChange={(e) => setImportYear(e.target.value)}
                    className="pl-10"
                    disabled={isLoading || isImporting}
                />
            </div>
            <p className="text-xs text-muted-foreground">
              Indiquez l'année scolaire (ex: "2023-2024" ou "2024") pour les données de ce fichier.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <label htmlFor="file-upload" className="flex-grow w-full sm:w-auto">
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileChange}
                className="hidden"
                disabled={isLoading || isImporting}
              />
              <Button asChild variant="outline" className="w-full sm:w-auto cursor-pointer" disabled={isLoading || isImporting}>
                <div>
                  <UploadCloud className="mr-2 h-4 w-4" />
                  {fileName || "Choisir un fichier Excel..."}
                </div>
              </Button>
            </label>
            <Button onClick={parseAndImportData} disabled={!file || isLoading || isImporting || !importYear.trim()} className="w-full sm:w-auto">
              {(isLoading || isImporting) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Import className="mr-2 h-4 w-4" />}
              {isLoading ? "Lecture du fichier..." : (isImporting ? "Importation en cours..." : "Importer le Fichier")}
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
