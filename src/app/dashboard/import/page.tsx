
"use client";

import type { ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import type { StudentData } from '@/lib/excel-types';
import { studentDataSchema } from '@/lib/excel-types';
import { Loader2, UploadCloud, FileCheck2, AlertTriangle } from 'lucide-react';

// Firebase imports (will be used later)
// import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';
// import { app } from '@/lib/firebase'; // Assuming you have a firebase init file

const MAX_PREVIEW_ROWS = 5;

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<StudentData[]>([]);
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
        setParsedData([]); // Clear previous data
      } else {
        setError("Format de fichier invalide. Veuillez sélectionner un fichier .xlsx ou .xls.");
        setFile(null);
        setFileName(null);
        toast({ variant: "destructive", title: "Erreur de fichier", description: "Format de fichier invalide." });
      }
    }
  };

  const parseExcelData = async () => {
    if (!file) {
      setError("Aucun fichier sélectionné.");
      toast({ variant: "destructive", title: "Erreur", description: "Aucun fichier sélectionné." });
      return;
    }

    setIsLoading(true);
    setError(null);
    setParsedData([]);

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
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
          for(let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i] as any[];
            if(row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
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

          const mainDataKeysFromCsv = [
            'Série', 'Code Etablissement', 'Libellé Etablissement', 'Commune Etablissement',
            'Division de classe', 'Catégorie candidat', 'Numéro Candidat', 'INE', 'Nom candidat',
            'Prénom candidat', 'Date de naissance', 'Résultat', 'TOTAL GENERAL', 'TOTAL POUR MENTION',
            'Moyenne sur 20', '001 - 1 - Français - Ponctuel', '002 - 1 - Mathématiques - Ponctuel',
            '003 - 1 - Histoire, géographie, enseignement moral et civique - Ponctuel',
            '004 - 1 - Sciences - Ponctuel', 
            '005 - 1 - Soutenance orale de projet - Evaluation en cours d\'année'
            // Add other specific score/data columns if they become primary later
          ];


          dataRows.forEach((rawRow, index) => {
            const getVal = (keys: string[]) => {
              for (const key of keys) {
                if (rawRow[key] !== undefined && rawRow[key] !== null) return rawRow[key];
              }
              return undefined;
            };
            
            const ine = String(getVal(['INE', 'Numéro Cand. INE']) || '').trim();
            const nom = String(getVal(['Nom candidat']) || '').trim();
            const prenoms = String(getVal(['Prénom candidat', 'Prénom(s) candidat']) || '').trim();

            if (!ine || !nom || !prenoms) {
              // console.log(`Skipping row ${index + headerRowIndex + 2} due to missing essential identifier(s). INE: '${ine}', Nom: '${nom}', Prenoms: '${prenoms}'`);
              return; 
            }
            
            const studentInput = {
              serie: getVal(['Série']),
              codeEtablissement: getVal(['Code Etablissement', 'Code Établis.']),
              libelleEtablissement: getVal(['Libellé Etablissement', 'Libellé Établis.']),
              communeEtablissement: getVal(['Commune Etablissement', 'Commune Établis.']),
              divisionEleve: getVal(['Division de classe', 'Division Élève']),
              categorieSocioPro: getVal(['Catégorie candidat', 'Catégorie socio-prof.']),
              numeroCandidatINE: ine,
              nomCandidat: nom,
              prenomsCandidat: prenoms,
              dateNaissance: getVal(['Date de naissance', 'Dt nais. Cand.']) instanceof Date ? (getVal(['Date de naissance', 'Dt nais. Cand.']) as Date).toLocaleDateString('fr-FR') : String(getVal(['Date de naissance', 'Dt nais. Cand.']) || ''),
              resultat: getVal(['Résultat']),
              totalGeneral: getVal(['TOTAL GENERAL', 'TOTAL GÉNÉRAL /800,0']),
              totalPourcentage: getVal(['Moyenne sur 20', 'TOTAL POURCENTAGE /20']),
              scoreFrancais: getVal(['001 - 1 - Français - Ponctuel', 'Fra LV001 /50']),
              scoreMaths: getVal(['002 - 1 - Mathématiques - Ponctuel', 'Mat LV001 /50']),
              scoreHistoireGeo: getVal(['003 - 1 - Histoire, géographie, enseignement moral et civique - Ponctuel', 'His Geo01A /50']),
              scoreSciences: getVal(['004 - 1 - Sciences - Ponctuel']), // New mapping
              scoreOralDNB: getVal(['005 - 1 - Soutenance orale de projet - Evaluation en cours d\'année', 'OralDNB01A /100']),
              
              // These will likely be undefined or non-numeric with the new headers
              scoreLVE: getVal(['LVE Ang01A /50', '007AB - 1 - Langues étrangères ou régionales - Contrôle continu']), 
              scoreArtsPlastiques: getVal(['ArtsPla01A /50', '007AD - 1 - Langages des arts et du corps - Contrôle continu']), // This might be a broader category
              scoreEducationMusicale: getVal(['Edu Mus01A /50']),
              scoreEPS: getVal(['EPS CCF01A /100']),
              scorePhysiqueChimie: getVal(['Phy Chi01A /50']),
              scoreSciencesVie: getVal(['Sci Vie01A /50']),
              options: {}, 
              rawRowData: rawRow, 
            };
            
            const currentOptions: Record<string, string> = {};
            Object.keys(rawRow).forEach(excelHeader => {
                // excelHeader is a trimmed key from the `headers` array
                // Check if this header was NOT one of the main data keys we explicitly mapped above
                if (!mainDataKeysFromCsv.includes(excelHeader) && 
                    !Object.values(studentInput).includes(rawRow[excelHeader]) // rough check if value was already used
                   ) {
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
          
          setParsedData(transformedData);
          if (transformedData.length > 0) {
             toast({ title: "Succès", description: `${transformedData.length} lignes lues et validées depuis ${file.name}.` });
          } else if (error) {
            // Don't override existing critical error like "header not found"
          } else if (dataRows.length > 0 && transformedData.length === 0 && validationErrors.length === 0) {
            throw new Error("Aucune ligne n'a pu être traitée. Vérifiez que les colonnes 'INE', 'Nom candidat', et 'Prénom candidat' (ou leurs équivalents) sont présentes, correctement nommées et remplies dans le fichier Excel.");
          }
          else {
            throw new Error("Aucune donnée valide trouvée dans le fichier après parsing.");
          }

        } catch (parseError: any) {
          console.error("Erreur de parsing Excel:", parseError);
          setError(`Erreur lors de la lecture du fichier: ${parseError.message}`);
          toast({ variant: "destructive", title: "Erreur de Lecture", description: parseError.message, duration: 7000 });
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
  
  const handleImportToFirestore = async () => {
    if (parsedData.length === 0) {
      toast({ variant: "destructive", title: "Aucune Donnée", description: "Aucune donnée à importer." });
      return;
    }
    setIsImporting(true);
    console.log("Données à importer:", parsedData);
    // Example:
    // const db = getFirestore(app);
    // const batch = writeBatch(db);
    // parsedData.forEach(student => {
    //   const studentRef = doc(collection(db, 'brevetResults'), student.numeroCandidatINE);
    //   batch.set(studentRef, student);
    // });
    // try {
    //   await batch.commit();
    //   toast({ title: "Importation Réussie", description: `${parsedData.length} enregistrements importés dans Firestore.` });
    //   setParsedData([]); // Clear data after import
    //   setFile(null);
    //   setFileName(null);
    // } catch (error: any) {
    //   console.error("Erreur d'importation Firestore:", error);
    //   toast({ variant: "destructive", title: "Erreur d'Importation", description: error.message });
    // } finally {
    //   setIsImporting(false);
    // }
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate import
    toast({ title: "Simulation d'Importation", description: `Prêt à importer ${parsedData.length} enregistrements. (Logique Firestore à implémenter)` });
    setIsImporting(false);
  };


  return (
    <div className="space-y-6 p-1 md:p-4">
      <h1 className="text-2xl font-semibold text-foreground">Importer les Données du Brevet</h1>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Téléverser un fichier Excel</CardTitle>
          <CardDescription>Sélectionnez un fichier .xlsx contenant les résultats des élèves.</CardDescription>
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
            <Button onClick={parseExcelData} disabled={!file || isLoading || isImporting} className="w-full sm:w-auto">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}
              {isLoading ? "Lecture en cours..." : "Lire et Valider le Fichier"}
            </Button>
          </div>
          {error && (
            <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertTriangle className="mr-2 h-4 w-4" /> {error}
            </div>
          )}
        </CardContent>
      </Card>

      {parsedData.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Aperçu des Données ({parsedData.length} lignes)</CardTitle>
            <CardDescription>Voici les {Math.min(parsedData.length, MAX_PREVIEW_ROWS)} premières lignes de votre fichier. Vérifiez qu'elles sont correctes avant d'importer.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>INE</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Prénom(s)</TableHead>
                    <TableHead>Né(e) le</TableHead>
                    <TableHead>Résultat</TableHead>
                    <TableHead>Total Général</TableHead>
                    <TableHead>Français</TableHead>
                    <TableHead>Maths</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, MAX_PREVIEW_ROWS).map((student, index) => (
                    <TableRow key={student.numeroCandidatINE || index}>
                      <TableCell>{student.numeroCandidatINE}</TableCell>
                      <TableCell>{student.nomCandidat}</TableCell>
                      <TableCell>{student.prenomsCandidat}</TableCell>
                      <TableCell>{student.dateNaissance}</TableCell>
                      <TableCell>{student.resultat}</TableCell>
                      <TableCell>{student.totalGeneral?.toFixed(2) ?? '-'}</TableCell>
                      <TableCell>{student.scoreFrancais?.toFixed(1) ?? '-'}</TableCell>
                      <TableCell>{student.scoreMaths?.toFixed(1) ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleImportToFirestore} disabled={isImporting || isLoading || parsedData.length === 0} className="w-full sm:w-auto">
              {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Importer {parsedData.length} élèves vers Firebase
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
    
