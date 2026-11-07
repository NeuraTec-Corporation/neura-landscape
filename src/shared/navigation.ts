export const navigationGroups = [
	{
		id: "inicio",
		label: "Inicio",
		icon: "home",
		items: [{ id: "resumen", label: "Panel gerencial", href: "/" }],
	},
	{
		id: "comercial",
		label: "Comercial",
		icon: "people",
		items: [
			{ id: "clientes", label: "Clientes", href: "/clientes" },
			{
				id: "propiedades",
				label: "Propiedades y localidades",
				href: "/propiedades",
			},
			{ id: "presupuestos", label: "Presupuestos", href: "/presupuestos" },
			{ id: "contratos", label: "Contratos", href: "/contratos" },
		],
	},
	{
		id: "operacion",
		label: "Operación",
		icon: "calendar",
		items: [{ id: "agenda", label: "Trabajos y agenda", href: "/agenda" }],
	},
	{
		id: "recursos",
		label: "Recursos",
		icon: "crew",
		items: [
			{ id: "empleados", label: "Empleados", href: "/empleados" },
			{ id: "cuadrillas", label: "Cuadrillas", href: "/cuadrillas" },
		],
	},
	{
		id: "finanzas",
		label: "Finanzas",
		icon: "money",
		items: [
			{ id: "costos", label: "Costos y rentabilidad", href: "/costos" },
			{ id: "facturacion", label: "Facturas y cobros", href: "/facturacion" },
		],
	},
	{
		id: "sistema",
		label: "Sistema",
		icon: "settings",
		items: [
			{ id: "usuarios", label: "Usuarios y permisos", href: "/usuarios" },
			{
				id: "configuracion",
				label: "Empresa y catálogos",
				href: "/configuracion",
			},
			{ id: "integraciones", label: "Integraciones", href: "/integraciones" },
		],
	},
] as const;
export function navigationFor(role: string | undefined) {
	return navigationGroups
		.map((g) => ({
			...g,
			items: g.items.filter((i) => {
				if (!role) return i.id === "resumen";
				if (["owner", "it_admin"].includes(role)) return true;
				if (role === "manager")
					return !["usuarios", "integraciones"].includes(i.id);
				if (role === "finance")
					return [
						"resumen",
						"costos",
						"facturacion",
						"contratos",
						"presupuestos",
					].includes(i.id);
				return false;
			}),
		}))
		.filter((g) => g.items.length);
}
