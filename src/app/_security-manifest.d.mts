import type { Capability } from "@/modules/security/index.mjs";
export const CURRENT_COMPANY: string;
export const permissionRegistry: Capability[];
export const actionLabels: Record<string, string>;
export const defaultProfiles: {
	key: string;
	name: string;
	scope: string;
	protected: boolean;
	grants: string[];
}[];
export const sectionPermission: Record<string, string>;
