import { CompaniesWorkspace } from "./companies-workspace";
import { UserAccount } from "./user-account";
import { WorkspaceNavigation } from "./workspace-navigation";
import Link from "next/link";
import { EstimateWorkspace } from "./estimate-workspace";
import { UsersWorkspace } from "./users-workspace";
import { SettingsWorkspace, IntegrationsWorkspace } from "./settings-workspace";
import { ManagementDashboard } from "./management-dashboard";
import { WorkforceWorkspace } from "./workforce-workspace";
import { VisitsWorkspace } from "./visits-workspace";
import { CostsWorkspace } from "./costs-workspace";
import { FinanceWorkspace } from "./finance-workspace";
import { ContractWorkspace } from "./contract-workspace";
import { ExperimentalNotice } from "@/shared/ui";

import { CustomerWorkspace } from "./customer-workspace";
import { PropertyWorkspace } from "./property-workspace";
export const sections = [
	{ id: "empresas", label: "Empresas" },
	{ id: "resumen", label: "Panel gerencial" },
	{ id: "clientes", label: "Clientes" },
	{ id: "propiedades", label: "Propiedades y localidades" },
	{ id: "presupuestos", label: "Presupuestos" },
	{ id: "contratos", label: "Contratos" },
	{ id: "agenda", label: "Trabajos y agenda" },
	{ id: "control", label: "Panel gerencial", hidden: true },
	{ id: "costos", label: "Costos" },
	{ id: "facturacion", label: "Facturas y cobros" },
	{ id: "empleados", label: "Empleados" },
	{ id: "cuadrillas", label: "Cuadrillas" },
	{ id: "usuarios", label: "Usuarios y permisos" },
	{ id: "configuracion", label: "Configuración" },
	{ id: "integraciones", label: "Integraciones" },
] as const;
export function CommandCenter({ section }: { section: string }) {
	const current = sections.find((s) => s.id === section) ?? sections[0];
	return (
		<div className="workspace">
			<a className="skip" href="#content">
				Saltar al contenido
			</a>
			<aside className="sidebar">
				<Link className="logo" href="/">
					NEURA<span>LANDSCAPE</span>
				</Link>
				<p className="workspace-label">OPERATIONS WORKSPACE</p>
				<WorkspaceNavigation section={section} />
				<div className="sidebar-note">
					● NeuraTec Landscape
					<p>
						Personas. Espacios. Operaciones.
						<br />
						Gestión conectada del servicio.
					</p>
				</div>
			</aside>
			<div className="main-area">
				<header className="topbar">
					<span>Command Center / {current.label}</span>
					<div className="topbar-account">
						<ExperimentalNotice />
						<UserAccount />
					</div>
				</header>
				<main id="content">
					<div
						hidden={
							section === "resumen" ||
							section === "control" ||
							section === "presupuestos"
						}
						className={`page-heading ${section === "clientes" ? "compact" : ""}`}
					>
						<div>
							<p className="eyebrow">TU OPERACIÓN, EN PERSPECTIVA</p>
							<h1>
								{section === "resumen" ? "Panel gerencial" : current.label}
							</h1>
						</div>
					</div>
					{section === "empresas" ? (
						<CompaniesWorkspace />
					) : section === "clientes" ? (
						<CustomerWorkspace />
					) : section === "propiedades" ? (
						<PropertyWorkspace />
					) : section === "usuarios" ? (
						<UsersWorkspace />
					) : section === "presupuestos" ? (
						<EstimateWorkspace />
					) : section === "contratos" ? (
						<ContractWorkspace />
					) : section === "resumen" || section === "control" ? (
						<ManagementDashboard />
					) : section === "empleados" ? (
						<WorkforceWorkspace mode="employees" />
					) : section === "cuadrillas" ? (
						<WorkforceWorkspace mode="crews" />
					) : section === "agenda" ? (
						<VisitsWorkspace />
					) : section === "costos" ? (
						<CostsWorkspace />
					) : section === "facturacion" ? (
						<FinanceWorkspace />
					) : section === "configuracion" ? (
						<SettingsWorkspace />
					) : (
						<IntegrationsWorkspace />
					)}
					<footer>NeuraTec · Landscape Operations</footer>
				</main>
			</div>
		</div>
	);
}
