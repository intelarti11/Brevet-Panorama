
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { app } from '@/lib/firebase';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
// TODO: Consider adding a dialog for rejection reason if needed
// import {
//   AlertDialog,
//   AlertDialogAction,
//   AlertDialogCancel,
//   AlertDialogContent,
//   AlertDialogDescription,
//   AlertDialogFooter,
//   AlertDialogHeader,
//   AlertDialogTitle,
//   AlertDialogTrigger,
// } from "@/components/ui/alert-dialog";
// import { Textarea } from "@/components/ui/textarea";

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
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const { toast } = useToast();

  const functionsInstance = useMemo(() => getFunctions(app, 'europe-west1'), []);

  const callListPendingInvitations = useMemo(() =>
    httpsCallable<void, CloudFunctionResponse>(functionsInstance, 'listPendingInvitations'),
    [functionsInstance]
  );
  const callApproveInvitation = useMemo(() => 
    httpsCallable<{ invitationId: string }, CloudFunctionResponse>(functionsInstance, 'approveInvitation'),
    [functionsInstance]
  );
  const callRejectInvitation = useMemo(() => 
    httpsCallable<{ invitationId: string, reason?: string }, CloudFunctionResponse>(functionsInstance, 'rejectInvitation'),
    [functionsInstance]
  );

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
      const errorMessage = err.message || "Impossible de charger les invitations.";
      setError(errorMessage);
      // Show toast only if it's a new error or different from the current one to avoid spamming
      if (errorMessage !== error) {
        toast({ variant: "destructive", title: "Erreur de chargement", description: errorMessage, duration: 7000 });
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast, callListPendingInvitations, error]); // Added error to dependency array

  useEffect(() => {
    fetchPendingInvitations();
  }, [fetchPendingInvitations]);

  const handleAction = async (action: 'approve' | 'reject', invitationId: string) => {
    setActionLoading(prev => ({ ...prev, [invitationId]: true }));
    try {
      let result: HttpsCallableResult<CloudFunctionResponse>;
      if (action === 'approve') {
        result = await callApproveInvitation({ invitationId });
      } else {
        result = await callRejectInvitation({ invitationId }); // No reason passed for now
      }

      if (result.data.success) {
        toast({ title: "Succès", description: result.data.message });
        fetchPendingInvitations(); 
      } else {
        // Error from backend (e.g. {success: false, message: "..."})
        throw new Error(result.data.message || `Échec de l'action : ${action}`);
      }
    } catch (err: any) { // Catches errors from the call itself (network, internal function error) or thrown above
      console.error(`Erreur ${action}Invitation:`, err);
      // If err.message is already "internal", no need to make it more generic.
      // The backend function should return a meaningful message if it's a handled error.
      // If it's truly "internal", it means the function crashed.
      let description = "Une erreur est survenue.";
      if (err.message) {
        description = err.message.toLowerCase().includes("internal") || err.message.toLowerCase().includes("interna") // Firebase sometimes truncates
          ? "Une erreur interne est survenue sur le serveur. Veuillez consulter les logs de la fonction."
          : err.message;
      }
      
      toast({ variant: "destructive", title: "Erreur d'Action", description: description, duration: 7000 });
    } finally {
      setActionLoading(prev => ({ ...prev, [invitationId]: false }));
    }
  };

  if (isLoading && invitations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Chargement des demandes d'invitation...</p>
      </div>
    );
  }

  // Display error prominently if it's the initial load and it failed
  if (error && invitations.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-4 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-destructive mb-2">Erreur de chargement</h2>
        <p className="text-muted-foreground max-w-md mb-4">{error}</p>
        <Button onClick={fetchPendingInvitations} variant="outline" disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Gestion des Invitations</h1>
        <p className="text-muted-foreground mt-1">
          Approuvez ou rejetez les demandes d'accès à l'application.
        </p>
      </header>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl">Demandes en Attente</CardTitle>
              <CardDescription>
                {invitations.length === 0 && !isLoading
                  ? "Aucune demande d'invitation en attente."
                  : `Liste des demandes d'invitation avec le statut "en attente".`}
              </CardDescription>
            </div>
            <Button onClick={fetchPendingInvitations} variant="outline" size="sm" disabled={isLoading && !Object.values(actionLoading).some(Boolean) }>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading && !Object.values(actionLoading).some(Boolean) ? 'animate-spin' : ''}`} />
                Actualiser
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Display non-critical error here if data is already shown */}
          {error && invitations.length > 0 && <p className="text-destructive mb-4 text-sm">Erreur lors de la dernière actualisation: {error}</p>}
          
          {invitations.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>E-mail du demandeur</TableHead>
                    <TableHead>Date de la demande</TableHead>
                    <TableHead className="text-center">Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAction('approve', invite.id)}
                          disabled={actionLoading[invite.id] || (isLoading && !Object.values(actionLoading).some(Boolean))}
                          className="text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
                        >
                          {actionLoading[invite.id] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                          Approuver
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAction('reject', invite.id)}
                          disabled={actionLoading[invite.id] || (isLoading && !Object.values(actionLoading).some(Boolean))}
                          className="text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          {actionLoading[invite.id] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                          Rejeter
                        </Button>
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

    