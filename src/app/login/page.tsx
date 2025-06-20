
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

const formSchema = z.object({
  usernameOrEmail: z.string().min(1, { message: "Le nom d'utilisateur ou l'e-mail est requis." }),
  password: z.string().min(1, { message: "Le mot de passe est requis." }),
});

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      usernameOrEmail: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulation de délai réseau
    setIsLoading(false);

    // Correction ici: mot de passe attendu est "SVeil2025" (sans '!')
    const expectedPassword = "SVeil2025"; 

    const isAdminbrevetLogin = values.usernameOrEmail === "Adminbrevet" && values.password === expectedPassword;
    const isAdminEmailLogin = values.usernameOrEmail.startsWith("admin.") && values.password === expectedPassword;

    if (isAdminbrevetLogin || isAdminEmailLogin) {
      toast({
        title: "Connexion réussie",
        description: "Bienvenue !",
      });
      router.push('/dashboard/panorama');
    } else {
      toast({
        variant: "destructive",
        title: "Échec de la connexion",
        description: "Nom d'utilisateur/e-mail ou mot de passe incorrect.",
      });
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
                        <Input type="text" placeholder="Adminbrevet ou prenom.nom@exemple.com" {...field} className="pl-10" />
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
