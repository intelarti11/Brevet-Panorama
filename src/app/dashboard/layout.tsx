
"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, LayoutGrid, PanelLeft, FileUp } from 'lucide-react';

import Logo from '@/components/logo';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarTrigger,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();

  return (
    <SidebarProvider defaultOpen={true}>
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
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          {/* Updated mobile SidebarTrigger */}
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
    </SidebarProvider>
  );
}
