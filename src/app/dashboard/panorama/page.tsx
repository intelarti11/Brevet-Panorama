
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, AlertTriangle, Users, Percent, Award, PieChart as PieChartIcon, BarChart2, GraduationCap, BookText, Calculator, Landmark, FlaskConical } from 'lucide-react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  LabelList
} from 'recharts';
import { useFilters, type ProcessedStudentData, ALL_ACADEMIC_YEARS_VALUE, ALL_SERIE_TYPES_VALUE, ALL_ESTABLISHMENTS_VALUE } from '@/contexts/FilterContext';

interface ScoreDistribution {
  gte15: number;
  gte10lt15: number;
  gte8lt10: number;
  lt8: number;
  count: number; // Total students with a score for this subject
}

interface SubjectScoreDistributions {
  francais: ScoreDistribution;
  maths: ScoreDistribution;
  histoireGeo: ScoreDistribution;
  sciences: ScoreDistribution;
}

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
  scoreDistribution: SubjectScoreDistributions;
}

const initialScoreDistribution: ScoreDistribution = { gte15: 0, gte10lt15: 0, gte8lt10: 0, lt8: 0, count: 0 };

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
  scoreDistribution: {
    francais: { ...initialScoreDistribution },
    maths: { ...initialScoreDistribution },
    histoireGeo: { ...initialScoreDistribution },
    sciences: { ...initialScoreDistribution },
  }
};

const ACTUAL_CHART_COLORS = {
  admis: "hsl(160, 82%, 40%)",    
  refuse: "hsl(0, 84%, 60%)",     
  tresBien: "hsl(49, 96%, 77%)",  
  bien: "hsl(223, 78%, 48%)",     
  assezBien: "hsl(38, 92%, 51%)", 
  sansMention: "hsl(215, 9%, 68%)",
};

const SCORE_CHART_COLORS = {
  gte15: "hsl(140, 70%, 35%)",      // Vert foncé
  gte10lt15: "hsl(110, 50%, 65%)",  // Vert clair
  gte8lt10: "hsl(45, 90%, 55%)",   // Jaune/Orange
  lt8: "hsl(0, 80%, 60%)",         // Rouge
};


const normalizeForComparison = (text: string | undefined): string => {
  if (text === null || text === undefined) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const lightenHslColor = (hslColor: string, amount: number): string => {
  if (!hslColor || !hslColor.startsWith('hsl')) return hslColor;
  const match = hslColor.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+%)\s*,\s*([\d.]+%)\s*\)/);
  if (!match) return hslColor;
  const [, h, s, l] = match;
  let lightness = parseFloat(l);
  lightness = Math.min(100, lightness + amount);
  return `hsl(${h}, ${s}, ${lightness}%)`;
};

const calculateScoreOutOf20 = (score: number | undefined, maxScore: number): number | undefined => {
  if (score === undefined || score === null || maxScore <= 0) return undefined;
  return (score / maxScore) * 20;
};

