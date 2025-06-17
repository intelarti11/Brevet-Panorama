
"use client";

import type { ChangeEvent } from 'react';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { StudentData } from '@/lib/excel-types';
import { studentDataSchema } from '@/lib/excel-types';
import { Loader2, UploadCloud, Import, AlertTriangle } from 'lucide-react';

import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';
import { app } from '@/lib/firebase';

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || selectedFile.type === 'application/vnd.ms-excel') {
        setFile(selectedFile);
        setFileName(selectedFile.name);
        setError(null);
      } else {
        setError("Format de fichier invalide. Veuillez sélectionner un fichier .xlsx ou .xls.");
        setFile(null);
        setFileName(null);
        toast({ variant: "destructive", title: "Erreur de fichier", description: "Format de fichier invalide." });
      }
    }
  };

  const handleImportToFirestore = async (dataToImport: StudentData[]) => {
    if (dataToImport.length === 0) {
      toast({ variant: "destructive", title: "Aucune Donnée", description: "Aucune donnée valide à importer." });
      return;
    }
    setIsImporting(true);
    setError(null);

    const db = getFirestore(app);
    const batch = writeBatch(db);
    const collectionRef = collection(db, 'brevetResults');

    dataToImport.forEach(student => {
      if (student.numeroCandidatINE && student.numeroCandidatINE.trim() !== "") {
        const studentRef = doc(collectionRef, student.numeroCandidatINE);
        // Exclude rawRowData and prepare for Firestore by removing undefined values
        const { rawRowData, ...studentDataForFirestore } = student;
        const cleanedStudentData = JSON.parse(JSON.stringify(studentDataForFirestore));
        batch.set(studentRef, cleanedStudentData);
      } else {
        console.warn("Skipping student due to missing or invalid INE:", student);
      }
    });

    try {
      await batch.commit();
      toast({ title: "Importation Réussie", description: `${dataToImport.length} enregistrements importés dans Firestore.` });
      setFile(null);
      setFileName(null);
    } catch (importError: any) {
      console.error("Erreur d'importation Firestore:", importError);
      setError(`Échec de l'importation: ${importError.message}`);
      toast({ variant: "destructive", title: "Erreur d'Importation", description: `Échec de l'importation: ${importError.message}`, duration: 7000 });
      throw importError;
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

    setIsLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = event.target?.result;
          const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];

          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

          if (jsonData.length === 0) {
            throw new Error("Le fichier Excel est vide ou ne contient pas de données lisibles.");
          }

          let headerRowIndex = -1;
          for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i] as any[];
            if (row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
              headerRowIndex = i;
              break;
            }
          }

          if (headerRowIndex === -1) {
            throw new Error("Impossible de trouver la ligne d'en-tête dans le fichier Excel.");
          }

          const rawHeadersFromExcel = jsonData[headerRowIndex] as any[];
          const headers = rawHeadersFromExcel.map(h => {
            if (typeof h === 'string') {
              return h.trim();
            }
            return String(h || '').trim();
          });


          const dataRows = XLSX.utils.sheet_to_json(worksheet, {
            header: headers,
            range: headerRowIndex + 1,
            defval: null,
            cellDates: true
          }) as any[];


          const transformedData: StudentData[] = [];
          const validationErrors: { row: number; errors: any }[] = [];
          
          // Define the set of Excel headers that are explicitly mapped to studentInput fields
          const mappedExcelHeaders = new Set([
            'Série', 'Code Etablissement', 'Libellé Etablissement', 'Commune Etablissement',
            'Division de classe', 'Catégorie candidat', 
            // 'Numéro Candidat' and 'INE' are used for ine
            'Numéro Candidat', 'INE', 
            'Nom candidat', // used for nom
            'Prénom candidat', // used for prenoms
            'Date de naissance', 'Résultat', 'TOTAL GENERAL', 'Moyenne sur 20',
            '001 - 1 - Français - Ponctuel', 
            '002 - 1 - Mathématiques - Ponctuel',
            '003 - 1 - Histoire, géographie, enseignement moral et civique - Ponctuel',
            '004 - 1 - Sciences - Ponctuel', 
            '005 - 1 - Soutenance orale de projet - Evaluation en cours d\'année',
            '007AB - 1 - Langues étrangères ou régionales - Contrôle continu', // For scoreLVE
            '007AD - 1 - Langages des arts et du corps - Contrôle continu', // For scoreArtsPlastiques
            'Edu Mus01A /50', // For scoreEducationMusicale
            'EPS CCF01A /100', // For scoreEPS
            'Phy Chi01A /50', // For scorePhysiqueChimie
            'Sci Vie01A /50', // For scoreSciencesVie
            // Add any other headers that are directly used by getVal for studentInput fields
          ]);


          dataRows.forEach((rawRow, index) => {
            const getVal = (keys: string[]) => {
              for (const key of keys) {
                if (rawRow[key] !== undefined && rawRow[key] !== null) return rawRow[key];
              }
              return undefined;
            };

            const ine = String(getVal(['INE', 'Numéro Candidat']) || '').trim();
            const nom = String(getVal(['Nom candidat']) || '').trim();
            const prenoms = String(getVal(['Prénom candidat']) || '').trim();

            if (!ine || !nom || !prenoms) {
              return;
            }

            const studentInput = {
              serie: getVal(['Série']),
              codeEtablissement: getVal(['Code Etablissement']),
              libelleEtablissement: getVal(['Libellé Etablissement']),
              communeEtablissement: getVal(['Commune Etablissement']),
              divisionEleve: getVal(['Division de classe']),
              categorieSocioPro: getVal(['Catégorie candidat']),
              numeroCandidatINE: ine,
              nomCandidat: nom,
              prenomsCandidat: prenoms,
              dateNaissance: getVal(['Date de naissance']) instanceof Date ? (getVal(['Date de naissance']) as Date).toLocaleDateString('fr-FR') : String(getVal(['Date de naissance']) || ''),
              resultat: getVal(['Résultat']),
              totalGeneral: getVal(['TOTAL GENERAL']),
              totalPourcentage: getVal(['Moyenne sur 20']),
              scoreFrancais: getVal(['001 - 1 - Français - Ponctuel']),
              scoreMaths: getVal(['002 - 1 - Mathématiques - Ponctuel']),
              scoreHistoireGeo: getVal(['003 - 1 - Histoire, géographie, enseignement moral et civique - Ponctuel']),
              scoreSciences: getVal(['004 - 1 - Sciences - Ponctuel']),
              scoreOralDNB: getVal(['005 - 1 - Soutenance orale de projet - Evaluation en cours d\'année']),
              scoreLVE: getVal(['007AB - 1 - Langues étrangères ou régionales - Contrôle continu']),
              scoreArtsPlastiques: getVal(['007AD - 1 - Langages des arts et du corps - Contrôle continu']),
              scoreEducationMusicale: getVal(['Edu Mus01A /50']),
              scoreEPS: getVal(['EPS CCF01A /100']),
              scorePhysiqueChimie: getVal(['Phy Chi01A /50']),
              scoreSciencesVie: getVal(['Sci Vie01A /50']),
              options: {},
              rawRowData: rawRow,
            };
            
            const currentOptions: Record<string, string> = {};
            Object.keys(rawRow).forEach(excelHeader => {
                if (!mappedExcelHeaders.has(excelHeader)) { // Optimized check
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
              validationErrors.push({ row: index + headerRowIndex + 2, errors: validationResult.error.flatten() });
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
            console.error("Erreurs de validation:", validationErrors);
            throw new Error(`Validation échouée pour certaines lignes. Ex: Ligne ${firstError.row}: ${errorMessages}`);
          }

          if (transformedData.length > 0) {
            await handleImportToFirestore(transformedData);
          } else if (error) { 
            // If 'error' state is already set (e.g. header not found), don't override it.
          } else if (dataRows.length > 0 && transformedData.length === 0 && validationErrors.length === 0) {
            throw new Error("Aucune ligne n'a pu être traitée. Vérifiez que les colonnes 'INE', 'Nom candidat', et 'Prénom candidat' (ou leurs équivalents) sont présentes, correctement nommées et remplies dans le fichier Excel.");
          } else {
            throw new Error("Aucune donnée valide trouvée dans le fichier après parsing.");
          }

        } catch (parseOrImportError: any) {
          console.error("Erreur lors du parsing ou de l'importation:", parseOrImportError);
          setError(`Erreur: ${parseOrImportError.message}`);
          toast({ variant: "destructive", title: "Erreur", description: parseOrImportError.message, duration: 7000 });
        } finally {
          setIsLoading(false);
        }
      };
      reader.onerror = () => {
        console.error("Erreur FileReader:", reader.error);
        setError("Impossible de lire le fichier.");
        toast({ variant: "destructive", title: "Erreur", description: "Impossible de lire le fichier." });
        setIsLoading(false);
      };
      reader.readAsBinaryString(file);
    } catch (e: any) {
      console.error("Erreur générale:", e);
      setError(e.message);
      toast({ variant: "destructive", title: "Erreur Inconnue", description: e.message });
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-1 md:p-4">
      <h1 className="text-2xl font-semibold text-foreground">Importer les Données du Brevet</h1>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Téléverser et Importer un fichier Excel</CardTitle>
          <CardDescription>Sélectionnez un fichier .xlsx contenant les résultats des élèves. Les données seront importées directement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <label htmlFor="file-upload" className="flex-grow w-full sm:w-auto">
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="hidden"
                disabled={isLoading || isImporting}
              />
              <Button asChild variant="outline" className="w-full sm:w-auto cursor-pointer" disabled={isLoading || isImporting}>
                <div>
                  <UploadCloud className="mr-2 h-4 w-4" />
                  {fileName || "Choisir un fichier..."}
                </div>
              </Button>
            </label>
            <Button onClick={parseAndImportData} disabled={!file || isLoading || isImporting} className="w-full sm:w-auto">
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
    
