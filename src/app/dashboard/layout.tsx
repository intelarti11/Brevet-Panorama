
"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, LayoutGrid, PanelLeft, FileUp, Filter } from 'lucide-react';

import Logo from '@/components/logo';
import {
  SidebarProvider as DefaultSidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarTrigger,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarGroup,
  SidebarGroupLabel
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  FilterProvider, 
  useFilters, 
  ALL_ACADEMIC_YEARS_VALUE,
  ALL_SERIE_TYPES_VALUE,
  ALL_ESTABLISHMENTS_VALUE 
} from '@/contexts/FilterContext';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardLayoutProps {
  children: ReactNode;
}

function SidebarFilters() {
  const {
    isLoading,
    availableAcademicYears, selectedAcademicYear, setSelectedAcademicYear,
    availableSerieTypes, selectedSerieType, setSelectedSerieType,
    availableEstablishments, selectedEstablishment, setSelectedEstablishment
  } = useFilters();

  if (isLoading) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filtres (Chargement...)
        </SidebarGroupLabel>
        <div className="space-y-3 p-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center gap-2">
        <Filter className="h-4 w-4" />
        Filtres Globaux
      </SidebarGroupLabel>
      <div className="space-y-3 p-2">
        <div>
          <label htmlFor="academicYear-filter-sidebar" className="block text-xs font-medium text-sidebar-foreground/80 mb-1">Année Scolaire</label>
          <Select value={selectedAcademicYear} onValueChange={setSelectedAcademicYear} disabled={availableAcademicYears.length === 0}>
            <SelectTrigger id="academicYear-filter-sidebar" className="w-full h-8 text-xs bg-sidebar-background border-sidebar-border focus:ring-sidebar-ring">
              <SelectValue placeholder="Sélectionner Année" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ACADEMIC_YEARS_VALUE}>Toutes les années</SelectItem>
              {availableAcademicYears.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="serieType-filter-sidebar" className="block text-xs font-medium text-sidebar-foreground/80 mb-1">Série</label>
          <Select value={selectedSerieType} onValueChange={setSelectedSerieType} disabled={availableSerieTypes.length === 0}>
            <SelectTrigger id="serieType-filter-sidebar" className="w-full h-8 text-xs bg-sidebar-background border-sidebar-border focus:ring-sidebar-ring">
              <SelectValue placeholder="Sélectionner Série" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SERIE_TYPES_VALUE}>Toutes les séries</SelectItem>
              {availableSerieTypes.map(serie => (
                <SelectItem key={serie} value={serie}>{serie}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="establishment-filter-sidebar" className="block text-xs font-medium text-sidebar-foreground/80 mb-1">Établissement</label>
          <Select value={selectedEstablishment} onValueChange={setSelectedEstablishment} disabled={availableEstablishments.length === 0}>
            <SelectTrigger id="establishment-filter-sidebar" className="w-full h-8 text-xs bg-sidebar-background border-sidebar-border focus:ring-sidebar-ring">
              <SelectValue placeholder="Sélectionner Établissement" />
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
    </SidebarGroup>
  );
}


export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();

  return (
    <FilterProvider>
      <DefaultSidebarProvider defaultOpen={true}>
        <Sidebar collapsible="none">
          <SidebarHeader className="flex items-center p-4">
            <div className="group-[[data-collapsible=icon][data-state=collapsed]]:hidden">
              <Logo className="text-2xl" />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu className="p-2">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === '/dashboard/panorama'}
                  tooltip={{ children: " Panorama", side: "right", align: "center" }}
                >
                  <Link href="/dashboard/panorama">
                    <LayoutGrid />
                    <span> Panorama</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === '/dashboard/donnee' || pathname === '/dashboard'}
                  tooltip={{ children: " Données", side: "right", align: "center" }}
                >
                  <Link href="/dashboard/donnee">
                    <Database />
                    <span> Données</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === '/dashboard/import'}
                  tooltip={{ children: "Import", side: "right", align: "center" }}
                >
                  <Link href="/dashboard/import">
                    <FileUp />
                    <span>Import</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarFilters /> 
          </SidebarContent>
        </Sidebar>

        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
            <SidebarTrigger className="md:hidden" variant="outline" size="icon">
              <PanelLeft className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </SidebarTrigger>
            <div className="md:hidden">
              <Logo />
            </div>
          </header>
          <main className="flex-1 p-4 sm:px-6 sm:py-0">
            {children}
          </main>
        </SidebarInset>
      </DefaultSidebarProvider>
    </FilterProvider>
  );
}
