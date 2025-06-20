
"use client";

import type { ChangeEvent, DragEvent } from 'react';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { StudentData, StudentBaseData } from '@/lib/excel-types';
import { studentDataSchema, studentBaseSchema } from '@/lib/excel-types';
import { Loader2, Import, AlertTriangle, CalendarDays, UploadCloud, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';

import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { YearPicker } from '@/components/ui/year-picker';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';


export default function ImportPage() {
  // States for Excel Import
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isExcelLoading, setIsExcelLoading] = useState(false); // For parsing/validation
  const [isExcelImporting, setIsExcelImporting] = useState(false); // For Firestore write
  const [excelError, setExcelError] = useState<string | null>(null);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  
  const [importYear, setImportYear] = useState<string>(''); 
  const [selectedStartYear, setSelectedStartYear] = useState<number | null>(null); 
  const [initialPickerYear, setInitialPickerYear] = useState<number>(new Date().getFullYear());
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const excelDragCounter = useRef(0);
  const [isExcelDraggingOver, setIsExcelDraggingOver] = useState(false);

  // States for CSV Import
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isCsvLoading, setIsCsvLoading] = useState(false); // For parsing/validation
  const [isCsvImporting, setIsCsvImporting] = useState(false); // For Firestore write
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const csvDragCounter = useRef(0);
  const [isCsvDraggingOver, setIsCsvDraggingOver] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    const currentCalYear = new Date().getFullYear();
    const academicStartYear = currentCalYear;
    setInitialPickerYear(academicStartYear); 
    setSelectedStartYear(academicStartYear); 
    setImportYear(String(academicStartYear)); 
  }, []);

  // --- Excel File Handling ---
  const processExcelFile = (selectedFile: File | null | undefined) => {
    if (selectedFile) {
      const fileType = selectedFile.type;
      const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
      if (validTypes.includes(fileType) || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        setExcelFile(selectedFile);
        setExcelFileName(selectedFile.name);
        setExcelError(null);
      } else {
        const errorMsg = "Format de fichier invalide pour Excel. Veuillez sélectionner un fichier .xlsx ou .xls.";
        setExcelError(errorMsg);
        setExcelFile(null);
        setExcelFileName(null);
        toast({ variant: "destructive", title: "Erreur de Fichier Excel", description: errorMsg });
      }
    } else {
      setExcelFile(null);
      setExcelFileName(null);
    }
  };

  const handleExcelFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      processExcelFile(files[0]);
    } else {
      processExcelFile(null);
    }
    if (excelFileInputRef.current) {
      excelFileInputRef.current.value = ''; 
    }
  };

  const handleExcelDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    excelDragCounter.current++;
    if (event.dataTransfer.items && event.dataTransfer.items.length > 0) setIsExcelDraggingOver(true);
  };
  const handleExcelDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    excelDragCounter.current--;
    if (excelDragCounter.current === 0) setIsExcelDraggingOver(false);
  };
  const handleExcelDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy';
    if (!isExcelDraggingOver) setIsExcelDraggingOver(true); 
  };
  const handleExcelDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    setIsExcelDraggingOver(false); excelDragCounter.current = 0;
    const droppedFiles = event.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      processExcelFile(droppedFiles[0]);
      if (excelFileInputRef.current) excelFileInputRef.current.value = ''; 
    }
  };

  const handleExcelImportToFirestore = async (dataToImport: StudentData[], yearToImportForToast: string) => {
    if (dataToImport.length === 0) {
      toast({ variant: "destructive", title: "Excel: Aucune Donnée", description: "Aucune donnée Excel valide à importer." });
      return;
    }
    setIsExcelImporting(true); setExcelError(null);
    const db = getFirestore(app); const batch = writeBatch(db);
    const collectionRef = collection(db, 'brevetResults');
    let documentsAddedToBatch = 0;

    dataToImport.forEach(student => {
      const docId = student['INE']; 
      if (docId) { 
        const studentRef = doc(collectionRef, docId);
        batch.set(studentRef, student); documentsAddedToBatch++;
      }
    });

    if (documentsAddedToBatch === 0) {
      setExcelError("Excel: Aucun élève avec un INE valide trouvé. Vérifiez le fichier.");
      toast({ variant: "destructive", title: "Importation Excel Annulée", description: "Aucun élève avec INE valide.", duration: 7000 });
      setIsExcelImporting(false); return;
    }

    try {
      await batch.commit();
      toast({ title: "Importation Excel Réussie", description: `${documentsAddedToBatch} enregistrements Excel importés pour ${yearToImportForToast}.` });
      setExcelFile(null); setExcelFileName(null);
      if (excelFileInputRef.current) excelFileInputRef.current.value = ''; 
    } catch (importError: any) {
      console.error("Erreur d'importation Excel Firestore:", importError);
      let userMessage = `Échec de l'importation Excel: ${importError.message}.`;
      setError(userMessage); // Generic error state for now, can be split if needed
      toast({ variant: "destructive", title: "Erreur d'Importation Excel Firestore", description: userMessage, duration: 10000 });
    } finally {
      setIsExcelImporting(false);
    }
  };

  const parseAndImportExcelData = async () => {
    if (!excelFile) {
      setExcelError("Aucun fichier Excel sélectionné.");
      toast({ variant: "destructive", title: "Erreur Excel", description: "Aucun fichier Excel." });
      return;
    }
    if (!importYear || importYear.trim() === "") {
      setExcelError("L'année d'importation est requise pour Excel.");
      toast({ variant: "destructive", title: "Erreur Excel", description: "Veuillez spécifier l'année d'importation.", duration: 5000 });
      return;
    }
    setIsExcelLoading(true); setExcelError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target?.result;
          if (!arrayBuffer) throw new Error("Fichier Excel vide ou illisible.");
          const data = new Uint8Array(arrayBuffer as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          if (!workbook.SheetNames.length) throw new Error("Classeur Excel sans feuilles.");
          
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawDataObjects = XLSX.utils.sheet_to_json<any>(worksheet, { raw: false, defval: undefined });
          if (rawDataObjects.length === 0) throw new Error("Aucune donnée dans la première feuille Excel.");

          const transformedData: StudentData[] = [];
          const validationErrors: { row: number; errors: any }[] = [];
          const explicitlyMappedHeaders = new Set([ /* ... headers as before ... */ ]);


          rawDataObjects.forEach((rawRow, index) => {
            const studentInput: any = {
              'anneeScolaireImportee': importYear, 
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
              rawRowData: rawRow, options: {} 
            };
            const currentOptions: Record<string, string> = {};
            for (const excelHeader in rawRow) {
              if (rawRow.hasOwnProperty(excelHeader) && !explicitlyMappedHeaders.has(excelHeader)) {
                const value = rawRow[excelHeader];
                if (value !== undefined && value !== null) currentOptions[excelHeader] = String(value);
              }
            }
            if (Object.keys(currentOptions).length > 0) studentInput.options = currentOptions;

            const validationResult = studentDataSchema.safeParse(studentInput);
            if (validationResult.success) transformedData.push(validationResult.data);
            else validationErrors.push({ row: index + 2, errors: validationResult.error.flatten() });
          });

          if (validationErrors.length > 0) {
            const firstError = validationErrors[0];
            const errorMessages = Object.entries(firstError.errors.fieldErrors).map(([field, messages]) => messages && messages.length > 0 ? `${field}: ${messages[0]}` : `${field}: Erreur`).join('; ');
            throw new Error(`Excel: Validation échouée. Ex: Ligne ${firstError.row}: ${errorMessages}`);
          }
          if (transformedData.length > 0) await handleExcelImportToFirestore(transformedData, importYear);
          else if (excelError) {}
          else if (rawDataObjects.length > 0 && transformedData.length === 0 && validationErrors.length === 0) throw new Error("Excel: Aucune ligne traitable. Vérifiez les colonnes INE, Nom, Prénom.");
          else throw new Error("Excel: Aucune donnée valide. Vérifiez format et contenu.");
        } catch (parseOrImportError: any) {
          console.error("Erreur parsing/import Excel:", parseOrImportError);
          setExcelError(`Erreur Excel: ${parseOrImportError.message}`);
          toast({ variant: "destructive", title: "Erreur Fichier Excel", description: parseOrImportError.message, duration: 7000 });
        } finally {
          setIsExcelLoading(false);
        }
      };
      reader.onerror = () => {
        console.error("Erreur FileReader Excel:", reader.error);
        setExcelError("Impossible de lire le fichier Excel.");
        toast({ variant: "destructive", title: "Erreur Excel", description: "Impossible de lire." });
        setIsExcelLoading(false);
      };
      reader.readAsArrayBuffer(excelFile);
    } catch (e: any) {
      console.error("Erreur générale import Excel:", e);
      setExcelError(e.message);
      toast({ variant: "destructive", title: "Erreur Excel Inconnue", description: e.message });
      setIsExcelLoading(false);
    }
  };

  // --- CSV File Handling ---
  const processCsvFile = (selectedFile: File | null | undefined) => {
    if (selectedFile) {
      if (selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv')) {
        setCsvFile(selectedFile);
        setCsvFileName(selectedFile.name);
        setCsvError(null);
      } else {
        const errorMsg = "Format de fichier invalide pour CSV. Veuillez sélectionner un fichier .csv.";
        setCsvError(errorMsg);
        setCsvFile(null);
        setCsvFileName(null);
        toast({ variant: "destructive", title: "Erreur de Fichier CSV", description: errorMsg });
      }
    } else {
      setCsvFile(null);
      setCsvFileName(null);
    }
  };

  const handleCsvFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) processCsvFile(files[0]);
    else processCsvFile(null);
    if (csvFileInputRef.current) csvFileInputRef.current.value = '';
  };
  
  const handleCsvDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    csvDragCounter.current++;
    if (event.dataTransfer.items && event.dataTransfer.items.length > 0) setIsCsvDraggingOver(true);
  };
  const handleCsvDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    csvDragCounter.current--;
    if (csvDragCounter.current === 0) setIsCsvDraggingOver(false);
  };
  const handleCsvDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy';
    if (!isCsvDraggingOver) setIsCsvDraggingOver(true);
  };
  const handleCsvDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    setIsCsvDraggingOver(false); csvDragCounter.current = 0;
    const droppedFiles = event.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      processCsvFile(droppedFiles[0]);
      if (csvFileInputRef.current) csvFileInputRef.current.value = '';
    }
  };

  const parseAndImportCsvData = async () => {
    if (!csvFile) {
      setCsvError("Aucun fichier CSV sélectionné.");
      toast({ variant: "destructive", title: "Erreur CSV", description: "Aucun fichier CSV." });
      return;
    }
    setIsCsvLoading(true); setCsvError(null);

    // TODO: Implement CSV parsing (e.g., using a library like Papaparse or custom logic)
    // TODO: Implement validation against studentBaseSchema
    // TODO: Implement Firestore import logic for CSV data (potentially to a 'baseEleves' collection)
    
    try {
      // Placeholder for CSV reading and parsing
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const csvText = event.target?.result as string;
          if (!csvText) throw new Error("Fichier CSV vide ou illisible.");

          // --- START OF VERY BASIC CSV PARSING PLACEHOLDER ---
          const lines = csvText.split(/\r\n|\n/);
          if (lines.length < 2) throw new Error("CSV doit avoir des en-têtes et au moins une ligne de données.");
          
          const headers = lines[0].split(',').map(h => h.trim().toUpperCase()); // Normalize headers
          const ineIndex = headers.indexOf('INE');
          const nomIndex = headers.indexOf('NOM');
          const prenomIndex = headers.indexOf('PRENOM');
          // Add more indices as needed from studentBaseSchema

          if (ineIndex === -1 || nomIndex === -1 || prenomIndex === -1) {
            throw new Error("Colonnes CSV requises manquantes (INE, NOM, PRENOM). Vérifiez les en-têtes.");
          }
          
          const dataToImport: StudentBaseData[] = [];
          const validationErrors: { row: number; errors: any }[] = [];

          for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue; // Skip empty lines
            const values = lines[i].split(',');
            const rawRow: any = {};
            headers.forEach((header, idx) => {
                rawRow[header] = values[idx]?.trim();
            });

            const validationResult = studentBaseSchema.safeParse(rawRow);
            if (validationResult.success) {
              dataToImport.push(validationResult.data);
            } else {
              validationErrors.push({ row: i + 1, errors: validationResult.error.flatten() });
            }
          }
          // --- END OF VERY BASIC CSV PARSING PLACEHOLDER ---

          if (validationErrors.length > 0) {
            const firstError = validationErrors[0];
            const errorMessages = Object.entries(firstError.errors.fieldErrors).map(([field, messages]) => messages && messages.length > 0 ? `${field}: ${messages[0]}` : `${field}: Erreur`).join('; ');
            throw new Error(`CSV: Validation échouée. Ex: Ligne ${firstError.row}: ${errorMessages}`);
          }

          if (dataToImport.length === 0) throw new Error("Aucune donnée CSV valide à importer après parsing.");

          // Placeholder for Firestore import
          setIsCsvImporting(true);
          const db = getFirestore(app);
          const batch = writeBatch(db);
          const collectionRef = collection(db, 'baseEleves'); // Example collection name
          let csvDocsAdded = 0;

          dataToImport.forEach(student => {
            const docId = student.INE;
            if (docId) {
              const studentRef = doc(collectionRef, docId);
              batch.set(studentRef, { ...student, anneeImport: new Date().getFullYear() }); // Add import year
              csvDocsAdded++;
            }
          });
          
          if (csvDocsAdded === 0) {
            setCsvError("CSV: Aucun élève avec INE valide trouvé. Vérifiez le fichier.");
            toast({ variant: "destructive", title: "Importation CSV Annulée", description: "Aucun élève avec INE valide.", duration: 7000 });
            setIsCsvImporting(false); setIsCsvLoading(false); return;
          }

          await batch.commit();
          toast({ title: "Importation CSV Réussie (Placeholder)", description: `${csvDocsAdded} enregistrements CSV importés (simulation).` });
          setCsvFile(null); setCsvFileName(null);
          if (csvFileInputRef.current) csvFileInputRef.current.value = '';
          
        } catch (parseError: any) {
          console.error("Erreur parsing/import CSV:", parseError);
          setCsvError(`Erreur CSV: ${parseError.message}`);
          toast({ variant: "destructive", title: "Erreur Fichier CSV", description: parseError.message, duration: 7000 });
        } finally {
          setIsCsvLoading(false);
          setIsCsvImporting(false);
        }
      };
      reader.onerror = () => {
        setCsvError("Impossible de lire le fichier CSV.");
        toast({ variant: "destructive", title: "Erreur CSV", description: "Impossible de lire." });
        setIsCsvLoading(false);
      };
      reader.readAsText(csvFile); // Read as text for CSV

    } catch (e: any) {
      console.error("Erreur générale import CSV:", e);
      setCsvError(e.message);
      toast({ variant: "destructive", title: "Erreur CSV Inconnue", description: e.message });
      setIsCsvLoading(false);
    }
  };


  return (
    <div className="space-y-8 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Importer des Données</h1>
        <p className="text-muted-foreground mt-1">
          Téléversez des fichiers pour mettre à jour les résultats des élèves ou la base élèves.
        </p>
      </header>

      {/* Excel Import Card */}
      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <Import className="mr-2 h-5 w-5 text-primary" />
            Importer Résultats Brevet (Excel)
            </CardTitle>
          <CardDescription>
            Sélectionnez votre fichier Excel (.xlsx, .xls) et l'année scolaire correspondante.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="importYear-trigger" className="text-sm font-medium">Année Scolaire des Résultats</Label>
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="importYear-trigger"
                  variant={"outline"}
                  className={`w-full justify-start text-left font-normal ${!selectedStartYear && "text-muted-foreground"}`}
                  disabled={isExcelLoading || isExcelImporting}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {selectedStartYear ? String(selectedStartYear) : "Choisissez l'année"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <YearPicker
                  selectedYear={selectedStartYear}
                  onSelectYear={(year) => {
                    setSelectedStartYear(year); setImportYear(String(year)); setIsPopoverOpen(false);
                  }}
                  initialDisplayYear={initialPickerYear}
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">Obligatoire pour l'import Excel des résultats.</p>
          </div>

          <div
            onDragEnter={handleExcelDragEnter} onDragLeave={handleExcelDragLeave}
            onDragOver={handleExcelDragOver} onDrop={handleExcelDrop}
            className={cn(
              "relative flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/70 transition-colors",
              isExcelDraggingOver ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
            )}
          >
            <UploadCloud className={cn("w-10 h-10 mb-4", isExcelDraggingOver ? "text-primary" : "text-muted-foreground")} />
            <Label htmlFor="excel-file-upload-input" className="text-sm font-medium text-center">
              Glissez-déposez (.xlsx, .xls) ou <span className="font-semibold text-primary hover:underline">cliquez</span>
            </Label>
            <Input
              id="excel-file-upload-input" ref={excelFileInputRef} type="file"
              accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
              onChange={handleExcelFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isExcelLoading || isExcelImporting}
            />
            {excelFileName && (<p className="mt-3 text-sm text-muted-foreground">Fichier Excel : {excelFileName}</p>)}
          </div>
          
          <div className="flex justify-end mt-4">
            <Button 
              onClick={parseAndImportExcelData} 
              disabled={!excelFile || isExcelLoading || isExcelImporting || !importYear.trim()} 
              className="w-full sm:w-auto"
            >
              {(isExcelLoading || isExcelImporting) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Import className="mr-2 h-4 w-4" />}
              {isExcelLoading ? "Lecture Excel..." : (isExcelImporting ? "Import Excel..." : "Importer Résultats (Excel)")}
            </Button>
          </div>
          {excelError && (
            <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertTriangle className="mr-2 h-4 w-4" /> {excelError}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="my-8" />

      {/* CSV Import Card */}
      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <FileText className="mr-2 h-5 w-5 text-primary" />
            Importer la Base Élèves (CSV)
          </CardTitle>
          <CardDescription>
            Téléversez un fichier CSV (.csv) contenant la liste des élèves.
            Les en-têtes attendus sont: INE, NOM, PRENOM, DATE_NAISSANCE, CODE_ETABLISSEMENT, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
           <div
            onDragEnter={handleCsvDragEnter} onDragLeave={handleCsvDragLeave}
            onDragOver={handleCsvDragOver} onDrop={handleCsvDrop}
            className={cn(
              "relative flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/70 transition-colors",
              isCsvDraggingOver ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
            )}
          >
            <UploadCloud className={cn("w-10 h-10 mb-4", isCsvDraggingOver ? "text-primary" : "text-muted-foreground")} />
            <Label htmlFor="csv-file-upload-input" className="text-sm font-medium text-center">
              Glissez-déposez votre fichier CSV ici ou <span className="font-semibold text-primary hover:underline">cliquez pour sélectionner</span>
            </Label>
            <Input
              id="csv-file-upload-input" ref={csvFileInputRef} type="file"
              accept=".csv, text/csv"
              onChange={handleCsvFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isCsvLoading || isCsvImporting}
            />
            {csvFileName && (<p className="mt-3 text-sm text-muted-foreground">Fichier CSV : {csvFileName}</p>)}
          </div>

          <div className="flex justify-end mt-4">
            <Button 
              onClick={parseAndImportCsvData} 
              disabled={!csvFile || isCsvLoading || isCsvImporting}
              className="w-full sm:w-auto"
            >
              {(isCsvLoading || isCsvImporting) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Import className="mr-2 h-4 w-4" />}
              {isCsvLoading ? "Lecture CSV..." : (isCsvImporting ? "Import CSV..." : "Importer Élèves (CSV)")}
            </Button>
          </div>

          {csvError && (
            <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertTriangle className="mr-2 h-4 w-4" /> {csvError}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
    
