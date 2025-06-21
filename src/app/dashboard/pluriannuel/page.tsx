
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, AlertTriangle, Users, Percent, TrendingUp, BarChartHorizontalBig } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
  Cell,
} from 'recharts';
import { useFilters, type ProcessedStudentData, ALL_SERIE_TYPES_VALUE, ALL_ESTABLISHMENTS_VALUE } from '@/contexts/FilterContext';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface YearlyStat {
  year: string;
  totalStudents: number;
  admis: number;
  refuse: number;
  successRate: number;
  averageOverallScoreAdmitted?: number;
  mentions: { tresBien: number; bien: number; assezBien: number; sansMention: number; };
  mentionPercentages: { tresBien: number; bien: number; assezBien: number; sansMention: number; };
}

const MAX_YEARS_TO_DISPLAY = 10;

const ACTUAL_CHART_COLORS = {
  admis: "hsl(var(--chart-admis))",    
  refuse: "hsl(var(--destructive))",     
  tresBien: "hsl(var(--chart-tres-bien))",  
  bien: "hsl(var(--chart-bien))",     
  assezBien: "hsl(var(--chart-assez-bien))", 
  sansMention: "hsl(var(--chart-sans-mention))",
  successRate: "hsl(var(--primary))",
  averageScore: "hsl(var(--secondary))",
};

