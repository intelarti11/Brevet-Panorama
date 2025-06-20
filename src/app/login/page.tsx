
"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { Mail, LockKeyhole, Loader2, Eye, EyeOff, User } from 'lucide-react';
import { getAuth, signInWithEmailAndPassword, type AuthError } from 'firebase/auth';
import { app } from '@/lib/firebase';

const ADMIN_USERNAME = "adminbrevet";
const ADMIN_EMAIL_FOR_LOGIN = "florent.romero@ac-montpellier.fr";

const formSchema = z.object({
  usernameOrEmail: z.string()
    .min(1, { message: "Le nom d'utilisateur ou l'e-mail est requis." }),
  password: z.string().min(1, { message: "Le mot de passe est requis." }),
});

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const auth = getAuth(app);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      usernameOrEmail: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      let emailToUse = values.usernameOrEmail;

      if (values.usernameOrEmail.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
        emailToUse = ADMIN_EMAIL_FOR_LOGIN;
      }

      await signInWithEmailAndPassword(auth, emailToUse, values.password);
      toast({
        title: "Connexion réussie",
        description: "Bienvenue !",
      });
      router.push('/dashboard/panorama');
    } catch (error: unknown) {
      const authError = error as AuthError;
      console.error("Erreur de connexion Firebase:", authError.code, authError.message);
      let description = "Nom d'utilisateur/e-mail ou mot de passe incorrect.";
      
      if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
        description = "Identifiants incorrects. Veuillez vérifier votre identifiant et mot de passe.";
      } else if (authError.code === 'auth/invalid-email') {
        description = "Le format de l'identifiant fourni est invalide pour la connexion par e-mail, ou l'utilisateur mappé n'existe pas.";
      } else if (authError.code === 'auth/too-many-requests') {
        description = "Trop de tentatives de connexion. Veuillez réessayer plus tard.";
      }
      toast({
        variant: "destructive",
        title: "Échec de la connexion",
        description: description,
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
          <CardTitle className="font-headline text-2xl">Connectez-vous à Brevet Panorama</CardTitle>
          <CardDescription>Entrez vos identifiants de connexion.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="usernameOrEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom d'utilisateur ou e-mail</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                        <Input type="text" placeholder="Identifiant ou prenom.nom@exemple.com" {...field} className="pl-10" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mot de passe</FormLabel>
                    <FormControl>
                       <div className="relative">
                        <LockKeyhole className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Entrez votre mot de passe"
                          {...field}
                          className="pl-10 pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          <span className="sr-only">{showPassword ? "Cacher le mot de passe" : "Afficher le mot de passe"}</span>
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Connexion en cours...' : 'Se connecter'}
              </Button>
            </form>
          </Form>
          <div className="mt-6 space-y-2 text-center text-sm">
            <p>
              <Link href="/request-invitation" className="font-medium text-primary hover:underline">
                Demander une invitation
              </Link>
            </p>
            <p>
              <Link href="/forgot-password" className="font-medium text-primary hover:underline">
                Mot de passe oublié ?
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
