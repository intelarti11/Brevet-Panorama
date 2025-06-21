
"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export default function VoirNotesPage() {
  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Consulter les Notes du Brevet Blanc</h1>
        <p className="text-muted-foreground mt-1">
          Visualisez les notes et les statistiques du brevet blanc.
        </p>
      </header>
      <Card className="shadow-lg rounded-lg text-center">
        <CardHeader>
            <CardTitle className="flex justify-center items-center text-xl">
                <Construction className="mr-2 h-6 w-6 text-primary"/>
                Page en Construction
            </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
            <p className="text-muted-foreground">
                Cette fonctionnalité est en cours de développement et sera disponible prochainement.
            </p>
        </CardContent>
      </Card>
    </div>
  );
}
