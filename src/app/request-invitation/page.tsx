
"use client";

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
import Logo from '@/components/logo';
import { Mail, Loader2, ArrowLeft, CheckCircle, AlertTriangle as AlertTriangleIcon } from 'lucide-react';
import { httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

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

export default function RequestInvitationPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: "", message: "", variant: "success" as "success" | "error" });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);

    if (!functions) {
      setModalConfig({ 
          title: "Erreur de configuration", 
          message: "Le service de fonctions Firebase n'est pas disponible.",
          variant: "error"
      });
      setIsLoading(false);
      setIsModalOpen(true);
      return;
    }

    const callRequestInvitation = httpsCallable<{email: string }, RequestInvitationResponse >(functions, 'requestInvitation');
    
    try {
      const result: HttpsCallableResult<RequestInvitationResponse> = await callRequestInvitation({ email: values.email });
      
      if (result.data.success) {
        setModalConfig({ 
            title: "Demande Envoyée", 
            message: result.data.message,
            variant: "success" 
        });
        form.reset();
      } else {
        setModalConfig({ 
            title: "Échec de la Demande", 
            message: result.data.message || "Une erreur est survenue lors de la demande.",
            variant: "error"
        });
      }
    } catch (error: any) {
      console.error("Erreur lors de la demande d'invitation:", error);
      let errorMessage = "Une erreur technique est survenue lors de l'envoi de votre demande.";
      
      if (error.code && error.message) { 
          errorMessage = `Erreur (${error.code}): ${error.message}`;
      } else if (error.message) {
          errorMessage = error.message;
      }
      setModalConfig({ 
          title: "Échec de la Demande", 
          message: errorMessage,
          variant: "error"
      });
    } finally {
      setIsLoading(false);
      setIsModalOpen(true);
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

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={`flex items-center ${modalConfig.variant === 'success' ? 'text-green-600' : 'text-destructive'}`}>
              {modalConfig.variant === 'success' ? 
                <CheckCircle className="mr-2 h-5 w-5" /> : 
                <AlertTriangleIcon className="mr-2 h-5 w-5" />
              }
              {modalConfig.title}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {modalConfig.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Fermer</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
