
"use client";

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import Logo from '@/components/logo';
import { Mail, Loader2, ArrowLeft, CheckCircle, XCircle, Info } from 'lucide-react';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { app } from '@/lib/firebase';
import { RequestStatusModal } from '@/components/request-status-modal';

const emailRegex = /^[a-zA-Z0-9]+\.[a-zA-Z0-9]+@ac-montpellier\.fr$/;

const formSchema = z.object({
  email: z.string()
    .min(1, { message: "L'adresse e-mail est requise." })
    .regex(emailRegex, { message: "L'adresse e-mail doit être au format prénom.nom@ac-montpellier.fr" }),
});

interface RequestInvitationResponse {
    success: boolean;
    message: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function RequestInvitationPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const functions = getFunctions(app, 'europe-west1');

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [statusLogs, setStatusLogs] = useState<ReactNode[]>([]);
  const [isProcessingStatus, setIsProcessingStatus] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  const addLog = (message: string, iconType?: 'info' | 'success' | 'error') => {
    let IconComponent;
    let iconColorClass = "text-blue-500"; // Default for info

    if (iconType === 'success') {
      IconComponent = CheckCircle;
      iconColorClass = "text-green-500";
    } else if (iconType === 'error') {
      IconComponent = XCircle;
      iconColorClass = "text-red-500";
    } else {
      IconComponent = Info;
    }

    setStatusLogs(prev => [...prev, (
      <div className="flex items-start">
        <IconComponent className={`mr-2 h-4 w-4 flex-shrink-0 ${iconColorClass} mt-0.5`} />
        <span>{message}</span>
      </div>
    )]);
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true); // For the main button
    setIsProcessingStatus(true); // For the modal
    setStatusLogs([]); // Clear previous logs
    setIsStatusModalOpen(true);

    addLog(`Début du processus de demande pour ${values.email}.`, 'info');
    await delay(500);

    addLog("Validation de l'adresse e-mail...", 'info');
    await delay(500);
    // Zod handles actual validation, this is just for show
    addLog(`Adresse e-mail ${values.email} validée.`, 'success');
    await delay(500);

    addLog("Préparation de l'appel à la fonction Firebase 'requestInvitation'...", 'info');
    const callRequestInvitation = httpsCallable<{email: string }, RequestInvitationResponse >(functions, 'requestInvitation');
    await delay(700);
    
    addLog(`Appel de la fonction avec l'email: ${values.email}...`, 'info');

    try {
      const result: HttpsCallableResult<RequestInvitationResponse> = await callRequestInvitation({ email: values.email });
      await delay(500);
      
      if (result.data.success) {
        addLog(`Succès: ${result.data.message}`, 'success');
        toast({
          title: "Demande d'invitation envoyée",
          description: result.data.message,
        });
        form.reset();
      } else {
        addLog(`Erreur de la fonction: ${result.data.message || "Une erreur métier est survenue."}`, 'error');
        throw new Error(result.data.message || "Une erreur métier est survenue lors de la demande.");
      }
    } catch (error: any) {
      await delay(300);
      console.error("Erreur lors de la demande d'invitation:", error);
      let errorMessage = "Une erreur technique est survenue lors de l'envoi de votre demande.";
      
      if (error.code && error.message) { // Firebase HttpsError
          errorMessage = `Erreur Firebase (${error.code}): ${error.message}`;
      } else if (error.message) { // Standard Error
          errorMessage = error.message;
      }
      
      addLog(`Échec: ${errorMessage}`, 'error');
      toast({
        variant: "destructive",
        title: "Échec de la demande",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
      setIsProcessingStatus(false);
       addLog("Processus terminé.", 'info');
    }
  }

  return (
    <>
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="items-center text-center">
            <Logo className="mb-4" />
            <CardTitle className="font-headline text-2xl">Demander une Invitation</CardTitle>
            <CardDescription>Entrez votre adresse e-mail académique pour demander l'accès.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adresse e-mail académique</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                          <Input type="email" placeholder="prénom.nom@ac-montpellier.fr" {...field} className="pl-10" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? 'Envoi en cours...' : 'Envoyer la demande'}
                </Button>
              </form>
            </Form>
            <div className="mt-6 text-center">
              <Link href="/login" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Retour à la connexion
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
      <RequestStatusModal
        isOpen={isStatusModalOpen}
        onOpenChange={setIsStatusModalOpen}
        logMessages={statusLogs}
        isProcessing={isProcessingStatus}
        title="Journal de la demande d'invitation"
        description="Suivi des étapes de votre demande en cours..."
      />
    </>
  );
}
