import { authorizedRequest as allowedRequest } from "../_identity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
	if (!(await allowedRequest(request)))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	const key = process.env.GOOGLE_PLACES_API_KEY;
	if (!key) return Response.json({ enabled: false, suggestions: [] });
	const url = new URL(request.url);
	const place = url.searchParams.get("place");
	const q = url.searchParams.get("q") ?? "";
	try {
		if (place) {
			if (!/^[A-Za-z0-9_-]{5,300}$/.test(place))
				return Response.json({ error: "Lugar inválido." }, { status: 400 });
			const r = await fetch(
				`https://places.googleapis.com/v1/places/${encodeURIComponent(place)}`,
				{
					headers: {
						"X-Goog-Api-Key": key,
						"X-Goog-FieldMask": "id,addressComponents,location",
					},
					signal: AbortSignal.timeout(7000),
					cache: "no-store",
				},
			);
			if (!r.ok) throw new Error("provider");
			const data = await r.json();
			const component = (type: string, short = false) => {
				const c = data.addressComponents?.find((item: { types: string[] }) =>
					item.types.includes(type),
				);
				return c ? (short ? c.shortText : c.longText) : "";
			};
			return Response.json({
				enabled: true,
				address: {
					line1: [component("street_number"), component("route")]
						.filter(Boolean)
						.join(" "),
					line2: component("subpremise"),
					city: component("locality") || component("postal_town"),
					region: component("administrative_area_level_1", true),
					postal_code: component("postal_code"),
					country: component("country", true),
					latitude: data.location?.latitude ?? null,
					longitude: data.location?.longitude ?? null,
					place_id: data.id,
				},
			});
		}
		if (q.length < 4 || q.length > 200)
			return Response.json({ enabled: true, suggestions: [] });
		const r = await fetch(
			"https://places.googleapis.com/v1/places:autocomplete",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Goog-Api-Key": key,
					"X-Goog-FieldMask":
						"suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
				},
				body: JSON.stringify({
					input: q,
					languageCode: "es",
					includeQueryPredictions: false,
				}),
				signal: AbortSignal.timeout(7000),
				cache: "no-store",
			},
		);
		if (!r.ok) throw new Error("provider");
		const data = await r.json();
		return Response.json({
			enabled: true,
			suggestions: (data.suggestions ?? [])
				.filter((s: { placePrediction?: unknown }) => s.placePrediction)
				.map(
					(s: {
						placePrediction: { placeId: string; text: { text: string } };
					}) => ({
						id: s.placePrediction.placeId,
						label: s.placePrediction.text.text,
					}),
				)
				.slice(0, 5),
		});
	} catch {
		return Response.json(
			{
				error: "No se pudo consultar el proveedor de direcciones.",
				enabled: true,
				suggestions: [],
			},
			{ status: 502 },
		);
	}
}
