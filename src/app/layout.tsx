import type { Metadata } from "next";
import "./globals.css";
import { CatalogProvider } from "./_components/catalogs";
import { IdentityGate } from "./_components/identity-gate";
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
					<IdentityGate
						initialEnabled={process.env.APP_AUTH_ENABLED === "true"}
					>
						{children}
					</IdentityGate>
				</CatalogProvider>
			</body>
		</html>
	);
}
