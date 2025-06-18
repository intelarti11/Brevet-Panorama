
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, AlertTriangle, Users, Percent, Award, PieChart as PieChartIcon, BarChart2, GraduationCap, BookText, Calculator, Landmark, FlaskConical } from 'lucide-react';
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
import { useFilters, type ProcessedStudentData, ALL_ACADEMIC_YEARS_VALUE, ALL_SERIE_TYPES_VALUE, ALL_ESTABLISHMENTS_VALUE } from '@/contexts/FilterContext';

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
  averageOverallScoreAdmitted?: number;
  averageFrancais?: number;
  countFrancais?: number;
  averageMaths?: number;
  countMaths?: number;
  averageHistoireGeo?: number;
  countHistoireGeo?: number;
  averageSciences?: number;
  countSciences?: number;
}

const initialStats: Stats = {
  totalStudents: 0,
  admis: 0,
  refuse: 0,
  successRate: 0,
  mentions: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 0 },
  mentionPercentages: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 0 },
  averageOverallScoreAdmitted: undefined,
  averageFrancais: undefined,
  countFrancais: 0,
  averageMaths: undefined,
  countMaths: 0,
  averageHistoireGeo: undefined,
  countHistoireGeo: 0,
  averageSciences: undefined,
  countSciences: 0,
};

const CHART_COLORS = {
  admis: "hsl(var(--chart-admis))",
  refuse: "hsl(var(--destructive))",
  tresBien: "hsl(var(--chart-tres-bien))",
  bien: "hsl(var(--chart-bien))",
  assezBien: "hsl(var(--chart-assez-bien))",
  sansMention: "hsl(var(--chart-sans-mention))",
};

