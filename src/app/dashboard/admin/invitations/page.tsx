
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react'; // CheckCircle, XCircle removed as they are commented out
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { app } from '@/lib/firebase';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface InvitationRequest {
  id: string;
  email: string;
  requestedAt: string; // ISO string date
  status: 'pending' | 'approved' | 'rejected';
}

interface CloudFunctionResponse {
  success: boolean;
  message: string;
  invitations?: InvitationRequest[];
}

export default function AdminInvitationsPage() {
  const [invitations, setInvitations] = useState<InvitationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({}); // Temporarily unused

  const { toast } = useToast();
  const functions = getFunctions(app, 'europe-west1');

  const callListPendingInvitations = httpsCallable<void, CloudFunctionResponse>(functions, 'listPendingInvitations');
  // const callApproveInvitation = httpsCallable<{ email: string }, CloudFunctionResponse>(functions, 'approveInvitation'); // Temporarily commented
  // const callRejectInvitation = httpsCallable<{ email: string, reason?: string }, CloudFunctionResponse>(functions, 'rejectInvitation'); // Temporarily commented

  const fetchPendingInvitations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result: HttpsCallableResult<CloudFunctionResponse> = await callListPendingInvitations();
      if (result.data.success && result.data.invitations) {
        setInvitations(result.data.invitations);
      } else {
        throw new Error(result.data.message || "Erreur lors de la récupération des invitations.");
      }
    } catch (err: any) {
      console.error("Erreur fetchPendingInvitations:", err);
      setError(err.message || "Impossible de charger les invitations en attente.");
      toast({ variant: "destructive", title: "Erreur", description: err.message || "Une erreur inconnue est survenue." });
    } finally {
      setIsLoading(false);
    }
  }, [toast, callListPendingInvitations]);

  useEffect(() => {
    fetchPendingInvitations();
  }, [fetchPendingInvitations]);

  // const handleAction = async (action: 'approve' | 'reject', email: string, invitationId: string) => {
  //   setActionLoading(prev => ({ ...prev, [invitationId]: true }));
  //   try {
  //     let result: HttpsCallableResult<CloudFunctionResponse>;
  //     if (action === 'approve') {
  //       // result = await callApproveInvitation({ email });
  //     } else {
  //       // result = await callRejectInvitation({ email }); // Assuming reason is optional or handled
  //     }

  //     // if (result.data.success) {
  //     //   toast({ title: "Succès", description: result.data.message });
  //     //   fetchPendingInvitations(); // Refresh list after action
  //     // } else {
  //     //   throw new Error(result.data.message || `Échec de l'action: ${action}`);
  //     // }
  //   } catch (err: any) {
  //     console.error(`Erreur ${action}Invitation:`, err);
  //     toast({ variant: "destructive", title: "Erreur", description: err.message });
  //   } finally {
  //     // setActionLoading(prev => ({ ...prev, [invitationId]: false }));
  //   }
  // };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Chargement des demandes d'invitation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-4 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-destructive mb-2">Erreur de chargement</h2>
        <p className="text-muted-foreground max-w-md mb-4">{error}</p>
        <Button onClick={fetchPendingInvitations} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" /> Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Gestion des Invitations</h1>
        <p className="text-muted-foreground mt-1">
          Approuvez ou rejetez les demandes d'accès à l'application. (Actions temporairement désactivées)
        </p>
      </header>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl">Demandes en Attente</CardTitle>
              <CardDescription>
                {invitations.length === 0
                  ? "Aucune demande d'invitation en attente."
                  : `Liste des demandes d'invitation avec le statut "en attente".`}
              </CardDescription>
            </div>
            <Button onClick={fetchPendingInvitations} variant="outline" size="sm" disabled={isLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Actualiser
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {invitations.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>E-mail du demandeur</TableHead>
                    <TableHead>Date de la demande</TableHead>
                    <TableHead className="text-center">Statut</TableHead>
                    <TableHead className="text-right">Actions (Désactivées)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">{invite.email}</TableCell>
                      <TableCell>
                        {format(new Date(invite.requestedAt), "dd MMMM yyyy 'à' HH:mm", { locale: fr })}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={invite.status === 'pending' ? 'warning' : 'default'}>
                          {invite.status === 'pending' ? 'En attente' : invite.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {/*
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAction('approve', invite.email, invite.id)}
                          disabled={actionLoading[invite.id]}
                          className="text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
                        >
                          {actionLoading[invite.id] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                          Approuver
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAction('reject', invite.email, invite.id)}
                          disabled={actionLoading[invite.id]}
                          className="text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          {actionLoading[invite.id] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                          Rejeter
                        </Button>
                        */}
                        <span className="text-xs text-muted-foreground">Actions désactivées</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            !isLoading && <p className="text-muted-foreground text-center py-8">Aucune demande d'invitation en attente pour le moment.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
