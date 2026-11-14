"use client";
import { useState } from "react";
import { CatalogManager, useCatalogs } from "./catalogs";
import { OperatorSettings } from "./operator-settings";
import { useManagement, Notices } from "./management-shared";
type Connections = {
	database: "cloud" | "local";
	identityConfigured: boolean;
	identityEnabled: boolean;
	placesConfigured: boolean;
	routingConfigured: boolean;
	mediaBackend: string;
};
export function SettingsWorkspace() {
	const c = useCatalogs();
	const [selectedTab, setTab] = useState("company");
	const tab = c.data.role === "manager" ? "catalogs" : selectedTab;
	return (
		<div className="manage-workspace">
			<div className="detail-tabs">
				{c.data.role !== "manager" ? (
					<button
						type="button"
						aria-pressed={tab === "company"}
						onClick={() => setTab("company")}
					>
						Empresa y códigos
					</button>
				) : null}
				<button
					type="button"
					aria-pressed={tab === "catalogs"}
					onClick={() => setTab("catalogs")}
				>
					Catálogos
				</button>
			</div>
			{tab === "company" ? (
				<>
					<OperatorSettings />
					<section className="panel">
						<h3>Reglas de configuración</h3>
						<p>
							Las localidades nuevas usan el identificador de la empresa en sus
							códigos LOC. Los códigos anteriores se conservan. Las tarifas de
							personas se administran en Empleados; los consumos, en Costos.
						</p>
					</section>
				</>
			) : (
				<section className="panel">
					<CatalogManager />
				</section>
			)}
		</div>
	);
}
export function IntegrationsWorkspace() {
	const state = useManagement<Connections>("settings"),
		data = state.data;
	return (
		<div className="manage-workspace">
			<Notices error={state.error} />
			<section className="panel">
				<h2>Conexiones externas y almacenamiento</h2>
				<p>
					Aquí se revisa qué servicios utiliza Landscape y cuáles están
					pendientes de configurar. Los datos de tu empresa y sus opciones de
					negocio se mantienen en Configuración.
				</p>
				<a className="button-link" href="/configuracion">
					Ir a Configuración
				</a>
			</section>
			{data ? (
				<div className="manage-card-grid">
					<article className="panel integration-card">
						<span className="integration-icon" aria-hidden="true">
							▤
						</span>
						<h3>Datos de la empresa</h3>
						<span className="status-tag active">
							{data.database === "cloud"
								? "Almacenamiento en nube"
								: "Almacenamiento de este equipo"}
						</span>
						<p>
							{data.database === "cloud"
								? "Los registros se guardan en la PostgreSQL del proyecto hospedado."
								: "Este entorno de desarrollo usa almacenamiento local. No describe el despliegue de Vercel."}
						</p>
					</article>
					<article className="panel integration-card">
						<span className="integration-icon" aria-hidden="true">
							◎
						</span>
						<h3>Acceso con Google</h3>
						<span
							className={`status-tag ${data.identityEnabled && data.identityConfigured ? "active" : "pending"}`}
						>
							{data.identityEnabled && data.identityConfigured
								? "Activado"
								: data.identityConfigured
									? "Configurado, no activado"
									: "Configuración OAuth pendiente"}
						</span>
						<p>
							Identifica a cada usuario y aplica sus permisos. La protección del
							despliegue Vercel continúa habilitada.
						</p>
						<p>
							Para activar Google se requieren su cliente OAuth y secreto en las
							variables privadas del proyecto.
						</p>
					</article>
					<article className="panel integration-card">
						<span className="integration-icon" aria-hidden="true">
							⌖
						</span>
						<h3>Direcciones y mapas</h3>
						<span className="status-tag pending">
							{data.placesConfigured
								? "Google Places configurado"
								: "Google Places pendiente"}
						</span>
						<p>
							Actualmente se capturan direcciones y coordenadas manualmente. La
							ficha puede abrir el entorno en mapas. No se ha activado
							facturación de Google.
						</p>
					</article>
					<article className="panel integration-card">
						<span className="integration-icon" aria-hidden="true">
							↝
						</span>
						<h3>Optimización de rutas</h3>
						<span className="status-tag pending">
							Proveedor de carreteras pendiente
						</span>
						<p>
							La agenda controla personas, solapamientos y capacidad del turno.
							El orden de paradas y el traslado previsto siguen siendo manuales.
						</p>
					</article>
					<article className="panel integration-card">
						<span className="integration-icon" aria-hidden="true">
							▧
						</span>
						<h3>Fotografías privadas</h3>
						<span className="status-tag active">Almacenamiento protegido</span>
						<p>
							{data.mediaBackend === "private_blob"
								? "Se utiliza un almacén privado de imágenes."
								: "Se utiliza el adaptador privado de la base existente."}{" "}
							Las fotografías no tienen una URL pública de almacenamiento.
						</p>
					</article>
					<article className="panel integration-card">
						<span className="integration-icon" aria-hidden="true">
							$
						</span>
						<h3>Facturación y cobros</h3>
						<span className="status-tag pending">
							Registro interno, sin pasarela externa
						</span>
						<p>
							Puedes registrar documentos y pagos. No se envían facturas, no se
							cargan tarjetas y no hay sincronización con un sistema contable.
						</p>
						<a href="/facturacion">Abrir documentos y pagos ↗</a>
					</article>
				</div>
			) : (
				<p role="status">Consultando configuración...</p>
			)}
		</div>
	);
}
