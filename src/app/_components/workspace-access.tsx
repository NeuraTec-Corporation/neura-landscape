"use client";
import { useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SessionContext, UserAccount } from "./user-account";
import { sectionPermission } from "../_security-manifest.mjs";
import { navigationGroups } from "@/shared/navigation";
export function WorkspaceAccess({ children }: { children: React.ReactNode }) {
	const { enabled, member } = useContext(SessionContext),
		path = usePathname();
	if (!enabled || !member?.security) return children;
	const section = path === "/" ? "resumen" : path.split("/")[1],
		resource = sectionPermission[section];
	if (resource && member.security.grants.includes(`${resource}.read`))
		return children;
	const options = navigationGroups
		.flatMap<{ id: string; label: string; href: string }>((g) => [...g.items])
		.filter((i) =>
			member.security?.grants.includes(`${sectionPermission[i.id]}.read`),
		);
	return (
		<main className="crew-portal">
			<header className="panel">
				<UserAccount />
				<h1>Elige un módulo de tu perfil</h1>
				<p>
					Tu acceso no incluye esta sección. Estas son tus opciones en{" "}
					{member.security.company_name}.
				</p>
				<div className="manage-actions">
					{options.map((i) => (
						<Link className="button-link" key={i.id} href={i.href}>
							{i.label}
						</Link>
					))}
				</div>
				{!options.length ? (
					<p>
						No tienes módulos habilitados. Contacta al administrador de tu
						empresa.
					</p>
				) : null}
			</header>
		</main>
	);
}
