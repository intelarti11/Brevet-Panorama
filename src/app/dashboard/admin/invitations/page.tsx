
"use client";

import type { ReactNode } from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, RefreshCw, CheckCircle, XCircle, Send, BellRing } from 'lucide-react';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { app } from '@/lib/firebase';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface InvitationRequest {
  id: string;
  email: string;
  requestedAt: string; // ISO string date
  status: 'pending' | 'approved' | 'rejected';
  notifiedAt?: string; // ISO string date, if notification was sent/marked
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
  const callMarkInvitationAsNotified = useMemo(() => 
    httpsCallable<{ invitationId: string }, CloudFunctionResponse>(functionsInstance, 'markInvitationAsNotified'),
    [functionsInstance]
  );

  const fetchPendingInvitations = useCallback(async (showLoadingIndicator = true) => {
    if (showLoadingIndicator) setIsLoading(true);
    // Keep previous error if not a full reload, or clear it
    if (showLoadingIndicator) setError(null); 
    try {
      const result: HttpsCallableResult<CloudFunctionResponse> = await callListPendingInvitations();
      if (result.data.success && result.data.invitations) {
        setInvitations(result.data.invitations);
        if (!showLoadingIndicator && error) setError(null); // Clear residual error on successful background refresh
      } else {
        throw new Error(result.data.message || "Erreur lors de la récupération des invitations.");
      }
    } catch (err: any) {
      console.error("Erreur fetchPendingInvitations:", err);
      const errorMessage = err.message || "Impossible de charger les invitations.";
      setError(errorMessage);
      if (showLoadingIndicator || errorMessage !== error) { // Show toast on initial load error or if error message changes
        toast({ variant: "destructive", title: "Erreur de chargement", description: errorMessage, duration: 7000 });
      }
    } finally {
      if (showLoadingIndicator) setIsLoading(false);
    }
  }, [toast, callListPendingInvitations, error]); // error in dep array to avoid toast spam on background refresh

  useEffect(() => {
    fetchPendingInvitations();
  }, [fetchPendingInvitations]);

  const handleAction = async (action: 'approve' | 'reject' | 'notify', invitationId: string, userEmail?: string) => {
    setActionLoading(prev => ({ ...prev, [`${action}-${invitationId}`]: true }));
    try {
      let result: HttpsCallableResult<CloudFunctionResponse>;
      let actionVerbForToast = "";

      if (action === 'approve') {
        result = await callApproveInvitation({ invitationId });
        actionVerbForToast = "Approbation";
      } else if (action === 'reject') {
        result = await callRejectInvitation({ invitationId }); // No reason passed for now
        actionVerbForToast = "Rejet";
      } else if (action === 'notify') {
        result = await callMarkInvitationAsNotified({ invitationId });
        actionVerbForToast = "Notification marquée";
      } else {
        // Should not happen
        throw new Error("Action inconnue.");
      }

      if (result.data.success) {
        let toastDescription = result.data.message;
        if (action === 'notify' && userEmail) {
            toastDescription = `L'invitation pour ${userEmail} a été marquée comme 'notifiée'. N'oubliez pas de lui envoyer les instructions.`;
        }
        toast({ title: "Succès", description: toastDescription, duration: action === 'notify' ? 7000 : 4000 });
        fetchPendingInvitations(false); // Refresh list without full loading indicator
      } else {
        throw new Error(result.data.message || `Échec de l'action : ${actionVerbForToast}`);
      }
    } catch (err: any) {
      console.error(`Erreur ${action}Invitation:`, err);
      let description = "Une erreur est survenue.";
      if (err.message) {
        description = err.message.toLowerCase().includes("internal") || err.message.toLowerCase().includes("interna")
          ? "Une erreur interne est survenue sur le serveur. Veuillez consulter les logs de la fonction."
          : err.message;
      }
      toast({ variant: "destructive", title: "Erreur d'Action", description: description, duration: 7000 });
    } finally {
      setActionLoading(prev => ({ ...prev, [`${action}-${invitationId}`]: false }));
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

  if (error && invitations.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-4 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-destructive mb-2">Erreur de chargement</h2>
        <p className="text-muted-foreground max-w-md mb-4">{error}</p>
        <Button onClick={() => fetchPendingInvitations(true)} variant="outline" disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Réessayer
        </Button>
      </div>
    );
  }

  const getStatusBadge = (invite: InvitationRequest): ReactNode => {
    if (invite.status === 'approved') {
      if (invite.notifiedAt) {
        return <Badge variant="success" className="bg-blue-500 hover:bg-blue-600">Approuvé (Notifié)</Badge>;
      }
      return <Badge variant="success">Approuvé</Badge>;
    }
    if (invite.status === 'pending') {
      return <Badge variant="warning">En attente</Badge>;
    }
    if (invite.status === 'rejected') {
      return <Badge variant="destructive">Rejeté</Badge>;
    }
    return <Badge variant="secondary">{invite.status}</Badge>;
  };


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
              <CardTitle className="text-xl">Demandes d'Invitation</CardTitle>
              <CardDescription>
                {invitations.length === 0 && !isLoading
                  ? "Aucune demande d'invitation."
                  : `Liste des demandes d'invitation.`}
              </CardDescription>
            </div>
            <Button onClick={() => fetchPendingInvitations(true)} variant="outline" size="sm" disabled={isLoading && !Object.values(actionLoading).some(Boolean) }>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading && !Object.values(actionLoading).some(Boolean) ? 'animate-spin' : ''}`} />
                Actualiser
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
                        {invite.notifiedAt && (
                            <div className="text-xs text-muted-foreground">
                                Notifié le: {format(new Date(invite.notifiedAt), "dd/MM/yy HH:mm", { locale: fr })}
                            </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(invite)}
                      </TableCell>
                      <TableCell className="text-right space-x-1 sm:space-x-2">
                        {invite.status === 'pending' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAction('approve', invite.id)}
                              disabled={actionLoading[`approve-${invite.id}`] || (isLoading && !Object.values(actionLoading).some(Boolean))}
                              className="text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700 px-2 sm:px-3"
                            >
                              {actionLoading[`approve-${invite.id}`] ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <CheckCircle className="h-4 w-4 sm:mr-2" />}
                              <span className="hidden sm:inline">Approuver</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAction('reject', invite.id)}
                              disabled={actionLoading[`reject-${invite.id}`] || (isLoading && !Object.values(actionLoading).some(Boolean))}
                              className="text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700 px-2 sm:px-3"
                            >
                              {actionLoading[`reject-${invite.id}`] ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <XCircle className="h-4 w-4 sm:mr-2" />}
                              <span className="hidden sm:inline">Rejeter</span>
                            </Button>
                          </>
                        )}
                        {invite.status === 'approved' && !invite.notifiedAt && (
                           <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAction('notify', invite.id, invite.email)}
                            disabled={actionLoading[`notify-${invite.id}`] || (isLoading && !Object.values(actionLoading).some(Boolean))}
                            className="text-blue-600 border-blue-600 hover:bg-blue-50 hover:text-blue-700 px-2 sm:px-3"
                          >
                            {actionLoading[`notify-${invite.id}`] ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <Send className="h-4 w-4 sm:mr-2" />}
                            <span className="hidden sm:inline">Prévenir</span>
                          </Button>
                        )}
                         {invite.status === 'approved' && invite.notifiedAt && (
                           <Button
                            variant="ghost"
                            size="sm"
                            disabled={true}
                            className="text-muted-foreground px-2 sm:px-3 cursor-default"
                          >
                            <BellRing className="h-4 w-4 sm:mr-2 text-blue-500" />
                            <span className="hidden sm:inline">Notifié</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            !isLoading && <p className="text-muted-foreground text-center py-8">Aucune demande d'invitation pour le moment.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
    
