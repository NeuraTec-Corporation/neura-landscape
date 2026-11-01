import Link from "next/link";
import { UsersWorkspace } from "./users-workspace";
import { OperatorSettings } from "./operator-settings";
import { ContractWorkspace } from "./contract-workspace";
import { ExperimentalNotice } from "@/shared/ui";
import { OperationsPanel } from "./operations-panel";
import { CustomerWorkspace } from "./customer-workspace";
import { PropertyWorkspace } from "./property-workspace";
export const sections = [
	{ id: "resumen", label: "Resumen" },
	{ id: "clientes", label: "Clientes" },
	{ id: "propiedades", label: "Propiedades y localidades" },
	{ id: "contratos", label: "Contratos" },
	{ id: "agenda", label: "Trabajos y agenda" },
	{ id: "control", label: "Control de servicio" },
	{ id: "cuadrillas", label: "Cuadrillas" },
	{ id: "usuarios", label: "Usuarios y niveles" },
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
				<nav aria-label="Navegación principal">
					{sections.map((s, i) => (
						<Link
							key={s.id}
							href={s.id === "resumen" ? "/" : `/${s.id}`}
							aria-current={s.id === section ? "page" : undefined}
						>
							<span className="nav-number" aria-hidden="true">
								0{i + 1}
							</span>
							{s.label}
						</Link>
					))}
				</nav>
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
					<ExperimentalNotice />
				</header>
				<main id="content">
					<div
						className={`page-heading ${section === "clientes" ? "compact" : ""}`}
					>
						<div>
							<p className="eyebrow">TU OPERACIÓN, EN PERSPECTIVA</p>
							<h1>
								{section === "resumen"
									? "Un buen día empieza aquí."
									: current.label}
							</h1>
							<p className="description">
								Clientes, propiedades y trabajos conectados con costos por
								visita.
							</p>
						</div>
					</div>
					{section === "clientes" ? (
						<CustomerWorkspace />
					) : section === "propiedades" ? (
						<PropertyWorkspace />
					) : section === "usuarios" ? (
						<UsersWorkspace />
					) : section === "contratos" || section === "control" ? (
						<ContractWorkspace control={section === "control"} />
					) : (
						<>
							{" "}
							{section === "integraciones" ? <OperatorSettings /> : null}
							<OperationsPanel section={section} />
						</>
					)}
					<footer>NeuraTec · Landscape Operations</footer>
				</main>
			</div>
		</div>
	);
}
