import type { Metadata } from "next";
import { Playfair_Display, DM_Sans, Fraunces, Manrope, IBM_Plex_Mono, Barlow, Barlow_Condensed } from 'next/font/google'
import "./globals.css";
import AuthGuard from "@/components/AuthGuard";

// Tipografía de la landing pública (institucional)
const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  weight: ['400', '700', '900'],
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm',
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
})

// Tipografía del sistema interno (post-login): serif editorial + sans humanista + mono
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['opsz', 'SOFT'],
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-plex-mono',
  weight: ['300', '400', '500', '600'],
  display: 'swap',
})

// Tipografía de la página de inicio (cocina): condensada para titulares + humanista para texto
const barlow = Barlow({
  subsets: ['latin'],
  variable: '--font-barlow',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const barlowCond = Barlow_Condensed({
  subsets: ['latin'],
  variable: '--font-barlow-cond',
  weight: ['600', '700', '800'],
  style: ['normal', 'italic'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: "ACEG · Escuela Gastronómica",
  description: "Escuela Gastronómica ACEG en Juliaca: carreras de Cocina y Panadería y Pastelería.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${playfair.variable} ${dmSans.variable} ${fraunces.variable} ${manrope.variable} ${plexMono.variable} ${barlow.variable} ${barlowCond.variable} h-full`}>
      <body className="min-h-full">
        <AuthGuard />
        {children}
      </body>
    </html>
  );
}
