// Landscape adapter: the reusable security module never imports this file.
export const CURRENT_COMPANY = "landscape";
const resources = [
	["companies", "Empresas", ["read", "create", "update"]],
	["dashboard", "Panel gerencial", ["read"]],
	["customers", "Clientes", ["read", "create", "update"]],
	["properties", "Localidades", ["read", "create", "update", "delete"]],
	[
		"survey",
		"Zonas, elementos y fotografías",
		["read", "create", "update", "delete"],
	],
	["contracts", "Contratos", ["read", "create", "update", "delete"]],
	[
		"estimates",
		"Presupuestos y acuerdos",
		["read", "create", "update", "delete", "approve"],
	],
	[
		"workforce",
		"Empleados y cuadrillas",
		["read", "create", "update", "delete"],
	],
	[
		"visits",
		"Trabajos y agenda",
		["read", "create", "update", "delete", "execute"],
	],
	["costs", "Costos", ["read", "update"]],
	[
		"finance",
		"Facturas y cobros",
		["read", "create", "update", "delete", "approve", "pay"],
	],
	["settings", "Empresa y configuración", ["read", "update"]],
	["catalogs", "Catálogos", ["read", "update"]],
	["integrations", "Integraciones", ["read"]],
	["security", "Usuarios y perfiles", ["read", "update"]],
	["my_work", "Mis asignaciones", ["read"]],
];
export const actionLabels = {
	read: "Consultar",
	create: "Crear",
	update: "Modificar",
	delete: "Retirar / anular",
	approve: "Aprobar / emitir",
	execute: "Ejecutar",
	pay: "Registrar / revertir cobros",
};
export const permissionRegistry = resources.flatMap(
	([resource, label, actions]) =>
		actions.map((action) => ({
			key: `${resource}.${action}`,
			resource,
			label,
			action,
			actionLabel: actionLabels[action],
			requires:
				resource === "visits" && ["create", "update"].includes(action)
					? ["contracts.read", "workforce.read"]
					: [],
			scopes:
				action === "read" && ["survey", "my_work"].includes(resource)
					? ["company", "assigned"]
					: ["company"],
		})),
);
const all = permissionRegistry.map((item) => item.key);
const selected = (modules) =>
	all.filter((key) => modules.includes(key.split(".")[0]));
export const defaultProfiles = [
	{
		key: "it_admin",
		name: "IT",
		scope: "company",
		protected: true,
		grants: all,
	},
	{
		key: "owner",
		name: "Dueños",
		scope: "company",
		protected: false,
		grants: all.filter(
			(k) => !["companies.create", "companies.update"].includes(k),
		),
	},
	{
		key: "company_admin",
		name: "Administrador general",
		scope: "company",
		protected: false,
		grants: all.filter(
			(k) =>
				![
					"companies.create",
					"companies.update",
					"finance.create",
					"finance.update",
					"finance.delete",
					"finance.approve",
					"finance.pay",
				].includes(k),
		),
	},
	{
		key: "manager",
		name: "Supervisor",
		scope: "company",
		protected: false,
		grants: selected([
			"dashboard",
			"customers",
			"properties",
			"survey",
			"contracts",
			"estimates",
			"workforce",
			"visits",
			"costs",
			"catalogs",
			"my_work",
		]).concat(["finance.read", "settings.read"]),
	},
	{
		key: "finance",
		name: "Finanzas",
		scope: "company",
		protected: false,
		grants: selected(["finance", "costs"]).concat([
			"dashboard.read",
			"estimates.read",
			"contracts.read",
			"my_work.read",
			"catalogs.read",
		]),
	},
	{
		key: "crew_lead",
		name: "Jefe de cuadrilla",
		scope: "assigned",
		protected: false,
		grants: ["survey.read", "my_work.read"],
	},
	{
		key: "worker",
		name: "Cuadrillas",
		scope: "assigned",
		protected: false,
		grants: ["survey.read", "my_work.read"],
	},
];
export const sectionPermission = {
	empresas: "companies",
	resumen: "dashboard",
	control: "dashboard",
	clientes: "customers",
	propiedades: "properties",
	presupuestos: "estimates",
	contratos: "contracts",
	empleados: "workforce",
	cuadrillas: "workforce",
	agenda: "visits",
	costos: "costs",
	facturacion: "finance",
	configuracion: "settings",
	integraciones: "integrations",
	usuarios: "security",
};
