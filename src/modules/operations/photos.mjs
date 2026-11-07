import sharp from "sharp";
import { put, get, del } from "@vercel/blob";
import { randomUUID } from "node:crypto";


import { SurveyError } from "./survey.mjs";
export const uploadReady = () => true;
const blobConfigured=()=>Boolean(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN);
export async function normalizePhoto(bytes) {
	if (!bytes.length || bytes.length > 2 * 1024 * 1024)
		throw new SurveyError("La imagen debe ocupar como máximo 2 MB.");
	try {
		const image = sharp(bytes, { limitInputPixels: 20000000, animated: false });
		const metadata = await image.metadata();
		if (!["jpeg", "png", "webp", "heif"].includes(metadata.format))
			throw new Error();
		const output = await image
			.rotate()
			.resize({
				width: 1600,
				height: 1600,
				fit: "inside",
				withoutEnlargement: true,
			})
			.jpeg({ quality: 78 })
			.toBuffer({ resolveWithObject: true });
		return output;
	} catch {
		throw new SurveyError(
			"Usa una fotografía JPG, PNG o WebP válida de hasta 20 megapíxeles.",
		);
	}
}
export async function savePhoto(db, input, bytes) {
	if (!uploadReady())
		throw new SurveyError(
			"Falta conectar el almacén privado de fotos en Vercel.",
			503,
		);
	if (
		typeof input.caption !== "string" ||
		!input.caption.trim() ||
		input.caption.length > 500 ||
		!["front", "rear", "side", "detail", "overview"].includes(input.viewpoint)
	)
		throw new SurveyError(
			"Indica una descripción y una vista de la fotografía.",
		);
	const id = randomUUID(),
		output = await normalizePhoto(bytes);
	let pathname;
	try {
		return await db.transaction(async (tx) => {
			const budget = (
				await tx.query("SELECT bytes FROM media_budget WHERE id=1 FOR UPDATE")
			).rows[0];
			if (Number(budget.bytes) + output.data.length > 100 * 1024 * 1024)
				throw new SurveyError(
					"Se alcanzó el límite de fotos configurado. Administración debe revisar el almacenamiento.",
					409,
				);
			const property = (
				await tx.query(
					"SELECT id FROM properties WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
					[input.property_id],
				)
			).rows[0];
			if (!property) throw new SurveyError("Localidad no disponible.", 404);
			if (
				input.zone_id &&
				!(
					await tx.query(
						"SELECT id FROM property_zones WHERE id=$1 AND property_id=$2 AND deleted_at IS NULL",
						[input.zone_id, input.property_id],
					)
				).rows.length
			)
				throw new SurveyError("Zona no disponible.");
			if (
				input.element_id &&
				!(
					await tx.query(
						"SELECT id FROM property_elements WHERE id=$1 AND property_id=$2 AND deleted_at IS NULL",
						[input.element_id, input.property_id],
					)
				).rows.length
			)
				throw new SurveyError("Elemento no disponible.");
            if(input.element_id){
 const target=(await tx.query('SELECT zone_id FROM property_elements WHERE id=$1 AND property_id=$2 AND deleted_at IS NULL',[input.element_id,input.property_id])).rows[0];
 if(!target||(input.zone_id&&input.zone_id!==target.zone_id))throw new SurveyError('El elemento y la zona deben corresponder.');
 input={...input,zone_id:target.zone_id};
 }
			if (
				Number(
					(
						await tx.query(
							"SELECT count(*)::int n FROM property_photos WHERE property_id=$1 AND deleted_at IS NULL",
							[input.property_id],
						)
					).rows[0].n,
				) >= 40
			)
				throw new SurveyError(
					"Máximo de 40 fotografías activas por localidad.",
					409,
				);
			if (blobConfigured()) {
				const file = await put(
					`properties/${input.property_id}/${id}.jpg`,
					output.data,
					{
						access: "private",
						contentType: "image/jpeg",
						addRandomSuffix: false,
					},
				);
				pathname = file.pathname;
 } else { pathname=`pg:${id}`; }

			await tx.query(
				"INSERT INTO property_photos(id,property_id,zone_id,element_id,viewpoint,caption,pathname,width,height,bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
				[
					id,
					input.property_id,
					input.zone_id || null,
					input.element_id || null,
					input.viewpoint,
					input.caption.trim(),
					pathname,
					output.info.width,
					output.info.height,
					output.data.length,
				],
			);
            if(pathname.startsWith('pg:'))await tx.query('INSERT INTO property_photo_data(photo_id,content) VALUES($1,$2)',[id,new Uint8Array(output.data)]);
			await tx.query("UPDATE media_budget SET bytes=bytes+$1 WHERE id=1", [
				output.data.length,
			]);
			await tx.query(
				"INSERT INTO service_audit(entity,entity_id,event) VALUES('photo',$1,'created')",
				[id],
			);
			return { id };
		});
	} catch (error) {
		if (pathname) {
			try {
				if (!pathname.startsWith("pg:")) await del(pathname);
			} catch {
				/* Keep the original error; operators reconcile unreferenced private objects. */
			}
		}
		throw error;
	}
}
export async function readPhoto(db,row) {
 if(row.pathname.startsWith('pg:'))return (await db.query('SELECT content FROM property_photo_data WHERE photo_id=$1',[row.id])).rows[0]?.content||null;
 const file=await get(row.pathname,{access:'private'});return file?.statusCode===200?file.stream:null;
}
