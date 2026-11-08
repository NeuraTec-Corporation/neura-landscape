import { identityMode } from "@/modules/identity/configuration.mjs";
import type { Metadata } from "next";
import "./globals.css";
import { CatalogProvider } from "./_components/catalogs";
import { IdentityGate } from "./_components/identity-gate";
// Access mode must follow runtime configuration, never a cached build-time screen.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
	title: "Neura Landscape | Operaciones",
	description:
		"Gestión de clientes, propiedades, equipos y operaciones de paisajismo.",
	robots: { index: false, follow: false, nocache: true },
};
export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="es">
			<body>
				<CatalogProvider>
					<IdentityGate initialEnabled={identityMode() !== "evaluation"}>
						{children}
					</IdentityGate>
				</CatalogProvider>
			</body>
		</html>
	);
}
