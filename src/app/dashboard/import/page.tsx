
"use client";

import type { ChangeEvent } from 'react';
import { useState } from 'react';
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
      if (selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile);
        setFileName(selectedFile.name);
        setError(null);
      } else {
        setError("Format de fichier invalide. Veuillez sélectionner un fichier .csv.");
        setFile(null);
        setFileName(null);
        toast({ variant: "destructive", title: "Erreur de fichier", description: "Format de fichier invalide. Veuillez sélectionner un fichier .csv." });
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
    let documentsAddedToBatch = 0;

    dataToImport.forEach(student => {
      if (student.numeroCandidatINE && student.numeroCandidatINE.trim() !== "") {
        const studentRef = doc(collectionRef, student.numeroCandidatINE);
        // Exclure rawRowData et s'assurer qu'il n'y a pas de valeurs undefined
        const { rawRowData, ...studentDataForFirestore } = student;
        const cleanedStudentData = JSON.parse(JSON.stringify(studentDataForFirestore));
        batch.set(studentRef, cleanedStudentData);
        documentsAddedToBatch++;
      } else {
        console.warn("Skipping student due to missing or invalid INE:", student);
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
      toast({ title: "Importation Réussie", description: `${documentsAddedToBatch} enregistrements importés dans Firestore.` });
      setFile(null);
      setFileName(null);
    } catch (importError: any) {
      console.error("Erreur d'importation Firestore:", importError);
      let userMessage = `Échec de l'importation: ${importError.message}.`;
      if (importError.message && (importError.message.includes('transport errored') || importError.message.includes('RPC'))) {
          userMessage += " Vérifiez votre connexion internet, la configuration de votre projet Firebase (Firestore activé, région sélectionnée), vos règles de sécurité Firestore, et consultez la console du navigateur pour d'éventuelles erreurs d'initialisation Firebase.";
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

    setIsLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const csvText = event.target?.result as string;
          if (!csvText) {
            throw new Error("Le fichier CSV est vide ou n'a pas pu être lu.");
          }

          const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');
          if (lines.length < 1) { 
            throw new Error("Le fichier CSV est vide ou ne contient pas de ligne d'en-tête.");
          }
          
          let headerRowIndex = -1;
          let csvHeaders: string[] = [];

          // Recherche de la ligne d'en-tête
          for (let i = 0; i < lines.length; i++) {
              const potentialHeaders = lines[i].split(';').map(h => h.trim());
              // Critères pour identifier la ligne d'en-tête (ajustez si nécessaire)
              if (potentialHeaders.includes('INE') && potentialHeaders.includes('Nom candidat') && potentialHeaders.includes('Prénom candidat')) {
                  csvHeaders = potentialHeaders;
                  headerRowIndex = i;
                  break;
              }
          }

          if (headerRowIndex === -1) {
              throw new Error("Impossible de trouver la ligne d'en-tête dans le fichier CSV. Assurez-vous qu'elle contient les colonnes 'INE', 'Nom candidat' et 'Prénom candidat'.");
          }
          
          const dataObjects: any[] = [];
          // Commencer à lire les données après la ligne d'en-tête
          if (lines.length > headerRowIndex + 1) {
            for (let i = headerRowIndex + 1; i < lines.length; i++) {
                const values = lines[i].split(';');
                // Vérifier si le nombre de valeurs correspond au nombre d'en-têtes
                if (values.length === csvHeaders.length) {
                    const rowObject: any = {};
                    csvHeaders.forEach((header, index) => {
                        // S'assurer que la valeur est une chaîne, même si elle est vide ou null
                        rowObject[header] = values[index] !== undefined && values[index] !== null ? String(values[index]).trim() : null;
                    });
                    dataObjects.push(rowObject);
                } else {
                    console.warn(`Ligne ${i + 1} ignorée : nombre de colonnes incohérent. Attendu ${csvHeaders.length}, obtenu ${values.length}. Ligne: "${lines[i]}"`);
                }
            }
          }


          if (dataObjects.length === 0 && lines.length > headerRowIndex + 1 ) {
             throw new Error("Aucune ligne de données n'a pu être analysée à partir du CSV. Vérifiez la cohérence du nombre de colonnes et les délimiteurs (point-virgule).");
          }
          if (dataObjects.length === 0 && !(lines.length > headerRowIndex + 1)) {
            throw new Error("Aucune ligne de données trouvée après la ligne d'en-tête dans le fichier CSV.");
          }


          const transformedData: StudentData[] = [];
          const validationErrors: { row: number; errors: any }[] = [];
          
          // Ensemble des en-têtes principaux pour différencier des options
           const mainHeadersForOptionsLogic = new Set([
            'Série', 'Code Etablissement', 'Libellé Etablissement', 'Commune Etablissement',
            'Division de classe', 'Catégorie candidat', 'Numéro Candidat', 'INE', 
            'Nom candidat', 'Prénom candidat', 'Date de naissance', 'Résultat', 
            'TOTAL GENERAL', 'TOTAL POUR MENTION', 'Moyenne sur 20', 
            '001 - 1 - Français - Ponctuel', 
            // '001A - 1 - Grammaire, compréhension - Dictée - Ponctuel', // Sous-scores, peuvent être optionnels
            // '001AA - 1 - Grammaire et compréhension - Ponctuel',
            // '001AB - 1 - Dictée - Ponctuel',
            // '001B - 1 - Rédaction - Ponctuel',
            '002 - 1 - Mathématiques - Ponctuel',
            '003 - 1 - Histoire, géographie, enseignement moral et civique - Ponctuel',
            '004 - 1 - Sciences - Ponctuel', // Ajouté
            '005 - 1 - Soutenance orale de projet - Evaluation en cours d\'année',
            // '007 - 1 - Socle commun de connaissances, compétences, culture - Contrôle continu', // Et ses sous-scores
            // Les colonnes '007...' spécifiques comme '007AA', '007AB', etc. seront capturées comme options si non explicitement mappées ci-dessous
            '007AB - 1 - Langues étrangères ou régionales - Contrôle continu',
            '007AD - 1 - Langages des arts et du corps - Contrôle continu',
            // Si d'autres colonnes comme 'Edu Mus01A /50' sont toujours présentes, ajoutez-les ici
            'Edu Mus01A /50',
            'EPS CCF01A /100',
            'Phy Chi01A /50',
            'Sci Vie01A /50',
          ]);

          dataObjects.forEach((rawRow, index) => {
            // Fonction utilitaire pour obtenir la valeur d'une colonne par son nom d'en-tête
            const getCsvVal = (headerName: string) => rawRow[headerName]; 

            // Pré-filtrage plus robuste des lignes non pertinentes
            const ine = String(getCsvVal('INE') || getCsvVal('Numéro Candidat') || '').trim(); // INE est prioritaire
            const nom = String(getCsvVal('Nom candidat') || '').trim();
            const prenoms = String(getCsvVal('Prénom candidat') || '').trim(); // Nom de colonne Excel

            // Ignorer la ligne si les identifiants essentiels sont manquants
            if (!ine || !nom || !prenoms) {
              return; // Passer à la ligne suivante
            }
            
            const studentInput: any = { // Utiliser 'any' temporairement pour flexibilité
              serie: getCsvVal('Série'),
              codeEtablissement: getCsvVal('Code Etablissement'),
              libelleEtablissement: getCsvVal('Libellé Etablissement'),
              communeEtablissement: getCsvVal('Commune Etablissement'),
              divisionEleve: getCsvVal('Division de classe'),
              categorieSocioPro: getCsvVal('Catégorie candidat'),
              numeroCandidatINE: ine,
              nomCandidat: nom,
              prenomsCandidat: prenoms,
              dateNaissance: getCsvVal('Date de naissance'), // Conserver comme chaîne pour l'instant
              resultat: getCsvVal('Résultat'),
              totalGeneral: getCsvVal('TOTAL GENERAL'),
              // totalPourMention: getCsvVal('TOTAL POUR MENTION'), // Décommentez si nécessaire
              totalPourcentage: getCsvVal('Moyenne sur 20'),
              scoreFrancais: getCsvVal('001 - 1 - Français - Ponctuel'),
              scoreMaths: getCsvVal('002 - 1 - Mathématiques - Ponctuel'),
              scoreHistoireGeo: getCsvVal('003 - 1 - Histoire, géographie, enseignement moral et civique - Ponctuel'),
              scoreSciences: getCsvVal('004 - 1 - Sciences - Ponctuel'), 
              scoreOralDNB: getCsvVal('005 - 1 - Soutenance orale de projet - Evaluation en cours d\'année'),
              scoreLVE: getCsvVal('007AB - 1 - Langues étrangères ou régionales - Contrôle continu'),
              scoreArtsPlastiques: getCsvVal('007AD - 1 - Langages des arts et du corps - Contrôle continu'),
              scoreEducationMusicale: getCsvVal('Edu Mus01A /50'), 
              scoreEPS: getCsvVal('EPS CCF01A /100'),
              scorePhysiqueChimie: getCsvVal('Phy Chi01A /50'),
              scoreSciencesVie: getCsvVal('Sci Vie01A /50'),
              options: {},
              rawRowData: rawRow, // Conserver les données brutes de la ligne si nécessaire
            };
            
            // Collecter les options
            const currentOptions: Record<string, string> = {};
            Object.keys(rawRow).forEach(csvHeader => {
                // Si l'en-tête n'est pas dans notre liste d'en-têtes principaux, c'est une option
                if (!mainHeadersForOptionsLogic.has(csvHeader)) {
                    const value = rawRow[csvHeader];
                    // S'assurer que la valeur n'est pas undefined, null ou une chaîne vide avant de l'ajouter
                    if (value !== undefined && value !== null && String(value).trim() !== '') {
                        currentOptions[csvHeader] = String(value);
                    }
                }
            });

             // Ajouter les options uniquement si elles ne sont pas vides
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
            // Afficher le premier message d'erreur pour chaque champ en erreur
            const errorMessages = Object.entries(firstError.errors.fieldErrors)
              .map(([field, messages]) => {
                if (messages && messages.length > 0) {
                  return `${field}: ${messages[0]}`; // Prendre le premier message d'erreur pour ce champ
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
            // Une erreur critique (ex: en-tête non trouvé) a déjà été définie
          } else if (dataObjects.length > 0 && transformedData.length === 0 && validationErrors.length === 0) {
            // Toutes les lignes ont été filtrées par la logique de pré-filtrage (INE/Nom/Prénom manquants)
            throw new Error("Aucune ligne n'a pu être traitée. Vérifiez que les colonnes 'INE', 'Nom candidat', et 'Prénom candidat' sont présentes, correctement nommées et remplies dans le fichier CSV.");
          } else {
            // Aucun objet de données n'a été créé ou aucune donnée transformée, sans erreurs de validation spécifiques
            throw new Error("Aucune donnée valide trouvée dans le fichier CSV après parsing.");
          }

        } catch (parseOrImportError: any) {
          console.error("Erreur lors du parsing CSV ou de l'importation:", parseOrImportError);
          setError(`Erreur: ${parseOrImportError.message}`);
          toast({ variant: "destructive", title: "Erreur de Fichier CSV", description: parseOrImportError.message, duration: 7000 });
        } finally {
          setIsLoading(false);
        }
      };
      reader.onerror = () => {
        console.error("Erreur FileReader:", reader.error);
        setError("Impossible de lire le fichier CSV.");
        toast({ variant: "destructive", title: "Erreur", description: "Impossible de lire le fichier CSV." });
        setIsLoading(false);
      };
      reader.readAsText(file, 'UTF-8'); // Utiliser UTF-8, ajuster si l'encodage est différent
    } catch (e: any) {
      console.error("Erreur générale d'import CSV:", e);
      setError(e.message);
      toast({ variant: "destructive", title: "Erreur Inconnue", description: e.message });
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-1 md:p-4">
      <h1 className="text-2xl font-semibold text-foreground">Importer les Données du Brevet (CSV)</h1>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Téléverser et Importer un fichier CSV</CardTitle>
          <CardDescription>Sélectionnez un fichier .csv (délimité par des points-virgules) contenant les résultats des élèves. Les données seront importées directement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <label htmlFor="file-upload" className="flex-grow w-full sm:w-auto">
              <Input
                id="file-upload"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                disabled={isLoading || isImporting}
              />
              <Button asChild variant="outline" className="w-full sm:w-auto cursor-pointer" disabled={isLoading || isImporting}>
                <div>
                  <UploadCloud className="mr-2 h-4 w-4" />
                  {fileName || "Choisir un fichier CSV..."}
                </div>
              </Button>
            </label>
            <Button onClick={parseAndImportData} disabled={!file || isLoading || isImporting} className="w-full sm:w-auto">
              {(isLoading || isImporting) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Import className="mr-2 h-4 w-4" />}
              {isLoading ? "Lecture du fichier CSV..." : (isImporting ? "Importation en cours..." : "Importer le Fichier CSV")}
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