const normalizeForComparison = (text: string | undefined): string => {
  if (text === null || text === undefined) return "";
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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


export default function PluriannuelPage() {
  const {
    isLoading: isLoadingFilters,
    error: errorFilters,
    selectedSerieType,
    selectedEstablishment,
    parseStudentDoc,
  } = useFilters();

  const [allStudents, setAllStudents] = useState<ProcessedStudentData[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [errorData, setErrorData] = useState<string | null>(null);

  const [yearlyData, setYearlyData] = useState<YearlyStat[]>([]);
  const [hoveredBar, setHoveredBar] = useState<{ chart: string; year: string; index: number | null } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
        if (isLoadingFilters) return;

        setIsLoadingData(true);
        setErrorData(null);
        try {
            const qConstraints = [];
            if (selectedEstablishment && selectedEstablishment !== ALL_ESTABLISHMENTS_VALUE) {
                qConstraints.push(where("Libellé Etablissement", "==", selectedEstablishment));
            }
            const q = query(collection(db, 'brevetResults'), ...qConstraints);
            const querySnapshot = await getDocs(q);
            let fetchedStudents = querySnapshot.docs.map(parseStudentDoc);

            if (selectedSerieType && selectedSerieType !== ALL_SERIE_TYPES_VALUE) {
                fetchedStudents = fetchedStudents.filter(s => s.serieType === selectedSerieType);
            }
            setAllStudents(fetchedStudents);

        } catch (e: any) {
            console.error("Error fetching pluriannuel data:", e);
            setErrorData("Impossible de charger les données pluriannuelles: " + e.message);
        } finally {
            setIsLoadingData(false);
        }
    };
    fetchData();
  }, [selectedSerieType, selectedEstablishment, isLoadingFilters, parseStudentDoc]);

  useEffect(() => {
    if (allStudents.length === 0) {
      setYearlyData([]);
      return;
    }
    
    const studentsByYear = allStudents.reduce((acc, student) => {
        const year = student.academicYear;
        if (year) {
            if (!acc[year]) acc[year] = [];
            acc[year].push(student);
        }
        return acc;
    }, {} as Record<string, ProcessedStudentData[]>);

    const yearsInData = Object.keys(studentsByYear).sort((a, b) => parseInt(b) - parseInt(a));
    const recentYears = yearsInData.slice(0, MAX_YEARS_TO_DISPLAY);

    const statsPerYear: YearlyStat[] = recentYears.map(year => {
      const studentsForYear = studentsByYear[year];
      const stat: YearlyStat = {
        year: year!,
        totalStudents: studentsForYear.length,
        admis: 0, refuse: 0, successRate: 0,
        averageOverallScoreAdmitted: undefined,
        mentions: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 0 },
        mentionPercentages: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 0 },
      };

      let sumOverallScoresAdmitted = 0, countOverallScoresAdmitted = 0;
      const normalizedAdmisStr = normalizeForComparison('admis');
      const normalizedTresBienStr = normalizeForComparison('très bien');
      const normalizedAssezBienStr = normalizeForComparison('assez bien');
      const normalizedBienStr = normalizeForComparison('bien');

      studentsForYear.forEach(student => {
        const normalizedResultat = normalizeForComparison(student.resultat);
        if (normalizedResultat.includes(normalizedAdmisStr)) {
          stat.admis++;
          if (student.moyenne) { sumOverallScoresAdmitted += student.moyenne; countOverallScoresAdmitted++; }
          if (normalizedResultat.includes(normalizedTresBienStr)) stat.mentions.tresBien++;
          else if (normalizedResultat.includes(normalizedAssezBienStr)) stat.mentions.assezBien++;
          else if (normalizedResultat.includes(normalizedBienStr)) stat.mentions.bien++;
          else stat.mentions.sansMention++;
        } else if (normalizedResultat.includes("refuse")) {
          stat.refuse++;
        }
      });

      const consideredForRate = stat.admis + stat.refuse;
      if (consideredForRate > 0) stat.successRate = parseFloat(((stat.admis / consideredForRate) * 100).toFixed(1));
      if (stat.admis > 0) {
        stat.mentionPercentages.tresBien = parseFloat(((stat.mentions.tresBien / stat.admis) * 100).toFixed(1));
        stat.mentionPercentages.bien = parseFloat(((stat.mentions.bien / stat.admis) * 100).toFixed(1));
        stat.mentionPercentages.assezBien = parseFloat(((stat.mentions.assezBien / stat.admis) * 100).toFixed(1));
        stat.mentionPercentages.sansMention = parseFloat(((stat.mentions.sansMention / stat.admis) * 100).toFixed(1));
      }
      stat.averageOverallScoreAdmitted = countOverallScoresAdmitted > 0 ? parseFloat((sumOverallScoresAdmitted / countOverallScoresAdmitted).toFixed(1)) : undefined;
      return stat;
    });

    setYearlyData(statsPerYear.sort((a,b) => parseInt(a.year) - parseInt(b.year)));
  }, [allStudents]);


  const mentionsChartDataProcessed = useMemo(() => {
    return yearlyData.map(stat => ({
      year: stat.year,
      "Très Bien": stat.mentionPercentages.tresBien,
      "Bien": stat.mentionPercentages.bien,
      "Assez Bien": stat.mentionPercentages.assezBien,
      "Sans Mention": stat.mentionPercentages.sansMention,
    }));
  }, [yearlyData]);


  if (isLoadingFilters || isLoadingData) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-1 md:p-4">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Chargement des données pluriannuelles...</p>
      </div>
    );
  }

  if (errorFilters || errorData) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-1 md:p-4 text-center">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-destructive mb-2">Erreur de chargement</h2>
        <p className="text-muted-foreground max-w-md">{errorFilters || errorData}</p>
      </div>
    );
  }
  
  if (yearlyData.length === 0) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <header className="mb-8"><h1 className="text-3xl font-bold text-primary tracking-tight">Analyse Pluriannuelle</h1><p className="text-muted-foreground mt-2">Comparaison des indicateurs sur les {MAX_YEARS_TO_DISPLAY} dernières années.</p></header>
        <Card className="shadow-md rounded-lg"><CardContent className="pt-6"><div className="flex flex-col items-center justify-center py-10 text-center"><Users className="w-12 h-12 text-muted-foreground/50 mb-4" /><p className="text-lg font-medium text-muted-foreground">Aucune donnée pluriannuelle à afficher</p><p className="text-sm text-muted-foreground">Importez des données sur plusieurs années ou ajustez les filtres.</p></div></CardContent></Card>
      </div>
    );
  }

  const renderCustomTooltip = (props: any) => {
    const { active, payload, label } = props;
    if (active && payload && payload.length) {
      const yearStat = yearlyData.find(d => d.year === label);
      return (
        <div className="bg-background border border-border shadow-lg rounded-md p-3 text-sm">
          <p className="font-semibold text-foreground mb-1">{`Année : ${label}`}</p>
          {payload.map((entry: any, index: number) => (<p key={`item-${index}`} style={{ color: entry.color }}>{`${entry.name} : ${entry.value}${entry.name.includes('Moyenne') ? '/20' : '%'}`}</p>))}
          {yearStat && <p className="text-xs text-muted-foreground mt-1">Total: {yearStat.totalStudents} élèves</p>}
        </div>
      );
    }
    return null;
  };
  
  const renderMentionsTooltip = (props: any) => {
    const { active, payload, label } = props;
    if (active && payload && payload.length) {
      const yearStat = yearlyData.find(stat => stat.year === label);
      return (
        <div className="bg-background border border-border shadow-lg rounded-md p-3 text-sm">
          <p className="font-semibold text-foreground mb-1">{`Année : ${label}`}</p>
          {payload.map((entry: any, index: number) => (<p key={`item-${index}`} style={{ color: entry.fill || entry.color }}>{`${entry.name} : ${entry.value}%`}</p>))}
          {yearStat && <p className="text-xs text-muted-foreground mt-1">Total admis: {yearStat.admis}</p>}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="mb-8"><h1 className="text-3xl font-bold text-primary tracking-tight">Analyse Pluriannuelle</h1><p className="text-muted-foreground mt-2">Comparaison des indicateurs clés sur les {yearlyData.length} dernières années disponibles.</p></header>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-md rounded-lg"><CardHeader className="p-6"><CardTitle className="flex items-center text-xl text-primary"><Percent className="mr-2 h-5 w-5" />Taux de Réussite Annuel</CardTitle><CardDescription className="mt-1">Évolution du taux de réussite (admis / (admis + refusés)).</CardDescription></CardHeader><CardContent className="h-[350px] p-6">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={yearlyData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="year" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} /><YAxis unit="%" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} domain={[0, 100]} /><RechartsTooltip content={renderCustomTooltip} cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.3 }}/><Bar dataKey="successRate" name="Taux de Réussite" radius={[4, 4, 0, 0]} onMouseEnter={(_d, i) => setHoveredBar({chart: 'successRate', year: yearlyData[i].year, index: i})} onMouseLeave={() => setHoveredBar(null)}>{yearlyData.map((_e, i) => (<Cell key={`cell-sr-${i}`} fill={hoveredBar?.chart === 'successRate' && hoveredBar.index === i ? lightenHslColor(ACTUAL_CHART_COLORS.successRate, 15) : ACTUAL_CHART_COLORS.successRate} />))}<LabelList dataKey="successRate" position="top" offset={5} className="fill-foreground" fontSize={11} formatter={(v: number) => `${v}%`} /></Bar></BarChart></ResponsiveContainer>
        </CardContent></Card>
        <Card className="shadow-md rounded-lg"><CardHeader className="p-6"><CardTitle className="flex items-center text-xl text-primary"><TrendingUp className="mr-2 h-5 w-5" />Moyenne Générale Annuelle (Admis)</CardTitle><CardDescription className="mt-1">Évolution de la moyenne générale (/20) des élèves admis.</CardDescription></CardHeader><CardContent className="h-[350px] p-6">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={yearlyData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="year" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} /><YAxis unit="/20" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} domain={[0, 20]} /><RechartsTooltip content={renderCustomTooltip} cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.3 }}/><Bar dataKey="averageOverallScoreAdmitted" name="Moyenne Générale" radius={[4, 4, 0, 0]} onMouseEnter={(_d, i) => setHoveredBar({chart: 'averageScore', year: yearlyData[i].year, index: i})} onMouseLeave={() => setHoveredBar(null)}>{yearlyData.map((_e, i) => (<Cell key={`cell-avg-${i}`} fill={hoveredBar?.chart === 'averageScore' && hoveredBar.index === i ? lightenHslColor(ACTUAL_CHART_COLORS.averageScore, 15) : ACTUAL_CHART_COLORS.averageScore} />))}<LabelList dataKey="averageOverallScoreAdmitted" position="top" offset={5} className="fill-foreground" fontSize={11} formatter={(v?: number) => v?.toFixed(1) ?? 'N/A'} /></Bar></BarChart></ResponsiveContainer>
        </CardContent></Card>
      </div>
      <Card className="shadow-md rounded-lg"><CardHeader className="p-6"><CardTitle className="flex items-center text-xl text-primary"><BarChartHorizontalBig className="mr-2 h-5 w-5" />Répartition Annuelle des Mentions (% des Admis)</CardTitle><CardDescription className="mt-1">Pourcentage des élèves admis ayant obtenu chaque type de mention.</CardDescription></CardHeader><CardContent className="h-[400px] p-6">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={mentionsChartDataProcessed} layout="horizontal" margin={{ top: 5, right: 20, left: 0, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/><XAxis dataKey="year" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}/><YAxis unit="%" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} domain={[0, 100]}/><RechartsTooltip content={renderMentionsTooltip} cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.3 }} /><Legend wrapperStyle={{paddingTop: '20px'}} formatter={(value) => <span style={{color: 'hsl(var(--foreground))'}}>{value}</span>} />
          <Bar dataKey="Très Bien" stackId="a" fill={ACTUAL_CHART_COLORS.tresBien} name="Très Bien" radius={[4,4,0,0]}><LabelList dataKey="Très Bien" position="insideTop" className="fill-primary-foreground" fontSize={10} formatter={(v: number) => v > 5 ? `${v}%` : ''} /></Bar>
          <Bar dataKey="Bien" stackId="a" fill={ACTUAL_CHART_COLORS.bien} name="Bien"><LabelList dataKey="Bien" position="insideTop" className="fill-primary-foreground" fontSize={10} formatter={(v: number) => v > 5 ? `${v}%` : ''} /></Bar>
          <Bar dataKey="Assez Bien" stackId="a" fill={ACTUAL_CHART_COLORS.assezBien} name="Assez Bien"><LabelList dataKey="Assez Bien" position="insideTop" className="fill-background" fontSize={10} formatter={(v: number) => v > 5 ? `${v}%` : ''} /></Bar>
          <Bar dataKey="Sans Mention" stackId="a" fill={ACTUAL_CHART_COLORS.sansMention} name="Sans Mention" radius={[0,0,4,4]}><LabelList dataKey="Sans Mention" position="insideTop" className="fill-primary-foreground" fontSize={10} formatter={(v: number) => v > 5 ? `${v}%` : ''} /></Bar>
        </BarChart></ResponsiveContainer>
      </CardContent></Card>
    </div>
  );
}
