
"use client";

import type { ReactNode } from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, RefreshCw, Users, ShieldCheck, Save } from 'lucide-react';
import { httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { functions as functionsInstance } from '@/lib/firebase';

interface UserRecord {
  uid: string;
  email: string;
  customClaims?: {
    subject?: string;
    [key: string]: any;
  };
}

interface ListUsersResponse {
  success: boolean;
  users: UserRecord[];
  message?: string;
}

interface SetSubjectResponse {
  success: boolean;
  message: string;
}

const MATIERES = [
    "Mathématiques",
    "Français",
    "Histoire-Géographie-Enseignement moral et civique",
    "Technologie",
    "Physique-Chimie",
    "Sciences de la Vie et de la Terre"
];

export default function AdminGestionPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const { toast } = useToast();

  const callListAllUsers = useMemo(() =>
    functionsInstance ? httpsCallable<void, ListUsersResponse>(functionsInstance, 'listAllUsers') : null,
    []
  );

  const callSetUserSubject = useMemo(() =>
    functionsInstance ? httpsCallable<{ uid: string; subject: string }, SetSubjectResponse>(functionsInstance, 'setUserSubject') : null,
    []
  );

  const fetchUsers = useCallback(async (showLoadingIndicator = true) => {
    if (showLoadingIndicator) setIsLoading(true);
    setError(null);

    if (!callListAllUsers) {
      const errorMsg = "Le service de fonctions Firebase n'est pas disponible.";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Erreur de configuration", description: errorMsg });
      setIsLoading(false);
      return;
    }

    try {
      const result = await callListAllUsers();
      if (result.data.success) {
        setUsers(result.data.users);
      } else {
        throw new Error(result.data.message || "Erreur lors de la récupération des utilisateurs.");
      }
    } catch (err: any) {
      console.error("Erreur fetchUsers:", err);
      const errorMessage = err.message || "Impossible de charger la liste des utilisateurs.";
      setError(errorMessage);
      toast({ variant: "destructive", title: "Erreur de chargement", description: errorMessage, duration: 7000 });
    } finally {
      if (showLoadingIndicator) setIsLoading(false);
    }
  }, [toast, callListAllUsers]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSubjectChange = async (uid: string, subject: string) => {
    setActionLoading(prev => ({ ...prev, [uid]: true }));

    if (!callSetUserSubject) {
      toast({ variant: "destructive", title: "Erreur d'Action", description: "Service de fonctions non initialisé." });
      setActionLoading(prev => ({ ...prev, [uid]: false }));
      return;
    }

    try {
      const result = await callSetUserSubject({ uid, subject });
      if (result.data.success) {
        toast({ title: "Succès", description: result.data.message });
        // Optimistically update the local state
        setUsers(currentUsers =>
          currentUsers.map(user =>
            user.uid === uid
              ? { ...user, customClaims: { ...user.customClaims, subject: subject } }
              : user
          )
        );
      } else {
        throw new Error(result.data.message || "Échec de la mise à jour de la matière.");
      }
    } catch (err: any) {
      console.error("Erreur handleSubjectChange:", err);
      toast({ variant: "destructive", title: "Erreur d'Action", description: err.message, duration: 7000 });
    } finally {
      setActionLoading(prev => ({ ...prev, [uid]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Chargement des utilisateurs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-4 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-destructive mb-2">Erreur de chargement</h2>
        <p className="text-muted-foreground max-w-md mb-4">{error}</p>
        <Button onClick={() => fetchUsers(true)} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Gestion des Utilisateurs</h1>
        <p className="text-muted-foreground mt-1">
          Assignez des matières aux utilisateurs pour la saisie des notes du brevet blanc.
        </p>
      </header>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl">Liste des Utilisateurs</CardTitle>
              <CardDescription>
                {users.length} utilisateur(s) trouvé(s).
              </CardDescription>
            </div>
            <Button onClick={() => fetchUsers(true)} variant="outline" size="sm" disabled={isLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Actualiser
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Adresse E-mail</TableHead>
                  <TableHead>Matière Actuelle</TableHead>
                  <TableHead>Action : Changer la matière</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.uid}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>
                      {user.customClaims?.subject ? (
                        <Badge variant="secondary">{user.customClaims.subject}</Badge>
                      ) : (
                        <Badge variant="outline">Non assignée</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={user.customClaims?.subject ?? ''}
                          onValueChange={(value) => handleSubjectChange(user.uid, value)}
                          disabled={actionLoading[user.uid]}
                        >
                          <SelectTrigger className="w-[350px]">
                            <SelectValue placeholder="Sélectionner une matière..." />
                          </SelectTrigger>
                          <SelectContent>
                            {MATIERES.map(matiere => (
                                <SelectItem key={matiere} value={matiere}>
                                    {matiere}
                                </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {actionLoading[user.uid] && <Loader2 className="h-4 w-4 animate-spin" />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
