
'use client';

import type { ReactNode, ChangeEvent } from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { getAuth, type User, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { app, db, functions as functionsInstance } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, Save, Frown, PenSquare, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface Student {
  id: string;
  NOM: string;
  PRENOM: string;
  CLASSE?: string;
  notes?: {
    [subject: string]: {
      bb1?: number;
      bb2?: number;
    };
  };
}

interface EditedNotes {
  [studentId: string]: {
    bb1: string; // Use string to handle empty inputs
    bb2: string;
  };
}

// Custom hook to get user subject
const useUserSubject = () => {
    const [subject, setSubject] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const auth = getAuth(app);
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                const idTokenResult = await currentUser.getIdTokenResult();
                const userSubject = idTokenResult.claims.subject as string | undefined;
                setSubject(userSubject ?? null);
            } else {
                setSubject(null);
                setUser(null);
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    return { subject, isLoading, user };
};


export default function SaisieNotesPage() {
    const { subject, isLoading: isAuthLoading, user } = useUserSubject();
    const [selectedYear, setSelectedYear] = useState<string>('');
    const [availableYears, setAvailableYears] = useState<string[]>([]);
    const [isYearsLoading, setIsYearsLoading] = useState(true);
    const [students, setStudents] = useState<Student[]>([]);
    const [editedNotes, setEditedNotes] = useState<EditedNotes>({});
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const fetchYears = async () => {
            if (!user) return; // Wait for user to be authenticated
            setIsYearsLoading(true);
            try {
                const bbRef = collection(db, 'BrevetBlanc');
                const querySnapshot = await getDocs(bbRef);
                const yearsFromDb = new Set<string>();
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    if (data.anneeScolaire) {
                        yearsFromDb.add(data.anneeScolaire);
                    }
                });

                const currentYearStr = new Date().getFullYear().toString();
                yearsFromDb.add(currentYearStr);

                const sortedYears = Array.from(yearsFromDb).sort((a, b) => b.localeCompare(a));
                setAvailableYears(sortedYears);
                if (sortedYears.length > 0 && !selectedYear) {
                    setSelectedYear(sortedYears[0]);
                }
            } catch (err: any) {
                console.error("Error fetching years from BrevetBlanc:", err);
                toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de charger les années scolaires disponibles." });
                const currentYearStr = new Date().getFullYear().toString();
                setAvailableYears([currentYearStr]);
                 if (!selectedYear) {
                    setSelectedYear(currentYearStr);
                 }
            } finally {
                setIsYearsLoading(false);
            }
        };
        fetchYears();
    }, [toast, user, selectedYear]);

    const fetchStudents = useCallback(async () => {
        if (!subject || !selectedYear) {
            setStudents([]);
            setEditedNotes({});
            if (!subject && !isAuthLoading) {
              setError("Aucune matière ne vous est assignée. Impossible de saisir des notes.");
            } else if (!selectedYear && !isYearsLoading) {
              setError("Veuillez sélectionner une année scolaire pour commencer.");
            }
            setIsLoadingData(false);
            return;
        }

        setIsLoadingData(true);
        setError(null);
        try {
            const studentsRef = collection(db, 'BrevetBlanc');
            const q = query(studentsRef, where("anneeScolaire", "==", selectedYear));
            const querySnapshot = await getDocs(q);

            const fetchedStudents: Student[] = [];
            const initialNotes: EditedNotes = {};

            querySnapshot.forEach(docSnap => {
                const data = docSnap.data();
                const studentData: Student = {
                    id: docSnap.id,
                    NOM: data.NOM,
                    PRENOM: data.PRENOM,
                    CLASSE: data.CLASSE,
                    notes: data.notes,
                };
                fetchedStudents.push(studentData);

                const subjectNotes = data.notes?.[subject];
                initialNotes[docSnap.id] = {
                    bb1: subjectNotes?.bb1?.toString() ?? '',
                    bb2: subjectNotes?.bb2?.toString() ?? '',
                };
            });
            
            fetchedStudents.sort((a, b) => {
              const classCompare = (a.CLASSE ?? '').localeCompare(b.CLASSE ?? '');
              if (classCompare !== 0) return classCompare;
              return a.NOM.localeCompare(b.NOM);
            });

            setStudents(fetchedStudents);
            setEditedNotes(initialNotes);
        } catch (err: any) {
            console.error("Erreur de récupération des élèves :", err);
            setError("Impossible de charger la liste des élèves. " + err.message);
            toast({ variant: 'destructive', title: 'Erreur de chargement', description: err.message });
        } finally {
            setIsLoadingData(false);
        }
    }, [subject, selectedYear, toast, isAuthLoading, isYearsLoading]);

    useEffect(() => {
        fetchStudents();
    }, [fetchStudents]);

    const handleNoteChange = (studentId: string, exam: 'bb1' | 'bb2', value: string) => {
        const sanitizedValue = value.replace(/[^0-9,.]/g, '').replace(',', '.');
        setEditedNotes(prev => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [exam]: sanitizedValue,
            },
        }));
    };
    
    const callUpdateBrevetBlancNotes = useMemo(() =>
        functionsInstance ? httpsCallable(functionsInstance, 'updateBrevetBlancNotes') : null,
        []
    );

    const handleSaveChanges = async () => {
      if (!subject || !callUpdateBrevetBlancNotes) {
        toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de sauvegarder, fonction non disponible." });
        return;
      }
      
      setIsSaving(true);
      
      const payload: { studentId: string, noteBB1: number | null, noteBB2: number | null }[] = [];
      let validationError = false;

      for (const studentId in editedNotes) {
        const noteBB1Str = editedNotes[studentId].bb1;
        const noteBB2Str = editedNotes[studentId].bb2;

        const noteBB1 = noteBB1Str === '' ? null : parseFloat(noteBB1Str);
        const noteBB2 = noteBB2Str === '' ? null : parseFloat(noteBB2Str);

        if ((noteBB1Str !== '' && isNaN(noteBB1!)) || (noteBB2Str !== '' && isNaN(noteBB2!))) {
          validationError = true;
          toast({ variant: 'destructive', title: 'Erreur de saisie', description: `Note invalide pour l'élève ${students.find(s => s.id === studentId)?.PRENOM} ${students.find(s => s.id === studentId)?.NOM}.` });
          break;
        }
        
        payload.push({ studentId, noteBB1, noteBB2 });
      }

      if (validationError) {
        setIsSaving(false);
        return;
      }

      try {
        await callUpdateBrevetBlancNotes({ updates: payload });
        toast({ title: 'Succès', description: "Les notes ont été enregistrées avec succès." });
      } catch (err: any) {
        console.error("Erreur lors de la sauvegarde :", err);
        toast({ variant: 'destructive', title: 'Erreur de sauvegarde', description: err.message });
      } finally {
        setIsSaving(false);
      }
    };


    const renderContent = () => {
        if (isAuthLoading || (selectedYear && isLoadingData)) {
            return (
                <div className="space-y-4">
                    <Skeleton className="h-10 w-1/4" />
                    <Skeleton className="h-80 w-full" />
                </div>
            );
        }

        if (error) {
            return (
                <Card className="text-center">
                  <CardHeader>
                    <CardTitle className="text-destructive flex justify-center items-center">
                      <AlertTriangle className="mr-2 h-6 w-6"/>
                      Une erreur est survenue
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{error}</p>
                     <Button onClick={fetchStudents} variant="outline" className="mt-4">
                        <Loader2 className="mr-2 h-4 w-4" />
                        Réessayer
                    </Button>
                  </CardContent>
                </Card>
            );
        }
        
        if (!subject) {
            return (
              <Card className="text-center">
                  <CardHeader>
                    <CardTitle className="text-destructive flex justify-center items-center">
                      <Info className="mr-2 h-6 w-6"/>
                      Action requise
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Aucune matière ne vous est assignée. Veuillez contacter un administrateur.</p>
                  </CardContent>
                </Card>
            )
        }

        if (students.length === 0) {
            return (
                <Card className="text-center">
                  <CardHeader>
                    <CardTitle className="flex justify-center items-center">
                      <Frown className="mr-2 h-6 w-6"/>
                      Aucun élève trouvé
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Aucun élève trouvé pour l'année scolaire {selectedYear}. Veuillez importer une liste d'élèves ou sélectionner une autre année.</p>
                  </CardContent>
                </Card>
            );
        }
        
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl flex items-center">
                      <PenSquare className="mr-3 h-6 w-6 text-primary"/>
                      Saisie des notes pour : {subject}
                    </CardTitle>
                    <CardDescription>Année scolaire : {selectedYear}. Saisissez les notes pour les deux brevets blancs.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nom</TableHead>
                                    <TableHead>Prénom</TableHead>
                                    <TableHead>Classe</TableHead>
                                    <TableHead className="w-[150px]">Note Brevet Blanc 1</TableHead>
                                    <TableHead className="w-[150px]">Note Brevet Blanc 2</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {students.map(student => (
                                    <TableRow key={student.id}>
                                        <TableCell className="font-medium">{student.NOM}</TableCell>
                                        <TableCell>{student.PRENOM}</TableCell>
                                        <TableCell>{student.CLASSE ?? 'N/A'}</TableCell>
                                        <TableCell>
                                            <Input
                                                type="text"
                                                placeholder="Note /20"
                                                value={editedNotes[student.id]?.bb1 ?? ''}
                                                onChange={e => handleNoteChange(student.id, 'bb1', e.target.value)}
                                                className="w-full"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="text"
                                                placeholder="Note /20"
                                                value={editedNotes[student.id]?.bb2 ?? ''}
                                                onChange={e => handleNoteChange(student.id, 'bb2', e.target.value)}
                                                className="w-full"
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex justify-end mt-6">
                        <Button onClick={handleSaveChanges} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            {isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="space-y-6 p-1 md:p-4">
            <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground tracking-tight">Saisie des Notes du Brevet Blanc</h1>
                    <p className="text-muted-foreground mt-1">
                        Cette page vous permet de saisir les notes pour la matière qui vous a été assignée.
                    </p>
                </div>
                <div className="w-full sm:w-52">
                  <Label htmlFor="year-select">Année Scolaire</Label>
                  <Select 
                      value={selectedYear} 
                      onValueChange={setSelectedYear} 
                      disabled={isYearsLoading || availableYears.length === 0}
                  >
                      <SelectTrigger id="year-select">
                          <SelectValue placeholder={isYearsLoading ? "Chargement..." : "Choisir..."} />
                      </SelectTrigger>
                      <SelectContent>
                          {!isYearsLoading && availableYears.map(year => (
                              <SelectItem key={year} value={year}>{year}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
                </div>
            </header>
            {renderContent()}
        </div>
    );
}
