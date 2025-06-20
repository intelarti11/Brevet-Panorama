
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

// Permet n'importe quel email pour la réinitialisation, au cas où.
// Si vous voulez forcer le format @ac-montpellier.fr ici aussi, utilisez:
// const emailRegex = /^[a-zA-Z0-9]+\.[a-zA-Z0-9]+@ac-montpellier\.fr$/;
const formSchema = z.object({
  email: z.string()
    .min(1, { message: "L'adresse e-mail est requise." })
    .email({ message: "Veuillez entrer une adresse e-mail valide." }),
});

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    // SIMULATION: En production, vous contacteriez votre backend
    // pour initier l'envoi d'un e-mail de réinitialisation.
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsLoading(false);

    toast({
      title: "Vérifiez vos e-mails",
      description: `Si un compte est associé à ${values.email}, un lien de réinitialisation de mot de passe a été envoyé.`,
    });
    form.reset();
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
