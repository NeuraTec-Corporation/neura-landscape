// Calendar policy is independent of Landscape storage, UI and identity providers.
export function retentionWindow(year) {
	if (!Number.isInteger(year) || year < 2000 || year > 9999)
		throw new RangeError("Invalid calendar year");
	return {
		calendar_years: 7,
		active_from: `${year - 6}-01-01`,
		archive_before: `${year - 6}-01-01`,
		timezone: "America/New_York",
		deletion_enabled: false,
		archive_requires: ["independent_encrypted_copy", "checksum_verified", "restore_verified", "relationship_closure", "no_open_balance_or_hold"],
	};
}

// Public reference points, not actual customer premises or surveyed parcels.
// Coordinates: US Census Public_AR_Current, retrieved 2026-11-16.
export const geography = [
	["760 Saddle River Rd", "Saddle Brook", "07663", 40.91659136697, -74.092691911326],
	["55 Mayhill St", "Saddle Brook", "07663", 40.897592677734, -74.091788129935],
	["1133 East Ridgewood Ave", "Ridgewood", "07450", 40.973756240265, -74.095158256482],
	["125 North Maple Ave", "Ridgewood", "07450", 40.981786300378, -74.112527192721],
	["40 Railroad Ave", "Rochelle Park", "07662", 40.900179485789, -74.079396607663],
	["151 West Passaic St", "Rochelle Park", "07662", 40.912173282919, -74.077750604074],
	["473 Watchung Ave", "Bloomfield", "07003", 40.828348552189, -74.190815863493],
	["90 Broad St", "Bloomfield", "07003", 40.796648440048, -74.197400796386],
];
export const scenarioProfiles = {
	rojas: { label: "Rojas · residencial y jardines", scale: 1, stock: 90, visits: 12, offset: 0, services: ["mowing", "pruning", "planting", "inspection", "preserve", "maintenance"] },
	evergreen: { label: "Evergreen · mantenimiento comercial y estacional", scale: 2.7, stock: 180, visits: 16, offset: 5, services: ["maintenance", "inspection", "pruning", "planting", "preserve", "mowing"] },
};
