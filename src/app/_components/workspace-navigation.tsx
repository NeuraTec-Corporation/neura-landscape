"use client";
import Link from "next/link";
import { useRef } from "react";
import { useCatalogs } from "./catalogs";
import { navigationFor } from "@/shared/navigation";
function Icon({ name }: { name: string }) {
	const paths: Record<string, string> = {
		home: "m3 10 9-7 9 7v10H3z M9 20v-7h6v7",
		people:
			"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3a4 4 0 0 1 0 8",
		calendar: "M3 5h18v16H3z M16 3v4 M8 3v4 M3 11h18 M8 15h2 M14 15h2",
		crew: "M4 20v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
		money: "M3 5h18v14H3z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M6 12h1 M17 12h1",
		settings:
			"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
	};
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.65"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d={paths[name] || paths.home} />
		</svg>
	);
}
export function WorkspaceNavigation({ section }: { section: string }) {
	const { data } = useCatalogs(),
		dialog = useRef<HTMLDialogElement>(null);
	const groups = navigationFor(data.role, data.allowedSections),
		items = groups.flatMap((g) => g.items);
	const links = (mobile: boolean) => (
		<nav
			aria-label={mobile ? "Todas las opciones" : "Navegación principal"}
			className="grouped-navigation"
		>
			{groups.map((g) => (
				<details
					key={g.id}
					open={
						mobile ||
						g.items.some(
							(i) =>
								i.id === section ||
								(section === "control" && i.id === "resumen"),
						)
					}
				>
					<summary>
						<Icon name={g.icon} />
						<span>{g.label}</span>
						<span className="nav-chevron" aria-hidden="true">
							⌄
						</span>
					</summary>
					<div>
						{g.items.map((i) => (
							<Link
								key={i.id}
								href={i.href}
								aria-current={
									i.id === section ||
									(section === "control" && i.id === "resumen")
										? "page"
										: undefined
								}
								onClick={() => dialog.current?.close()}
							>
								{i.label}
							</Link>
						))}
					</div>
				</details>
			))}
		</nav>
	);
	const quick = items.filter((i) =>
		[
			"resumen",
			"clientes",
			"agenda",
			data.role === "manager" ? "cuadrillas" : "facturacion",
		].includes(i.id),
	);
	return (
		<>
			<div className="desktop-navigation">{links(false)}</div>
			<button
				type="button"
				className="mobile-menu-trigger"
				onClick={() => dialog.current?.showModal()}
				aria-label="Abrir menú"
			>
				☰ <span>Menú</span>
			</button>
			<nav className="mobile-bottom-nav" aria-label="Accesos rápidos">
				{quick.map((i) => (
					<Link
						href={i.href}
						key={i.id}
						aria-current={i.id === section ? "page" : undefined}
					>
						<Icon
							name={
								i.id === "resumen"
									? "home"
									: i.id === "clientes"
										? "people"
										: i.id === "agenda"
											? "calendar"
											: i.id === "cuadrillas"
												? "crew"
												: "money"
							}
						/>
						<span>
							{i.id === "resumen"
								? "Inicio"
								: i.id === "facturacion"
									? "Finanzas"
									: i.id === "agenda"
										? "Agenda"
										: i.label}
						</span>
					</Link>
				))}
				<button type="button" onClick={() => dialog.current?.showModal()}>
					<span aria-hidden="true">☰</span>
					<span>Más</span>
				</button>
			</nav>
			<dialog ref={dialog} className="navigation-dialog">
				<header>
					<strong>Tu espacio de trabajo</strong>
					<button
						type="button"
						onClick={() => dialog.current?.close()}
						aria-label="Cerrar menú"
					>
						✕
					</button>
				</header>
				{links(true)}
			</dialog>
		</>
	);
}
