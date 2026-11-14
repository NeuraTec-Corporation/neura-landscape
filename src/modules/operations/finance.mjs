import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
	parse,
	ManageError,
	text,
	date,
	money,
	revision,
	audit,
	sequence,
} from "./manage.mjs";
import { requireOption } from "./catalog.mjs";
const line = z.object({
	description: text,
	quantity: z.coerce.number().positive().max(1e6),
	unit_price: money,
});
const invoiceSchema = z.object({
	id: z.string().uuid().optional(),
	revision,
	customer_id: z.string().min(1),
	property_id: z.string().min(1).nullable().optional(),
	issue_date: date,
	due_date: date,
	notes: z.string().trim().max(3000),
	lines: z.array(line).min(1).max(100),
});
export async function financeList(db) {
	return db.transaction(async (tx) => ({
		invoices: (
			await tx.query(
				"SELECT i.*,i.issue_date::text issue_date,i.due_date::text due_date,c.name customer_name,p.name property_name,p.city,p.region,coalesce((SELECT sum(amount_cents)::int FROM payments t WHERE t.invoice_id=i.id AND t.voided_at IS NULL),0) paid_cents,coalesce((SELECT json_agg(l ORDER BY l.id) FROM invoice_lines l WHERE l.invoice_id=i.id),'[]'::json) lines,coalesce((SELECT json_agg(t ORDER BY t.received_date) FROM payments t WHERE t.invoice_id=i.id),'[]'::json) payments FROM invoices i JOIN customers c ON c.id=i.customer_id LEFT JOIN properties p ON p.id=i.property_id WHERE i.deleted_at IS NULL ORDER BY i.issue_date DESC,i.number",
			)
		).rows,
		customers: (await tx.query("SELECT id,name FROM customers ORDER BY name"))
			.rows,
		properties: (
			await tx.query(
				"SELECT id,customer_id,name,city,region FROM properties WHERE deleted_at IS NULL ORDER BY name",
			)
		).rows,
	}));
}
export async function saveInvoice(db, input) {
	const v = parse(invoiceSchema, input),
		id = v.id || randomUUID();
	if (v.due_date < v.issue_date)
		throw new ManageError(
			"El vencimiento no puede ser anterior a la emisión.",
			422,
			{ due_date: "Revisa el vencimiento." },
		);
	return db.transaction(async (tx) => {
		const old = v.id
			? (await tx.query("SELECT * FROM invoices WHERE id=$1 FOR UPDATE", [id]))
					.rows[0]
			: null;
		if (
			v.id &&
			(!old ||
				old.deleted_at ||
				old.revision !== v.revision ||
				old.status !== "draft")
		)
			throw new ManageError(
				"Solo se editan borradores vigentes. Recarga si hubo otra edición.",
				409,
			);
		if (
			!(await tx.query("SELECT id FROM customers WHERE id=$1", [v.customer_id]))
				.rows.length
		)
			throw new ManageError("Selecciona un cliente existente.");
		if (
			v.property_id &&
			!(
				await tx.query(
					"SELECT id FROM properties WHERE id=$1 AND customer_id=$2",
					[v.property_id, v.customer_id],
				)
			).rows.length
		)
			throw new ManageError("La localidad debe pertenecer al cliente.");
		const lines = v.lines.map((l) => ({
				...l,
				cents: Math.round(l.unit_price * 100),
				total: Math.round(l.quantity * Math.round(l.unit_price * 100)),
			})),
			total = lines.reduce((sum, l) => sum + l.total, 0);
		if (!Number.isSafeInteger(total) || total > 100000000)
			throw new ManageError("El total supera el máximo permitido.");
		const number = old?.number || (await sequence(tx, "invoice", "INV"));
		const vals = [
			id,
			number,
			v.customer_id,
			v.property_id || null,
			v.issue_date,
			v.due_date,
			total,
			v.notes,
		];
		if (v.id)
			await tx.query(
				"UPDATE invoices SET customer_id=$3,property_id=$4,issue_date=$5,due_date=$6,total_cents=$7,notes=$8,revision=revision+1 WHERE id=$1 AND number=$2",
				vals,
			);
		else
			await tx.query(
				"INSERT INTO invoices(id,number,customer_id,property_id,issue_date,due_date,total_cents,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
				vals,
			);
		await tx.query("DELETE FROM invoice_lines WHERE invoice_id=$1", [id]);
		for (const l of lines)
			await tx.query("INSERT INTO invoice_lines VALUES($1,$2,$3,$4,$5,$6)", [
				randomUUID(),
				id,
				l.description,
				l.quantity,
				l.cents,
				l.total,
			]);
		await audit(tx, "invoice", id, v.id ? "updated" : "created", {
			before: old,
			after: v,
		});
		return { id };
	});
}
export async function changeInvoice(db, input) {
	const v = parse(
		z.object({
			id: z.string().uuid(),
			revision: z.number().int().positive(),
			action: z.enum(["issue", "void", "delete"]),
			reason: z.string().trim().max(1000).default(""),
		}),
		input,
	);
	return db.transaction(async (tx) => {
		const row = (
			await tx.query("SELECT * FROM invoices WHERE id=$1 FOR UPDATE", [v.id])
		).rows[0];
		if (!row || row.deleted_at || row.revision !== v.revision)
			throw new ManageError("El documento cambió. Recarga.", 409);
		const paid = Number(
			(
				await tx.query(
					"SELECT coalesce(sum(amount_cents),0)::int n FROM payments WHERE invoice_id=$1 AND voided_at IS NULL",
					[v.id],
				)
			).rows[0].n,
		);
		if (v.action === "issue") {
			if (row.status !== "draft")
				throw new ManageError("Solo se emiten borradores.");
			if (
				new Date(row.issue_date).toISOString().slice(0, 10) >
				new Date().toLocaleDateString("sv-SE", { timeZone: "America/New_York" })
			)
				throw new ManageError(
					"No se puede marcar como emitido un documento con fecha futura.",
				);
			await tx.query(
				"UPDATE invoices SET status='issued',revision=revision+1 WHERE id=$1",
				[v.id],
			);
		} else {
			if (v.reason.length < 5)
				throw new ManageError("Explica el motivo de la baja o anulación.");
			if (paid)
				throw new ManageError(
					"Revierte primero los pagos registrados, con su motivo.",
				);
			if (v.action === "delete" && row.status === "issued")
				throw new ManageError("Anula primero la factura emitida.");
			await tx.query(
				"UPDATE invoices SET status='void',deleted_at=CASE WHEN $2 THEN now() ELSE deleted_at END,revision=revision+1 WHERE id=$1",
				[v.id, v.action === "delete"],
			);
		}
		await audit(tx, "invoice", v.id, `${v.action}:${v.reason}`, {
			before: row,
		});
		return { id: v.id };
	});
}
export async function savePayment(db, input) {
	const v = parse(
		z.object({
			invoice_id: z.string().uuid(),
			revision: z.number().int().positive(),
			received_date: date,
			amount: money.refine((v) => v > 0, "El pago debe ser mayor que cero."),
			method: text,
			reference: z.string().trim().max(500),
		}),
		input,
	);
	return db.transaction(async (tx) => {
		const invoice = (
			await tx.query("SELECT * FROM invoices WHERE id=$1 FOR UPDATE", [
				v.invoice_id,
			])
		).rows[0];
		if (
			!invoice ||
			invoice.deleted_at ||
			invoice.status !== "issued" ||
			invoice.revision !== v.revision
		)
			throw new ManageError(
				"Selecciona una factura emitida y recarga su saldo.",
				409,
			);
		await requireOption(tx, "payment_method", v.method);
		if (
			v.received_date >
			new Date().toLocaleDateString("sv-SE", { timeZone: "America/New_York" })
		)
			throw new ManageError(
				"Un pago recibido no puede tener una fecha futura.",
			);
		const paid = Number(
				(
					await tx.query(
						"SELECT coalesce(sum(amount_cents),0)::int n FROM payments WHERE invoice_id=$1 AND voided_at IS NULL",
						[v.invoice_id],
					)
				).rows[0].n,
			),
			cents = Math.round(v.amount * 100);
		if (cents > invoice.total_cents - paid)
			throw new ManageError(
				"El pago supera el saldo pendiente. No se registran anticipos aquí.",
			);
		if (
			v.received_date < new Date(invoice.issue_date).toISOString().slice(0, 10)
		)
			throw new ManageError(
				"La fecha del pago no puede preceder a la emisión.",
			);
		const id = randomUUID();
		await tx.query(
			"INSERT INTO payments(id,invoice_id,received_date,amount_cents,method,reference) VALUES($1,$2,$3,$4,$5,$6)",
			[id, v.invoice_id, v.received_date, cents, v.method, v.reference],
		);
		await tx.query("UPDATE invoices SET revision=revision+1 WHERE id=$1", [
			v.invoice_id,
		]);
		await audit(tx, "payment", id, "recorded", { after: v });
		return { id };
	});
}
export async function reversePayment(db, input) {
	const v = parse(z.object({ id: z.string().uuid(), reason: text }), input);
	return db.transaction(async (tx) => {
		const first = (
			await tx.query("SELECT invoice_id FROM payments WHERE id=$1", [v.id])
		).rows[0];
		if (!first) throw new ManageError("Pago no encontrado.", 404);
		await tx.query("SELECT id FROM invoices WHERE id=$1 FOR UPDATE", [
			first.invoice_id,
		]);
		const row = (
			await tx.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [v.id])
		).rows[0];
		if (row.voided_at) throw new ManageError("Ese pago ya fue revertido.");
		await tx.query(
			"UPDATE payments SET voided_at=now(),void_reason=$2 WHERE id=$1",
			[v.id, v.reason],
		);
		await tx.query("UPDATE invoices SET revision=revision+1 WHERE id=$1", [
			row.invoice_id,
		]);
		await audit(tx, "payment", v.id, `reversed:${v.reason}`, { before: row });
		return { id: v.id };
	});
}
