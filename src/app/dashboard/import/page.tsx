
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
          
          // Get raw data as array of arrays to find header row
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
            header: headers, // Use trimmed headers
            range: headerRowIndex + 1, 
            defval: null, 
            cellDates: true
          }) as any[];


          const transformedData: StudentData[] = [];
          const validationErrors: { row: number; errors: any }[] = [];

          dataRows.forEach((rawRow, index) => {
            const getVal = (keys: string[]) => {
              for (const key of keys) {
                // rawRow keys are now trimmed because `headers` was trimmed
                if (rawRow[key] !== undefined && rawRow[key] !== null) return rawRow[key];
              }
              return undefined;
            };
            
            const ine = String(getVal(['Numéro Cand. INE', 'Numero Cand. INE']) || '').trim();
            const nom = String(getVal(['Nom candidat']) || '').trim();
            const prenoms = String(getVal(['Prénom(s) candidat', 'Prenom(s) candidat']) || '').trim();

            if (!ine || !nom || !prenoms) {
              // console.log(`Skipping row ${index + headerRowIndex + 2} due to missing essential identifier(s). INE: '${ine}', Nom: '${nom}', Prenoms: '${prenoms}'`);
              return; 
            }
            
            const studentInput = {
              serie: getVal(['Série', 'Serie']),
              codeEtablissement: getVal(['Code Établis.', 'Code Etablis.']),
              libelleEtablissement: getVal(['Libellé Établis.', 'Libelle Etablis.']),
              communeEtablissement: getVal(['Commune Établis.', 'Commune Etablis.']),
              divisionEleve: getVal(['Division Élève', 'Division Eleve']),
              categorieSocioPro: getVal(['Catégorie socio-prof.', 'Categorie socio-prof.']),
              numeroCandidatINE: ine,
              nomCandidat: nom,
              prenomsCandidat: prenoms,
              dateNaissance: getVal(['Dt nais. Cand.']) instanceof Date ? (getVal(['Dt nais. Cand.']) as Date).toLocaleDateString('fr-FR') : String(getVal(['Dt nais. Cand.']) || ''),
              resultat: getVal(['Résultat', 'Resultat']),
              totalGeneral: getVal(['TOTAL GÉNÉRAL /800,0', 'TOTAL GENERAL /800,0']),
              totalPourcentage: getVal(['TOTAL POURCENTAGE /20']),
              scoreFrancais: getVal(['Fra LV001 /50']),
              scoreMaths: getVal(['Mat LV001 /50']),
              scoreHistoireGeo: getVal(['His Geo01A /50']),
              scoreSciencesVie: getVal(['Sci Vie01A /50']),
              scorePhysiqueChimie: getVal(['Phy Chi01A /50']),
              scoreLVE: getVal(['LVE Ang01A /50']),
              scoreArtsPlastiques: getVal(['ArtsPla01A /50']),
              scoreEducationMusicale: getVal(['Edu Mus01A /50']),
              scoreEPS: getVal(['EPS CCF01A /100']),
              scoreOralDNB: getVal(['OralDNB01A /100']),
              options: {}, 
              rawRowData: rawRow, 
            };
            
            const knownMainHeaders = Object.keys(studentInput).filter(k => k !== 'options' && k !== 'rawRowData');
            const optionHeadersFromExcel = [
              'LCA001AR', 'LCA001AC', 'LCA001AL', 'LCA001AG', 'LCA001FT', 'LCA001BI', 'LCA001CH',
              'LCE001AN', 'LCE001AL', 'LCE001ES', 'LCE001IT', 'les comprofessionnels' 
            ];

            const currentOptions: Record<string, string> = {};
            optionHeadersFromExcel.forEach(optHeader => {
              const val = getVal([optHeader, `${optHeader} /20`, `${optHeader} /50`]);
              if (val !== undefined && val !== null) {
                currentOptions[optHeader.split(' ')[0]] = String(val);
              }
            });
            Object.keys(rawRow).forEach(excelHeader => {
                // excelHeader is now a trimmed key from the `headers` array
                if (!knownMainHeaders.some(mainHeaderKey => {
                    const mainHeaderInExcelCouldBe = [mainHeaderKey, mainHeaderKey.replace(/\./g, '')]; // e.g. 'Code Établis.' vs 'Code Etablis'
                    return mainHeaderInExcelCouldBe.some(mh => excelHeader.toLowerCase().includes(mh.toLowerCase())) ||
                           (studentInput as any)[mainHeaderKey] === rawRow[excelHeader];
                  }) && 
                    !optionHeadersFromExcel.some(optKey => excelHeader.toLowerCase().startsWith(optKey.toLowerCase().split(' ')[0]))
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
            throw new Error("Aucune ligne n'a pu être traitée. Vérifiez que les colonnes 'Numéro Cand. INE', 'Nom candidat', et 'Prénom(s) candidat' sont présentes et remplies.");
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
    