const normalizeForComparison = (text: string | undefined): string => {
  if (text === null || text === undefined) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

export default function PanoramaPage() {
  const {
    allProcessedStudents,
    isLoading: isLoadingContext,
    error: errorContext,
    selectedAcademicYear,
    selectedSerieType,
    selectedEstablishment
  } = useFilters();

  const [filteredStudentsData, setFilteredStudentsData] = useState<ProcessedStudentData[]>([]);
  const [stats, setStats] = useState<Stats>(initialStats);

  useEffect(() => {
    let data = [...allProcessedStudents];
    if (selectedAcademicYear && selectedAcademicYear !== ALL_ACADEMIC_YEARS_VALUE) {
      data = data.filter(student => student.academicYear === selectedAcademicYear);
    }
    if (selectedSerieType && selectedSerieType !== ALL_SERIE_TYPES_VALUE) {
      data = data.filter(student => student.serieType === selectedSerieType);
    }
    if (selectedEstablishment && selectedEstablishment !== ALL_ESTABLISHMENTS_VALUE) {
      data = data.filter(student => student.etablissement === selectedEstablishment);
    }
    setFilteredStudentsData(data);
  }, [selectedAcademicYear, selectedSerieType, selectedEstablishment, allProcessedStudents]);

  useEffect(() => {
    if (isLoadingContext || (filteredStudentsData.length === 0 && allProcessedStudents.length > 0 && !errorContext &&
        selectedAcademicYear === ALL_ACADEMIC_YEARS_VALUE &&
        selectedSerieType === ALL_SERIE_TYPES_VALUE &&
        selectedEstablishment === ALL_ESTABLISHMENTS_VALUE)) {
       if (isLoadingContext) {
           setStats(initialStats);
           return;
       }
    }

    if (filteredStudentsData.length === 0 && !isLoadingContext) {
      setStats(initialStats);
      return;
    }

    const newStats: Stats = { ...initialStats, mentions: { ...initialStats.mentions }, mentionPercentages: { ...initialStats.mentionPercentages} };
    newStats.totalStudents = filteredStudentsData.length;

    const normalizedAdmisStr = normalizeForComparison('admis');
    const normalizedRefuseStr = normalizeForComparison('refusé');
    const normalizedTresBienStr = normalizeForComparison('très bien');
    const normalizedAssezBienStr = normalizeForComparison('assez bien');
    const normalizedBienStr = normalizeForComparison('bien');

    let sumOverallScoresAdmitted = 0;
    let countOverallScoresAdmitted = 0;
    let sumFrancais = 0, countFrancais = 0;
    let sumMaths = 0, countMaths = 0;
    let sumHistoireGeo = 0, countHistoireGeo = 0;
    let sumSciences = 0, countSciences = 0;

    filteredStudentsData.forEach(student => {
      const normalizedResultat = normalizeForComparison(student.resultat);

      if (normalizedResultat.includes(normalizedAdmisStr)) {
        newStats.admis++;
        if (student.moyenne !== undefined && student.moyenne !== null) {
          sumOverallScoresAdmitted += student.moyenne;
          countOverallScoresAdmitted++;
        }
        if (normalizedResultat.includes(normalizedTresBienStr)) {
          newStats.mentions.tresBien++;
        } else if (normalizedResultat.includes(normalizedAssezBienStr)) {
          newStats.mentions.assezBien++;
        } else if (normalizedResultat.includes(normalizedBienStr)) {
          newStats.mentions.bien++;
        } else {
          newStats.mentions.sansMention++;
        }
      } else if (normalizedResultat.includes(normalizedRefuseStr)) {
        newStats.refuse++;
      }

      if (student.scoreFrancais !== undefined && student.scoreFrancais !== null) {
        sumFrancais += student.scoreFrancais;
        countFrancais++;
      }
      if (student.scoreMaths !== undefined && student.scoreMaths !== null) {
        sumMaths += student.scoreMaths;
        countMaths++;
      }
      if (student.scoreHistoireGeo !== undefined && student.scoreHistoireGeo !== null) {
        sumHistoireGeo += student.scoreHistoireGeo;
        countHistoireGeo++;
      }
      if (student.scoreSciences !== undefined && student.scoreSciences !== null) {
        sumSciences += student.scoreSciences;
        countSciences++;
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
    } else {
      newStats.mentionPercentages = { tresBien: 0, bien: 0, assezBien: 0, sansMention: 0 };
    }

    newStats.averageOverallScoreAdmitted = countOverallScoresAdmitted > 0 ? parseFloat((sumOverallScoresAdmitted / countOverallScoresAdmitted).toFixed(1)) : undefined;

    newStats.averageFrancais = countFrancais > 0 ? parseFloat((sumFrancais / countFrancais).toFixed(1)) : undefined;
    newStats.countFrancais = countFrancais;
    newStats.averageMaths = countMaths > 0 ? parseFloat((sumMaths / countMaths).toFixed(1)) : undefined;
    newStats.countMaths = countMaths;
    newStats.averageHistoireGeo = countHistoireGeo > 0 ? parseFloat((sumHistoireGeo / countHistoireGeo).toFixed(1)) : undefined;
    newStats.countHistoireGeo = countHistoireGeo;
    newStats.averageSciences = countSciences > 0 ? parseFloat((sumSciences / countSciences).toFixed(1)) : undefined;
    newStats.countSciences = countSciences;

    setStats(newStats);
  }, [filteredStudentsData, isLoadingContext, allProcessedStudents.length, errorContext, selectedAcademicYear, selectedSerieType, selectedEstablishment]);

  const resultsChartData = useMemo(() => [
    { name: 'Admis', value: stats.admis, fill: CHART_COLORS.admis },
    { name: 'Refusé', value: stats.refuse, fill: CHART_COLORS.refuse },
  ].filter(item => item.value > 0), [stats.admis, stats.refuse]);

  const mentionsChartData = useMemo(() => [
    { name: 'Très Bien', value: stats.mentions.tresBien, fill: CHART_COLORS.tresBien, percentage: stats.mentionPercentages.tresBien },
    { name: 'Assez Bien', value: stats.mentions.assezBien, fill: CHART_COLORS.assezBien, percentage: stats.mentionPercentages.assezBien },
    { name: 'Bien', value: stats.mentions.bien, fill: CHART_COLORS.bien, percentage: stats.mentionPercentages.bien },
    { name: 'Sans Mention', value: stats.mentions.sansMention, fill: CHART_COLORS.sansMention, percentage: stats.mentionPercentages.sansMention },
  ].filter(item => item.value > 0), [stats.mentions, stats.mentionPercentages]);


  if (isLoadingContext) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-1 md:p-4">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Chargement du panorama...</p>
      </div>
    );
  }

  if (errorContext) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-1 md:p-4 text-center">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-destructive mb-2">Erreur de chargement</h2>
        <p className="text-muted-foreground max-w-md">{errorContext}</p>
      </div>
    );
  }

  const noDataForFilters = filteredStudentsData.length === 0 && allProcessedStudents.length > 0 && !isLoadingContext;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary tracking-tight">Panorama des Résultats</h1>
        <p className="text-muted-foreground mt-2">
          Visualisez les statistiques clés et les répartitions des résultats au brevet. Utilisez les filtres dans la barre latérale.
        </p>
      </header>

      {noDataForFilters ? (
         <Card className="shadow-md rounded-lg">
            <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground">Aucune donnée pour les filtres sélectionnés</p>
                    <p className="text-sm text-muted-foreground">Veuillez ajuster vos filtres ou vérifier si des données ont été importées.</p>
                </div>
            </CardContent>
         </Card>
      ) : allProcessedStudents.length === 0 && !isLoadingContext ? (
        <Card className="shadow-md rounded-lg">
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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="group shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Nombre d'Élèves</CardTitle>
              <Users className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-4xl font-bold text-primary group-hover:scale-105 transition-transform duration-200 ease-in-out">{stats.totalStudents}</div>
              <p className="text-xs text-muted-foreground mt-1">total des élèves pour la sélection</p>
            </CardContent>
          </Card>
          <Card className="group shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Taux de Réussite</CardTitle>
              <Percent className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-4xl font-bold text-primary group-hover:scale-105 transition-transform duration-200 ease-in-out">{stats.successRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">{stats.admis} admis sur {stats.admis + stats.refuse > 0 ? stats.admis + stats.refuse : stats.totalStudents} élèves considérés</p>
            </CardContent>
          </Card>
          <Card className="group shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Moyenne Générale (Admis)</CardTitle>
              <GraduationCap className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-4xl font-bold text-primary group-hover:scale-105 transition-transform duration-200 ease-in-out">
                {stats.averageOverallScoreAdmitted !== undefined ? `${stats.averageOverallScoreAdmitted.toFixed(1)}/20` : 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">moyenne des élèves admis</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
          <Card className="shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
            <CardHeader className="p-6">
              <CardTitle className="flex items-center text-xl text-primary">
                <PieChartIcon className="mr-2 h-5 w-5 text-primary" />
                Répartition des Résultats
              </CardTitle>
              <CardDescription className="mt-1">Distribution des élèves admis et refusés.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
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
                    <Pie
                        data={resultsChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={60}
                        labelLine={false}
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
                        <Cell key={`cell-${index}`} fill={entry.fill as string} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              ) : (
                <p className="text-center text-muted-foreground py-10">Pas de données (admis/refusés) à afficher pour ce graphique.</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
            <CardHeader className="p-6">
              <CardTitle className="flex items-center text-xl text-primary">
                <BarChart2 className="mr-2 h-5 w-5 text-primary" />
                Répartition des Mentions (Admis)
              </CardTitle>
              <CardDescription className="mt-1">Distribution des mentions pour les élèves admis.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              {stats.admis > 0 && mentionsChartData.length > 0 ? (
                <ChartContainer config={{}} className="w-full h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mentionsChartData} layout="vertical" margin={{left:10, right:30, top: 5, bottom: 5}}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" dataKey="value" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={70} tickLine={false} axisLine={false} />
                      <ChartTooltip
                          cursor={false}
                          content={
                              <ChartTooltipContent
                                  formatter={(value, name, props) => (
                                      <div className="flex flex-col p-1">
                                          <span className="font-semibold">{props.payload.name}</span>
                                          <span>Effectif: {value}</span>
                                          <span>{props.payload.percentage}% des admis</span>
                                      </div>
                                  )}
                              />
                          }
                      />
                      <Bar dataKey="value" radius={4}>
                         {mentionsChartData.map((entry, index) => (
                          <Cell key={`cell-mention-${index}`} fill={entry.fill as string} />
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

        <Card className="shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
            <CardHeader className="p-6">
                <CardTitle className="text-xl text-primary">Moyennes par Matières Principales</CardTitle>
                <CardDescription className="mt-1">Moyenne des notes (/20) pour les élèves de la sélection ayant une note enregistrée.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6 pt-4 md:grid-cols-4 p-6">
                <div className="group flex flex-col items-center text-center p-4 rounded-lg bg-muted/30 transition-all duration-200 ease-in-out hover:bg-muted/50 hover:scale-[1.02]">
                    <BookText className="h-7 w-7 text-primary mb-2 group-hover:scale-110 transition-transform duration-200" />
                    <p className="text-sm font-medium text-foreground">Français</p>
                    <p className="text-2xl font-bold mt-1 text-primary group-hover:text-3xl group-hover:font-extrabold transition-all duration-200">
                        {stats.averageFrancais !== undefined ? stats.averageFrancais.toFixed(1) : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground group-hover:font-semibold group-hover:text-muted-foreground/80 transition-all duration-200">({stats.countFrancais ?? 0} élèves)</p>
                </div>
                <div className="group flex flex-col items-center text-center p-4 rounded-lg bg-muted/30 transition-all duration-200 ease-in-out hover:bg-muted/50 hover:scale-[1.02]">
                    <Calculator className="h-7 w-7 text-primary mb-2 group-hover:scale-110 transition-transform duration-200" />
                    <p className="text-sm font-medium text-foreground">Mathématiques</p>
                    <p className="text-2xl font-bold mt-1 text-primary group-hover:text-3xl group-hover:font-extrabold transition-all duration-200">
                        {stats.averageMaths !== undefined ? stats.averageMaths.toFixed(1) : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground group-hover:font-semibold group-hover:text-muted-foreground/80 transition-all duration-200">({stats.countMaths ?? 0} élèves)</p>
                </div>
                <div className="group flex flex-col items-center text-center p-4 rounded-lg bg-muted/30 transition-all duration-200 ease-in-out hover:bg-muted/50 hover:scale-[1.02]">
                    <Landmark className="h-7 w-7 text-primary mb-2 group-hover:scale-110 transition-transform duration-200" />
                    <p className="text-sm font-medium text-foreground">Histoire-Géo.</p>
                    <p className="text-2xl font-bold mt-1 text-primary group-hover:text-3xl group-hover:font-extrabold transition-all duration-200">
                        {stats.averageHistoireGeo !== undefined ? stats.averageHistoireGeo.toFixed(1) : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground group-hover:font-semibold group-hover:text-muted-foreground/80 transition-all duration-200">({stats.countHistoireGeo ?? 0} élèves)</p>
                </div>
                <div className="group flex flex-col items-center text-center p-4 rounded-lg bg-muted/30 transition-all duration-200 ease-in-out hover:bg-muted/50 hover:scale-[1.02]">
                    <FlaskConical className="h-7 w-7 text-primary mb-2 group-hover:scale-110 transition-transform duration-200" />
                    <p className="text-sm font-medium text-foreground">Sciences</p>
                    <p className="text-2xl font-bold mt-1 text-primary group-hover:text-3xl group-hover:font-extrabold transition-all duration-200">
                        {stats.averageSciences !== undefined ? stats.averageSciences.toFixed(1) : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground group-hover:font-semibold group-hover:text-muted-foreground/80 transition-all duration-200">({stats.countSciences ?? 0} élèves)</p>
                </div>
            </CardContent>
        </Card>

        <Card className="shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-6">
            <CardTitle className="text-xl font-medium text-primary">Mentions (parmi admis)</CardTitle>
            <Award className="h-6 w-6 text-primary" />
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 pt-4 sm:grid-cols-4 p-6 pb-6">
            <div className="group p-2 rounded-lg transition-all duration-200 ease-in-out hover:bg-primary/10 hover:scale-[1.02]">
              <p className="text-sm font-semibold text-foreground">Très Bien</p>
              <p className="text-4xl font-bold text-primary group-hover:scale-105 transition-transform duration-200 ease-in-out">{stats.mentions.tresBien}</p>
              <p className="text-xs text-muted-foreground group-hover:font-semibold group-hover:text-muted-foreground/80 transition-all duration-200">{stats.admis > 0 ? stats.mentionPercentages.tresBien : 0}% des admis</p>
            </div>
            <div className="group p-2 rounded-lg transition-all duration-200 ease-in-out hover:bg-primary/10 hover:scale-[1.02]">
              <p className="text-sm font-semibold text-foreground">Assez Bien</p>
              <p className="text-4xl font-bold text-primary group-hover:scale-105 transition-transform duration-200 ease-in-out">{stats.mentions.assezBien}</p>
              <p className="text-xs text-muted-foreground group-hover:font-semibold group-hover:text-muted-foreground/80 transition-all duration-200">{stats.admis > 0 ? stats.mentionPercentages.assezBien : 0}% des admis</p>
            </div>
            <div className="group p-2 rounded-lg transition-all duration-200 ease-in-out hover:bg-primary/10 hover:scale-[1.02]">
              <p className="text-sm font-semibold text-foreground">Bien</p>
              <p className="text-4xl font-bold text-primary group-hover:scale-105 transition-transform duration-200 ease-in-out">{stats.mentions.bien}</p>
              <p className="text-xs text-muted-foreground group-hover:font-semibold group-hover:text-muted-foreground/80 transition-all duration-200">{stats.admis > 0 ? stats.mentionPercentages.bien : 0}% des admis</p>
            </div>
            <div className="group p-2 rounded-lg transition-all duration-200 ease-in-out hover:bg-primary/10 hover:scale-[1.02]">
              <p className="text-sm font-semibold text-foreground">Sans Mention</p>
              <p className="text-4xl font-bold text-primary group-hover:scale-105 transition-transform duration-200 ease-in-out">{stats.mentions.sansMention}</p>
              <p className="text-xs text-muted-foreground group-hover:font-semibold group-hover:text-muted-foreground/80 transition-all duration-200">{stats.admis > 0 ? stats.mentionPercentages.sansMention : 0}% des admis</p>
            </div>
          </CardContent>
        </Card>
      </>
      )}
    </div>
  );
}

