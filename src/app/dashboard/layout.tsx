
"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Database, LayoutGrid, PanelLeft, FileUp, Filter, AlertTriangle, LogOut, CalendarRange, ShieldCheck, ClipboardEdit, Edit3, Eye, ChevronDown, ChevronUp, Users, BookUser } from 'lucide-react';
import * as React from 'react';
import { useState, useEffect } from 'react'; // Added useState, useEffect

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
  SidebarGroupLabel,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton
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
import { useToast } from '@/hooks/use-toast';

import { getAuth, onAuthStateChanged, type User } from 'firebase/auth'; // Added
import { app } from '@/lib/firebase'; // Added

const ADMIN_EMAIL = "florent.romero@ac-montpellier.fr";

const useAuth = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const authInstance = getAuth(app);
    const unsubscribe = onAuthStateChanged(authInstance, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // In a production app, you would ideally check for a custom claim `admin: true`
        // e.g., currentUser.getIdTokenResult().then(idTokenResult => setIsAdmin(idTokenResult.claims.admin === true));
        // For this request, we're checking the email address directly.
        setIsAdmin(currentUser.email === ADMIN_EMAIL);
      } else {
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  return { isAdmin, user, authLoading };
};


interface DashboardLayoutProps {
  children: ReactNode;
}

function SidebarFilters() {
  const {
    isLoading,
    error: filterContextError,
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
        <div className="space-y-3 p-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </SidebarGroup>
    );
  }

  if (filterContextError) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Erreur Chargement Filtres
        </SidebarGroupLabel>
        <div className="p-3 text-xs text-destructive-foreground bg-destructive/20 rounded-md border border-destructive/50">
          {filterContextError}
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
      <div className="space-y-3 p-3">
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
  const router = useRouter();
  const { toast } = useToast();
  const { isAdmin, authLoading } = useAuth(); 
  const [brevetBlancOpen, setBrevetBlancOpen] = React.useState(false);
  const [adminOpen, setAdminOpen] = React.useState(false);

  const handleLogout = async () => { // Made async
    const authInstance = getAuth(app);
    try {
      await authInstance.signOut();
      toast({
        title: "Déconnexion",
        description: "Vous avez été déconnecté.",
      });
      router.push('/login');
    } catch (error) {
      console.error("Erreur de déconnexion:", error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de se déconnecter.",
      });
    }
  };

  React.useEffect(() => {
    if (pathname.startsWith('/dashboard/brevet-blanc') && !brevetBlancOpen) {
      setBrevetBlancOpen(true);
    }
    if (pathname.startsWith('/dashboard/admin') && !adminOpen) {
      setAdminOpen(true);
    }
  }, [pathname, brevetBlancOpen, adminOpen]);

  if (authLoading) {
    // Optional: render a loading state for the whole page or just the sidebar
    // For simplicity, we'll let it render and update. The isAdmin check will handle visibility.
  }

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
                  onClick={handleLogout}
                  tooltip={{ children: "Déconnexion", side: "right", align: "center" }}
                >
                  <LogOut />
                  <span> Déconnexion</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
                  isActive={pathname === '/dashboard/pluriannuel'}
                  tooltip={{ children: "Pluriannuel", side: "right", align: "center" }}
                >
                  <Link href="/dashboard/pluriannuel">
                    <CalendarRange />
                    <span>Pluriannuel</span>
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

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setBrevetBlancOpen(!brevetBlancOpen)}
                  isActive={pathname.startsWith('/dashboard/brevet-blanc')}
                  tooltip={{ children: "Brevet Blanc", side: "right", align: "center" }}
                  className="flex w-full justify-between items-center"
                >
                  <div className="flex items-center gap-2">
                    <ClipboardEdit />
                    <span>Brevet Blanc</span>
                  </div>
                  {brevetBlancOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </SidebarMenuButton>
                {brevetBlancOpen && (
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/brevet-blanc/saisie-notes"
                        isActive={pathname === '/dashboard/brevet-blanc/saisie-notes'}
                      >
                        <Edit3 />
                        <span>Saisir notes</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/brevet-blanc/voir-notes"
                        isActive={pathname === '/dashboard/brevet-blanc/voir-notes'}
                      >
                        <Eye />
                        <span>Voir notes</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setAdminOpen(!adminOpen)}
                    isActive={pathname.startsWith('/dashboard/admin')}
                    tooltip={{ children: "Administration", side: "right", align: "center" }}
                    className="flex w-full justify-between items-center"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck />
                      <span>Administration</span>
                    </div>
                    {adminOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </SidebarMenuButton>
                  {adminOpen && (
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          href="/dashboard/admin/invitations"
                          isActive={pathname === '/dashboard/admin/invitations'}
                        >
                          <BookUser />
                          <span>Invitations</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          href="/dashboard/admin/gestion"
                          isActive={pathname === '/dashboard/admin/gestion'}
                        >
                          <Users />
                          <span>Gestion</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              )}
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
    
