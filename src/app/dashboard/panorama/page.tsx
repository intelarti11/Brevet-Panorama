
"use client";

import type { ChangeEvent } from 'react';
import { useState, useEffect, useMemo } from 'react';
import { getFirestore, collection, getDocs, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { app, db } from '@/lib/firebase'; 
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, AlertTriangle, Users, Percent, Award, PieChart as PieChartIcon, BarChart2 } from 'lucide-react';
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent,
} from "@/components/ui/chart"
import { 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  ResponsiveContainer,
  LabelList
} from 'recharts';

interface DisplayStudentData {
  id: string;
  nom: string;
  prenom: string;
  etablissement: string;
  annee: string; 
  resultat: string;
  moyenne?: number;
}

const ALL_YEARS_VALUE = "__ALL_YEARS__";
const ALL_ESTABLISHMENTS_VALUE = "__ALL_ESTABLISHMENTS__";

interface Stats {
  totalStudents: number;
  admis: number;
  refuse: number;
  successRate: number;
  mentions: {
    tresBien: number;
    bien: number;
    assezBien: number;
    sansMention: number;
  };
  mentionPercentages: {
    tresBien: number;
    bien: number;
    assezBien: number;
    sansMention: number;
  };
}

const initialStats: Stats = {
  totalStudents: 0,
  admis: 0,
  refuse: 0,
  successRate: 0,
  mentions: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 0 },
  mentionPercentages: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 0 },
};

const CHART_COLORS = {
  admis: "hsl(var(--chart-2))", 
  refuse: "hsl(var(--destructive))", 
  tresBien: "hsl(var(--chart-1))", 
  bien: "hsl(var(--chart-3))", 
  assezBien: "hsl(var(--chart-4))", 
  sansMention: "hsl(var(--chart-5))", 
};