const categorizeScore = (scoreOutOf20: number | undefined, distribution: ScoreDistribution) => {
  if (scoreOutOf20 === undefined) return;
  distribution.count++;
  if (scoreOutOf20 >= 15) distribution.gte15++;
  else if (scoreOutOf20 >= 10) distribution.gte10lt15++;
  else if (scoreOutOf20 >= 8) distribution.gte8lt10++;
  else distribution.lt8++;
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
  const [hoveredPieIndex, setHoveredPieIndex] = useState<number | null>(null);
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [hoveredScorePie, setHoveredScorePie] = useState<{ subject: keyof SubjectScoreDistributions; index: number | null } | null>(null);


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

    const newStats: Stats = { 
      ...initialStats, 
      mentions: { ...initialStats.mentions }, 
      mentionPercentages: { ...initialStats.mentionPercentages},
      scoreDistribution: {
        francais: { ...initialScoreDistribution },
        maths: { ...initialScoreDistribution },
        histoireGeo: { ...initialScoreDistribution },
        sciences: { ...initialScoreDistribution },
      }
    };
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
      } else if (normalizedResultat.includes("refuse")) { // Corrected: without accent
        newStats.refuse++;
      }

      // Average scores calculation
      if (student.scoreFrancais !== undefined && student.scoreFrancais !== null) {
        sumFrancais += student.scoreFrancais;
        countFrancais++;
        categorizeScore(calculateScoreOutOf20(student.scoreFrancais, 100), newStats.scoreDistribution.francais);
      }
      if (student.scoreMaths !== undefined && student.scoreMaths !== null) {
        sumMaths += student.scoreMaths;
        countMaths++;
        categorizeScore(calculateScoreOutOf20(student.scoreMaths, 100), newStats.scoreDistribution.maths);
      }
      if (student.scoreHistoireGeo !== undefined && student.scoreHistoireGeo !== null) {
        sumHistoireGeo += student.scoreHistoireGeo;
        countHistoireGeo++;
        categorizeScore(calculateScoreOutOf20(student.scoreHistoireGeo, 50), newStats.scoreDistribution.histoireGeo);
      }
      if (student.scoreSciences !== undefined && student.scoreSciences !== null) {
        sumSciences += student.scoreSciences;
        countSciences++;
        categorizeScore(calculateScoreOutOf20(student.scoreSciences, 50), newStats.scoreDistribution.sciences);
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
    { name: 'Admis', value: stats.admis, fill: ACTUAL_CHART_COLORS.admis },
    { name: 'Refusé', value: stats.refuse, fill: ACTUAL_CHART_COLORS.refuse },
  ].filter(item => item.value > 0), [stats.admis, stats.refuse]);

  const mentionsChartData = useMemo(() => [
    { name: 'Très Bien', value: stats.mentions.tresBien, fill: ACTUAL_CHART_COLORS.tresBien, percentage: stats.mentionPercentages.tresBien },
    { name: 'Assez Bien', value: stats.mentions.assezBien, fill: ACTUAL_CHART_COLORS.assezBien, percentage: stats.mentionPercentages.assezBien },
    { name: 'Bien', value: stats.mentions.bien, fill: ACTUAL_CHART_COLORS.bien, percentage: stats.mentionPercentages.bien },
    { name: 'Sans Mention', value: stats.mentions.sansMention, fill: ACTUAL_CHART_COLORS.sansMention, percentage: stats.mentionPercentages.sansMention },
  ].filter(item => item.value > 0), [stats.mentions, stats.mentionPercentages]);

  const subjectScoreChartData = (subjectKey: keyof SubjectScoreDistributions) => {
    const distribution = stats.scoreDistribution[subjectKey];
    if (!distribution || distribution.count === 0) return [];
    return [
      { name: '>= 15', value: distribution.gte15, fill: SCORE_CHART_COLORS.gte15, percentage: (distribution.gte15 / distribution.count) * 100 },
      { name: '10-14.9', value: distribution.gte10lt15, fill: SCORE_CHART_COLORS.gte10lt15, percentage: (distribution.gte10lt15 / distribution.count) * 100 },
      { name: '8-9.9', value: distribution.gte8lt10, fill: SCORE_CHART_COLORS.gte8lt10, percentage: (distribution.gte8lt10 / distribution.count) * 100 },
      { name: '< 8', value: distribution.lt8, fill: SCORE_CHART_COLORS.lt8, percentage: (distribution.lt8 / distribution.count) * 100 },
    ].filter(item => item.value > 0);
  };

  const scoreLegendPayload = [
      { value: 'Note >= 15', type: 'square', id: 's1', color: SCORE_CHART_COLORS.gte15 },
      { value: '10 <= Note < 15', type: 'square', id: 's2', color: SCORE_CHART_COLORS.gte10lt15 },
      { value: '8 <= Note < 10', type: 'square', id: 's3', color: SCORE_CHART_COLORS.gte8lt10 },
      { value: 'Note < 8', type: 'square', id: 's4', color: SCORE_CHART_COLORS.lt8 },
  ];


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

  const renderSubjectScorePieChart = (
    subjectKey: keyof SubjectScoreDistributions, 
    title: string, 
    Icon: React.ElementType
  ) => {
    const data = subjectScoreChartData(subjectKey);
    const totalCount = stats.scoreDistribution[subjectKey]?.count || 0;

    return (
      <Card className="shadow-md rounded-lg">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center text-xl text-primary">
            <Icon className="mr-2 h-5 w-5 text-primary" />
            Répartition Notes {title}
          </CardTitle>
          <CardDescription className="mt-1">Distribution des notes (/20) pour {totalCount} élèves.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {totalCount > 0 && data.length > 0 ? (
            <ChartContainer config={{}} className="mx-auto aspect-square max-h-[250px]">
              <PieChart>
                <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent
                        hideLabel
                        formatter={(value, name, props) => (
                            <div className="flex flex-col">
                                <span className="font-semibold capitalize">{props.payload?.name}</span>
                                <span>Nombre: {value} ({props.payload?.percentage?.toFixed(1) ?? 0}%)</span>
                            </div>
                        )}
                    />}
                />
                <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    labelLine={false}
                    activeIndex={hoveredScorePie?.subject === subjectKey ? hoveredScorePie.index ?? undefined : undefined}
                    onMouseEnter={(_d, index) => setHoveredScorePie({ subject: subjectKey, index })}
                    onMouseLeave={() => setHoveredScorePie(null)}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-score-${subjectKey}-${index}`}
                      fill={hoveredScorePie?.subject === subjectKey && hoveredScorePie?.index === index ? lightenHslColor(entry.fill as string, 15) : (entry.fill as string)}
                    />
                  ))}
                  <LabelList
                    dataKey="percentage"
                    position="inside"
                    formatter={(value: number) => value > 5 ? `${value.toFixed(0)}%` : ''}
                    className="fill-primary-foreground text-xs font-medium"
                    style={{ pointerEvents: 'none' }}
                  />
                </Pie>
                <ChartLegend content={<ChartLegendContent payload={scoreLegendPayload} className="flex-wrap justify-center gap-x-4 gap-y-1 text-xs mt-4" />} />
              </PieChart>
            </ChartContainer>
          ) : (
            <p className="text-center text-muted-foreground py-10">Pas de données de notes à afficher pour {title}.</p>
          )}
        </CardContent>
      </Card>
    );
  };


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
              <Users className="h-6 w-6 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-4xl font-bold text-primary group-hover:scale-105 transition-transform duration-200 ease-in-out">{stats.totalStudents}</div>
              <p className="text-xs text-muted-foreground mt-1">total des élèves pour la sélection</p>
            </CardContent>
          </Card>
          <Card className="group shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Taux de Réussite</CardTitle>
              <Percent className="h-6 w-6 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-4xl font-bold text-primary group-hover:scale-105 transition-transform duration-200 ease-in-out">{stats.successRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">{stats.admis} admis sur {stats.admis + stats.refuse > 0 ? stats.admis + stats.refuse : stats.totalStudents} élèves considérés</p>
            </CardContent>
          </Card>
          <Card className="group shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Moyenne Générale (Admis)</CardTitle>
              <GraduationCap className="h-6 w-6 text-muted-foreground" />
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
          <Card className="shadow-md rounded-lg">
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
                        cursor={false}
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
                        activeIndex={hoveredPieIndex ?? undefined}
                        onMouseEnter={(_data, index) => setHoveredPieIndex(index)}
                        onMouseLeave={() => setHoveredPieIndex(null)}
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name, value }) => {
                            const RADIAN = Math.PI / 180;
                            const effectiveOuterRadius = Math.max(0, outerRadius);
                            const effectiveInnerRadius = Math.max(0, innerRadius);
                            const radius = effectiveInnerRadius + (effectiveOuterRadius - effectiveInnerRadius) * 0.5;
                            const x = cx + radius * Math.cos(-midAngle * RADIAN);
                            const y = cy + radius * Math.sin(-midAngle * RADIAN);
                            if (percent < 0.05) return null; // Hide label for very small slices
                            return (
                                <text x={x} y={y} fill="hsl(var(--foreground))" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="12px" fontWeight="medium">
                                {`${name} (${value})`}
                                </text>
                            );
                        }}
                    >
                      {resultsChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={hoveredPieIndex === index ? lightenHslColor(entry.fill as string, 15) : (entry.fill as string)}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              ) : (
                <p className="text-center text-muted-foreground py-10">Pas de données (admis/refusés) à afficher pour ce graphique.</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-md rounded-lg">
            <CardHeader className="p-6">
              <CardTitle className="flex items-center text-xl text-primary">
                <BarChart2 className="mr-2 h-5 w-5 text-primary" />
                Répartition des Mentions
              </CardTitle>
              <CardDescription className="mt-1">Distribution des mentions pour les élèves admis.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              {stats.admis > 0 && mentionsChartData.length > 0 ? (
                <ChartContainer config={{}} className="w-full h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mentionsChartData} layout="vertical" margin={{left:10, right:30, top: 5, bottom: 5}}>
                      <XAxis type="number" dataKey="value" allowDecimals={false} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={70} tickLine={false} axisLine={false} />
                      <ChartTooltip
                          cursor={false}
                          content={
                              <ChartTooltipContent
                                  hideLabel
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
                      <Bar
                        dataKey="value"
                        radius={4}
                        activeBar={false}
                        onMouseEnter={(_data, index) => setHoveredBarIndex(index)}
                        onMouseLeave={() => setHoveredBarIndex(null)}
                      >
                         {mentionsChartData.map((entry, index) => (
                          <Cell
                            key={`cell-mention-${index}`}
                            fill={hoveredBarIndex === index ? lightenHslColor(entry.fill as string, 15) : (entry.fill as string)}
                          />
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
        
        <div className="mt-6">
            <h2 className="text-2xl font-semibold text-primary mb-4 tracking-tight">Analyse des Notes par Matière (/20)</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
                {renderSubjectScorePieChart('francais', 'Français', BookText)}
                {renderSubjectScorePieChart('maths', 'Mathématiques', Calculator)}
                {renderSubjectScorePieChart('histoireGeo', 'Histoire-Géo.', Landmark)}
                {renderSubjectScorePieChart('sciences', 'Sciences', FlaskConical)}
            </div>
        </div>


        <Card className="shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30 mt-6">
            <CardHeader className="p-6">
                <CardTitle className="text-xl text-primary">Moyennes par Matières Principales (Brutes)</CardTitle>
                <CardDescription className="mt-1">Moyenne des notes brutes pour les élèves de la sélection ayant une note enregistrée. Français et Maths sur 100, Histoire-Géo et Sciences sur 50.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6 pt-4 md:grid-cols-4 p-6">
                <div className="group flex flex-col items-center text-center p-4 rounded-lg bg-muted/30 transition-all duration-200 ease-in-out hover:bg-muted/50 hover:scale-[1.02]">
                    <BookText className="h-7 w-7 text-primary mb-2 group-hover:scale-110 transition-transform duration-200" />
                    <p className="text-sm font-medium text-foreground">Français</p>
                    <p className="text-2xl font-bold mt-1 text-primary group-hover:text-3xl group-hover:font-extrabold transition-all duration-200">
                        {stats.averageFrancais !== undefined ? stats.averageFrancais.toFixed(1) : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground group-hover:font-semibold group-hover:text-muted-foreground/80 transition-all duration-200">({stats.countFrancais ?? 0} élèves, /100)</p>
                </div>
                <div className="group flex flex-col items-center text-center p-4 rounded-lg bg-muted/30 transition-all duration-200 ease-in-out hover:bg-muted/50 hover:scale-[1.02]">
                    <Calculator className="h-7 w-7 text-primary mb-2 group-hover:scale-110 transition-transform duration-200" />
                    <p className="text-sm font-medium text-foreground">Mathématiques</p>
                    <p className="text-2xl font-bold mt-1 text-primary group-hover:text-3xl group-hover:font-extrabold transition-all duration-200">
                        {stats.averageMaths !== undefined ? stats.averageMaths.toFixed(1) : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground group-hover:font-semibold group-hover:text-muted-foreground/80 transition-all duration-200">({stats.countMaths ?? 0} élèves, /100)</p>
                </div>
                <div className="group flex flex-col items-center text-center p-4 rounded-lg bg-muted/30 transition-all duration-200 ease-in-out hover:bg-muted/50 hover:scale-[1.02]">
                    <Landmark className="h-7 w-7 text-primary mb-2 group-hover:scale-110 transition-transform duration-200" />
                    <p className="text-sm font-medium text-foreground">Histoire-Géo.</p>
                    <p className="text-2xl font-bold mt-1 text-primary group-hover:text-3xl group-hover:font-extrabold transition-all duration-200">
                        {stats.averageHistoireGeo !== undefined ? stats.averageHistoireGeo.toFixed(1) : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground group-hover:font-semibold group-hover:text-muted-foreground/80 transition-all duration-200">({stats.countHistoireGeo ?? 0} élèves, /50)</p>
                </div>
                <div className="group flex flex-col items-center text-center p-4 rounded-lg bg-muted/30 transition-all duration-200 ease-in-out hover:bg-muted/50 hover:scale-[1.02]">
                    <FlaskConical className="h-7 w-7 text-primary mb-2 group-hover:scale-110 transition-transform duration-200" />
                    <p className="text-sm font-medium text-foreground">Sciences</p>
                    <p className="text-2xl font-bold mt-1 text-primary group-hover:text-3xl group-hover:font-extrabold transition-all duration-200">
                        {stats.averageSciences !== undefined ? stats.averageSciences.toFixed(1) : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground group-hover:font-semibold group-hover:text-muted-foreground/80 transition-all duration-200">({stats.countSciences ?? 0} élèves, /50)</p>
                </div>
            </CardContent>
        </Card>

        <Card className="shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30 mt-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-6">
            <CardTitle className="text-xl font-medium text-primary">Mentions</CardTitle>
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

