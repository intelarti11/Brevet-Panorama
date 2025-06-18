
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ProcessedStudentData } from "@/contexts/FilterContext";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface StudentDetailModalProps {
  student: ProcessedStudentData | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const DetailItem = ({ label, value, isBadge = false, badgeVariant }: { 
    label: string; 
    value?: string | number | null;
    isBadge?: boolean;
    badgeVariant?: "default" | "secondary" | "destructive" | "outline";
 }) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  return (
    <div className="grid grid-cols-3 gap-2 py-2.5 items-start border-b border-muted/30 last:border-b-0">
      <p className="text-sm font-medium text-muted-foreground col-span-1 break-words">{label}:</p>
      {isBadge ? (
        <div className="col-span-2">
             <Badge variant={badgeVariant} className="text-xs px-2 py-0.5">
                {String(value)}
            </Badge>
        </div>
      ) : (
         <p className="text-sm text-foreground col-span-2 break-words">{String(value)}</p>
      )}
    </div>
  );
};

export function StudentDetailModal({ student, isOpen, onOpenChange }: StudentDetailModalProps) {
  if (!student) {
    return null;
  }

  const getBadgeVariant = (resultat?: string): "default" | "secondary" | "destructive" | "outline" => {
    if (!resultat) return "secondary";
    const lowerResultat = resultat.toLowerCase();
    if (lowerResultat.includes('refusé')) return "destructive";
    if (lowerResultat.includes('admis')) return "default";
    return "secondary";
  };

  const formatScore = (score?: number) => {
    return score !== undefined && score !== null ? score.toFixed(1) + " / 20" : undefined;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl font-semibold text-primary">
            Détails de l'Élève
          </DialogTitle>
          <DialogDescription>
            Informations complètes pour {student.prenom} {student.nom}.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-grow overflow-y-auto px-6">
          <div className="space-y-1 py-4">
            <h3 className="text-base font-semibold text-foreground mb-2 pt-2">Informations Personnelles</h3>
            <DetailItem label="Nom Complet" value={`${student.prenom} ${student.nom}`} />
            <DetailItem label="N° INE" value={student.id} />
            
            <h3 className="text-base font-semibold text-foreground mb-2 pt-4">Parcours Scolaire</h3>
            <DetailItem label="Établissement" value={student.etablissement} />
            <DetailItem label="Année Scolaire" value={student.academicYear || 'N/A'} />
            <DetailItem label="Série" value={student.serieType || 'N/A'} />

            <h3 className="text-base font-semibold text-foreground mb-2 pt-4">Résultats au Brevet</h3>
            <DetailItem 
                label="Résultat" 
                value={student.resultat || 'N/A'}
                isBadge
                badgeVariant={getBadgeVariant(student.resultat)}
            />
            <DetailItem label="Moyenne Générale" value={student.moyenne !== undefined && student.moyenne !== null ? student.moyenne.toFixed(2) + " / 20" : "N/A"} />
            
            {(student.scoreFrancais !== undefined || student.scoreMaths !== undefined || student.scoreHistoireGeo !== undefined || student.scoreSciences !== undefined) && (
                 <h3 className="text-base font-semibold text-foreground mb-2 pt-4">Scores par Matière</h3>
            )}
            <DetailItem label="Français" value={formatScore(student.scoreFrancais)} />
            <DetailItem label="Mathématiques" value={formatScore(student.scoreMaths)} />
            <DetailItem label="Histoire-Géo." value={formatScore(student.scoreHistoireGeo)} />
            <DetailItem label="Sciences" value={formatScore(student.scoreSciences)} />

             {student.anneeOriginale && student.anneeOriginale !== student.academicYear && student.anneeOriginale.trim() !== "" && (
                <>
                    <h3 className="text-base font-semibold text-foreground mb-2 pt-4">Information Originale</h3>
                    <DetailItem label="Champ 'Série' (Fichier)" value={student.anneeOriginale} />
                </>
             )}
          </div>
        </ScrollArea>

        <DialogFooter className="mt-auto px-6 py-4 border-t bg-muted/30">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Fermer
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
