
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
import { useToast } from '@/hooks/use-toast';
import Logo from '@/components/logo';
import { Mail, Loader2, ArrowLeft } from 'lucide-react';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { app } from '@/lib/firebase'; // Assurez-vous que app est exporté depuis firebase.ts

const formSchema = z.object({
  email: z.string()
    .min(1, { message: "L'adresse e-mail est requise." })
    .email({ message: "Veuillez entrer une adresse e-mail valide." }),
});

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const auth = getAuth(app); // Obtenir l'instance Auth

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, values.email);
      toast({
        title: "Vérifiez vos e-mails",
        description: `Si un compte est associé à ${values.email}, un lien de réinitialisation de mot de passe a été envoyé.`,
      });
      form.reset();
    } catch (error: any) {
      console.error("Erreur d'envoi de l'e-mail de réinitialisation:", error);
      let errorMessage = "Une erreur est survenue lors de l'envoi de l'e-mail.";
      if (error.code === 'auth/user-not-found') {
        // Ne pas révéler si l'e-mail existe ou non pour des raisons de sécurité,
        // donc afficher le même message générique.
         errorMessage = `Si un compte est associé à ${values.email}, un lien sera envoyé.`;
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "L'adresse e-mail fournie n'est pas valide.";
      }
      // Pour les autres erreurs, on peut afficher un message plus générique
      // ou le message d'erreur de Firebase si jugé approprié pour le débogage.
      // Pour l'utilisateur, le message générique est souvent préférable.
      toast({
        variant: "destructive",
        title: "Échec de l'envoi",
        description: error.code === 'auth/user-not-found' ? errorMessage : "Impossible d'envoyer l'e-mail de réinitialisation pour le moment.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="items-center text-center">
          <Logo className="mb-4" />
          <CardTitle className="font-headline text-2xl">Mot de Passe Oublié ?</CardTitle>
          <CardDescription>Entrez votre adresse e-mail pour recevoir un lien de réinitialisation.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adresse e-mail</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                        <Input type="email" placeholder="Entrez votre adresse e-mail" {...field} className="pl-10" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
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
  );
}