const normalizeForComparison = (text: string): string => {
  if (text === null || text === undefined) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

export default function PanoramaPage() {
  const [allStudentsData, setAllStudentsData] = useState<DisplayStudentData[]>([]);
  const [filteredStudentsData, setFilteredStudentsData] = useState<DisplayStudentData[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>(ALL_YEARS_VALUE);
  const [selectedEstablishment, setSelectedEstablishment] = useState<string>(ALL_ESTABLISHMENTS_VALUE);
  
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [availableEstablishments, setAvailableEstablishments] = useState<string[]>([]);

  const [stats, setStats] = useState<Stats>(initialStats);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!db) {
        setError("La base de données Firestore n'est pas initialisée.");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const studentCollectionRef = collection(db, 'brevetResults');
        const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(studentCollectionRef);
        
        const students: DisplayStudentData[] = [];
        const years = new Set<string>();
        const establishments = new Set<string>();

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          students.push({
            id: doc.id, 
            nom: data.nomCandidat || 'N/A',
            prenom: data.prenomsCandidat || 'N/A',
            etablissement: data.libelleEtablissement || 'N/A',
            annee: data.serie || 'N/A', 
            resultat: data.resultat || 'N/A',
            moyenne: data.totalPourcentage !== undefined && data.totalPourcentage !== null ? Number(data.totalPourcentage) : undefined,
          });
          if (data.serie) years.add(data.serie);
          if (data.libelleEtablissement) establishments.add(data.libelleEtablissement);
        });

        setAllStudentsData(students);
        setAvailableYears(Array.from(years).sort());
        setAvailableEstablishments(Array.from(establishments).sort());

      } catch (err: any) {
        console.error("Erreur de récupération des données Firestore:", err);
        setError(`Impossible de charger les données: ${err.message}.`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    let data = [...allStudentsData]; 
    if (selectedYear !== ALL_YEARS_VALUE) {
      data = data.filter(student => student.annee === selectedYear);
    }
    if (selectedEstablishment !== ALL_ESTABLISHMENTS_VALUE) {
      data = data.filter(student => student.etablissement === selectedEstablishment);
    }
    setFilteredStudentsData(data);
  }, [selectedYear, selectedEstablishment, allStudentsData]);

  useEffect(() => {
    if (isLoading || (filteredStudentsData.length === 0 && allStudentsData.length > 0 && selectedYear === ALL_YEARS_VALUE && selectedEstablishment === ALL_ESTABLISHMENTS_VALUE && !error)) {
       if (isLoading) {
           setStats(initialStats); 
           return;
       }
    }
    
    if (filteredStudentsData.length === 0 && !isLoading) {
      setStats(initialStats);
      return;
    }

    const newStats: Stats = { 
      totalStudents: 0,
      admis: 0,
      refuse: 0,
      successRate: 0,
      mentions: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 0 },
      mentionPercentages: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 0 },
    };
    newStats.totalStudents = filteredStudentsData.length;

    const normalizedAdmisStr = normalizeForComparison('admis');
    const normalizedRefuseStr = normalizeForComparison('refusé');
    const normalizedTresBienStr = normalizeForComparison('très bien');
    const normalizedBienStr = normalizeForComparison('bien');
    const normalizedAssezBienStr = normalizeForComparison('assez bien');

    filteredStudentsData.forEach(student => {
      const normalizedResultat = normalizeForComparison(student.resultat);
      
      if (normalizedResultat.includes(normalizedAdmisStr)) {
        newStats.admis++;
        if (normalizedResultat.includes(normalizedTresBienStr)) {
          newStats.mentions.tresBien++;
        } else if (normalizedResultat.includes(normalizedAssezBienStr)) { // Check for "Assez Bien" before "Bien"
          newStats.mentions.assezBien++;
        } else if (normalizedResultat.includes(normalizedBienStr)) {
          newStats.mentions.bien++;
        } else {
          newStats.mentions.sansMention++;
        }
      } else if (normalizedResultat.includes(normalizedRefuseStr)) {
        newStats.refuse++;
      }
    });

    if (newStats.totalStudents > 0 && (newStats.admis + newStats.refuse) > 0) {
      const consideredForRate = newStats.admis + newStats.refuse;
      if (consideredForRate > 0) {
        newStats.successRate = parseFloat(((newStats.admis / consideredForRate) * 100).toFixed(1));
      } else {
        newStats.successRate = 0;
      }
    } else {
         newStats.successRate = 0;
    }

    if (newStats.admis > 0) {
      newStats.mentionPercentages.tresBien = parseFloat(((newStats.mentions.tresBien / newStats.admis) * 100).toFixed(1));
      newStats.mentionPercentages.bien = parseFloat(((newStats.mentions.bien / newStats.admis) * 100).toFixed(1));
      newStats.mentionPercentages.assezBien = parseFloat(((newStats.mentions.assezBien / newStats.admis) * 100).toFixed(1));
      newStats.mentionPercentages.sansMention = parseFloat(((newStats.mentions.sansMention / newStats.admis) * 100).toFixed(1));
    }
    setStats(newStats);
  }, [filteredStudentsData, isLoading, allStudentsData.length, error, selectedYear, selectedEstablishment]);

  const resultsChartData = useMemo(() => [
    { name: 'Admis', value: stats.admis, fill: CHART_COLORS.admis },
    { name: 'Refusé', value: stats.refuse, fill: CHART_COLORS.refuse },
  ].filter(item => item.value > 0), [stats.admis, stats.refuse]);

  const mentionsChartData = useMemo(() => [
    { name: 'TB', value: stats.mentions.tresBien, fill: CHART_COLORS.tresBien, percentage: stats.mentionPercentages.tresBien },
    { name: 'B', value: stats.mentions.bien, fill: CHART_COLORS.bien, percentage: stats.mentionPercentages.bien },
    { name: 'AB', value: stats.mentions.assezBien, fill: CHART_COLORS.assezBien, percentage: stats.mentionPercentages.assezBien },
    { name: 'SM', value: stats.mentions.sansMention, fill: CHART_COLORS.sansMention, percentage: stats.mentionPercentages.sansMention },
  ].filter(item => item.value > 0), [stats.mentions, stats.mentionPercentages]);


  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-1 md:p-4">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Chargement du panorama...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-1 md:p-4 text-center">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-destructive mb-2">Erreur de chargement</h2>
        <p className="text-muted-foreground max-w-md">{error}</p>
      </div>
    );
  }
  
  const noDataForFilters = filteredStudentsData.length === 0 && allStudentsData.length > 0 && !isLoading;

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Panorama des Résultats</h1>
        <p className="text-muted-foreground mt-1">
          Visualisez les statistiques clés et les répartitions des résultats au brevet.
        </p>
      </header>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl">Filtres</CardTitle>
          <CardDescription>Affinez les données affichées dans le panorama.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="year-filter" className="block text-sm font-medium text-foreground">Série / Année</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger id="year-filter" className="w-full">
                  <SelectValue placeholder="Sélectionner une série/année" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_YEARS_VALUE}>Toutes les séries/années</SelectItem>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="establishment-filter" className="block text-sm font-medium text-foreground">Établissement</label>
              <Select value={selectedEstablishment} onValueChange={setSelectedEstablishment}>
                <SelectTrigger id="establishment-filter" className="w-full">
                  <SelectValue placeholder="Sélectionner un établissement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ESTABLISHMENTS_VALUE}>Tous les établissements</SelectItem>
                  {availableEstablishments.map(est => (
                    <SelectItem key={est} value={est}>{est}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {noDataForFilters ? (
         <Card className="shadow-lg rounded-lg">
            <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground">Aucune donnée pour les filtres sélectionnés</p>
                    <p className="text-sm text-muted-foreground">Veuillez ajuster vos filtres ou vérifier si des données ont été importées.</p>
                </div>
            </CardContent>
         </Card>
      ) : allStudentsData.length === 0 && !isLoading ? (
        <Card className="shadow-lg rounded-lg">
            <CardContent className="pt-6">
                 <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground">Aucune donnée élève importée</p>
                    <p className="text-sm text-muted-foreground">Veuillez importer des données via la page "Import" pour afficher le panorama.</p>
                </div>
            </CardContent>
        </Card>
      ) : (
      <>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="shadow-md rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Nombre d'Élèves</CardTitle>
              <Users className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalStudents}</div>
              <p className="text-xs text-muted-foreground">total des élèves pour la sélection</p>
            </CardContent>
          </Card>
          <Card className="shadow-md rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taux de Réussite</CardTitle>
              <Percent className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.successRate}%</div>
              <p className="text-xs text-muted-foreground">{stats.admis} admis sur {stats.admis + stats.refuse > 0 ? stats.admis + stats.refuse : stats.totalStudents} élèves considérés</p>
            </CardContent>
          </Card>
          <Card className="shadow-md rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Mentions (parmi admis)</CardTitle>
              <Award className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                TB: {stats.mentions.tresBien} <span className="text-xs text-muted-foreground">({stats.admis > 0 ? stats.mentionPercentages.tresBien : 0}%)</span>
              </div>
               <div className="text-md">
                AB: {stats.mentions.assezBien} <span className="text-xs text-muted-foreground">({stats.admis > 0 ? stats.mentionPercentages.assezBien : 0}%)</span>
              </div>
              <div className="text-md">
                B: {stats.mentions.bien} <span className="text-xs text-muted-foreground">({stats.admis > 0 ? stats.mentionPercentages.bien : 0}%)</span>
              </div>
               <div className="text-md">
                SM: {stats.mentions.sansMention} <span className="text-xs text-muted-foreground">({stats.admis > 0 ? stats.mentionPercentages.sansMention : 0}%)</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
          <Card className="shadow-lg rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center">
                <PieChartIcon className="mr-2 h-5 w-5 text-primary" />
                Répartition des Résultats
              </CardTitle>
              <CardDescription>Distribution des élèves admis et refusés.</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.admis + stats.refuse > 0 ? (
                <ChartContainer config={{}} className="mx-auto aspect-square max-h-[300px]">
                  <PieChart>
                    <ChartTooltip 
                        content={<ChartTooltipContent 
                            hideLabel 
                            formatter={(value, name, props) => (
                                <div className="flex flex-col">
                                    <span className="font-semibold capitalize">{props.payload?.name}</span>
                                    <span>Nombre: {value}</span>
                                </div>
                            )}
                        />} 
                    />
                    <Pie data={resultsChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} 
                         label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name, value }) => {
                            const RADIAN = Math.PI / 180;
                            const effectiveOuterRadius = Math.max(0, outerRadius);
                            const effectiveInnerRadius = Math.max(0, innerRadius);
                            const radius = effectiveInnerRadius + (effectiveOuterRadius - effectiveInnerRadius) * 0.5;
                            const x = cx + radius * Math.cos(-midAngle * RADIAN);
                            const y = cy + radius * Math.sin(-midAngle * RADIAN);
                            return (
                                <text x={x} y={y} fill="hsl(var(--foreground))" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="12px" fontWeight="medium">
                                {`${name} (${value})`}
                                </text>
                            );
                        }}
                    >
                      {resultsChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              ) : (
                <p className="text-center text-muted-foreground py-10">Pas de données (admis/refusés) à afficher pour ce graphique.</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart2 className="mr-2 h-5 w-5 text-primary" />
                Répartition des Mentions (Admis)
              </CardTitle>
              <CardDescription>Distribution des mentions pour les élèves admis.</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.admis > 0 && mentionsChartData.length > 0 ? (
                <ChartContainer config={{}} className="w-full h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mentionsChartData} layout="vertical" margin={{left:10, right:30, top: 5, bottom: 5}}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" dataKey="value" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={50} tickLine={false} axisLine={false} />
                      <ChartTooltip 
                          cursor={false}
                          content={
                              <ChartTooltipContent 
                                  formatter={(value, name, props) => (
                                      <div className="flex flex-col p-1">
                                          <span className="font-semibold">{props.payload.name === "SM" ? "Sans Mention" : (props.payload.name === "TB" ? "Très Bien" : (props.payload.name === "AB" ? "Assez Bien" : "Bien" ))}</span>
                                          <span>Effectif: {value}</span>
                                          <span>{props.payload.percentage}% des admis</span>
                                      </div>
                                  )}
                              />
                          } 
                      />
                      <Bar dataKey="value" radius={4}>
                         {mentionsChartData.map((entry, index) => (
                          <Cell key={`cell-mention-${index}`} fill={entry.fill} />
                        ))}
                         <LabelList dataKey="value" position="right" offset={8} className="fill-foreground" fontSize={12} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <p className="text-center text-muted-foreground py-10">Pas d'élèves admis avec mention à afficher.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </>
      )}
    </div>
  );
}

