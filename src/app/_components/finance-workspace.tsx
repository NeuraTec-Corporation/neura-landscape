"use client";
import { useState } from "react";
import { CatalogSelect } from "./catalogs";
import {
	Notices,
	useManagement,
	usd,
	today,
	AmountLines,
	emptyLine,
	type AmountLine,
} from "./management-shared";
type Payment = {
	id: string;
	received_date: string;
	amount_cents: number;
	method: string;
	reference: string;
	voided_at: string | null;
	void_reason: string;
};
type Invoice = {
	id: string;
	number: string;
	customer_id: string;
	customer_name: string;
	property_id: string | null;
	property_name: string | null;
	issue_date: string;
	due_date: string;
	status: string;
	total_cents: number;
	paid_cents: number;
	notes: string;
	revision: number;
	lines: {
		id: string;
		description: string;
		quantity: number;
		unit_price_cents: number;
	}[];
	payments: Payment[];
};
type FinanceData = {
	canEdit: boolean;
	invoices: Invoice[];
	customers: { id: string; name: string }[];
	properties: { id: string; customer_id: string; name: string }[];
};
const statusLabels: Record<string, string> = {
	draft: "Borrador",
	issued: "Emitida",
	void: "Anulada",
};
export function FinanceWorkspace() {
	const state = useManagement<FinanceData>("finance"),
		[edit, setEdit] = useState<Invoice | null>(null),
		[customer, setCustomer] = useState(""),
		[lines, setLines] = useState<AmountLine[]>([emptyLine()]),
		[payment, setPayment] = useState<Invoice | null>(null),
		[details, setDetails] = useState<string | null>(null),
		[filter, setFilter] = useState("");
	const data = state.data;
	const reset = () => {
		setEdit(null);
		setCustomer("");
		setLines([emptyLine()]);
	};
	return (
		<div className="manage-workspace">
			<Notices error={state.error} notice={state.notice} />
			<header className="manage-intro">
				<div>
					<p className="eyebrow">FACTURACIÓN Y COBROS</p>
					<h2>Documentos, pagos y saldos trazables.</h2>
					<p>
						Registro interno en USD. No envía facturas, no cobra tarjetas ni
						sustituye emisión fiscal o contabilidad externa.
					</p>
				</div>
			</header>
			{data ? (
				<>
					{data.canEdit ? (
						payment ? (
							<section className="panel">
								<h2>Registrar pago · {payment.number}</h2>
								<p>
									{payment.customer_name} · saldo:{" "}
									<strong>
										{usd(payment.total_cents - payment.paid_cents)}
									</strong>
								</p>
								<form
									className="manage-form"
									onSubmit={async (e) => {
										e.preventDefault();
										const fd = Object.fromEntries(
											new FormData(e.currentTarget),
										);
										if (
											await state.save({
												...fd,
												action: "payment",
												invoice_id: payment.id,
												revision: payment.revision,
											})
										)
											setPayment(null);
									}}
								>
									<fieldset disabled={state.busy}>
										<div className="manage-grid">
											<label>
												Fecha recibida
												<input
													name="received_date"
													type="date"
													required
													defaultValue={today()}
												/>
											</label>
											<label>
												Importe recibido (USD)
												<input
													name="amount"
													type="number"
													required
													min="0.01"
													max={(payment.total_cents - payment.paid_cents) / 100}
													step="0.01"
												/>
											</label>
											<label htmlFor="payment-method">
												Medio de pago
												<CatalogSelect
													id="payment-method"
													category="payment_method"
													name="method"
													defaultValue="bank"
													required
												/>
											</label>
											<label>
												Referencia / comprobante
												<input name="reference" maxLength={500} />
											</label>
										</div>
										<div className="manage-actions">
											<button type="submit">Registrar pago recibido</button>
											<button
												className="quiet-button"
												type="button"
												onClick={() => setPayment(null)}
											>
												Cancelar
											</button>
										</div>
									</fieldset>
								</form>
							</section>
						) : (
							<section className="panel">
								<h2>{edit ? `Editar ${edit.number}` : "Nuevo borrador"}</h2>
								<form
									className="manage-form"
									key={edit?.id ?? "new"}
									onSubmit={async (e) => {
										e.preventDefault();
										const form = e.currentTarget,
											fd = Object.fromEntries(new FormData(form));
										if (
											await state.save({
												...fd,
												action: "save",
												customer_id: customer,
												property_id: fd.property_id || null,
												lines,
												...(edit
													? { id: edit.id, revision: edit.revision }
													: {}),
											})
										) {
											reset();
											form.reset();
										}
									}}
								>
									<fieldset disabled={state.busy}>
										<div className="manage-grid">
											<label>
												Cliente *
												<select
													required
													value={customer}
													onChange={(e) => setCustomer(e.target.value)}
												>
													<option value="">Selecciona...</option>
													{data.customers.map((c) => (
														<option key={c.id} value={c.id}>
															{c.name}
														</option>
													))}
												</select>
											</label>
											<label>
												Localidad (opcional)
												<select
													key={customer}
													name="property_id"
													defaultValue={edit?.property_id ?? ""}
												>
													<option value="">General del cliente</option>
													{data.properties
														.filter((p) => p.customer_id === customer)
														.map((p) => (
															<option key={p.id} value={p.id}>
																{p.name}
															</option>
														))}
												</select>
											</label>
											<label>
												Fecha de emisión
												<input
													name="issue_date"
													type="date"
													required
													defaultValue={
														edit?.issue_date.slice(0, 10) ?? today()
													}
												/>
											</label>
											<label>
												Fecha de vencimiento
												<input
													name="due_date"
													type="date"
													required
													defaultValue={edit?.due_date.slice(0, 10) ?? today()}
												/>
											</label>
											<label className="field-wide">
												Observaciones
												<textarea
													name="notes"
													maxLength={3000}
													defaultValue={edit?.notes ?? ""}
												/>
											</label>
										</div>
										<AmountLines lines={lines} onChange={setLines} />
										<div className="manage-actions">
											<button type="submit">
												{edit ? "Guardar borrador" : "Crear borrador"}
											</button>
											{edit ? (
												<button
													className="quiet-button"
													type="button"
													onClick={reset}
												>
													Cancelar edición
												</button>
											) : null}
										</div>
									</fieldset>
								</form>
							</section>
						)
					) : null}
					<div className="manage-actions">
						<h2>Documentos registrados</h2>
						<label>
							Estado
							<select
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
							>
								<option value="">Todos</option>
								{Object.entries(statusLabels).map(([key, label]) => (
									<option key={key} value={key}>
										{label}
									</option>
								))}
							</select>
						</label>
					</div>
					<div className="manage-card-grid">
						{data.invoices
							.filter((i) => !filter || i.status === filter)
							.map((i) => (
								<article className="panel invoice-card" key={i.id}>
									<div className="manage-actions">
										<h3>{i.number}</h3>
										<span className={`status-tag ${i.status}`}>
											{statusLabels[i.status]}
										</span>
									</div>
									<p>
										{i.customer_name}
										{i.property_name ? ` · ${i.property_name}` : ""}
									</p>
									<p>
										Emisión {i.issue_date.slice(0, 10)} · vence{" "}
										{i.due_date.slice(0, 10)}
									</p>
									<strong className="invoice-amount">
										{usd(i.total_cents)}
									</strong>
									<p>
										Pagado: {usd(i.paid_cents)} · saldo:{" "}
										<strong>
											{i.status === "issued"
												? usd(i.total_cents - i.paid_cents)
												: "No exigible"}
										</strong>
									</p>
									<div className="manage-actions">
										{data.canEdit && i.status === "draft" ? (
											<>
												<button
													type="button"
													onClick={() => {
														setEdit(i);
														setCustomer(i.customer_id);
														setLines(
															i.lines.map((l) => ({
																clientKey: l.id,
																description: l.description,
																quantity: Number(l.quantity),
																unit_price: l.unit_price_cents / 100,
																category: "materials",
															})),
														);
													}}
												>
													Editar
												</button>
												<button
													type="button"
													disabled={state.busy}
													onClick={() => {
														if (
															window.confirm(
																"¿Marcar este documento como emitido en el registro interno? No se enviará al cliente.",
															)
														)
															void state.save({
																action: "issue",
																id: i.id,
																revision: i.revision,
															});
													}}
												>
													Emitir en registro
												</button>
											</>
										) : null}
										{data.canEdit &&
										i.status === "issued" &&
										i.total_cents > i.paid_cents ? (
											<button type="button" onClick={() => setPayment(i)}>
												Registrar pago
											</button>
										) : null}
										<button
											type="button"
											className="quiet-button"
											onClick={() => setDetails(details === i.id ? null : i.id)}
										>
											Ver detalle
										</button>
										{data.canEdit ? (
											i.status === "issued" ? (
												<button
													className="quiet-button"
													type="button"
													disabled={state.busy}
													onClick={() => {
														const reason = window.prompt(
															"Motivo de anulación (mínimo 5 caracteres):",
														);
														if (reason)
															void state.save({
																action: "void",
																id: i.id,
																revision: i.revision,
																reason,
															});
													}}
												>
													Anular
												</button>
											) : (
												<button
													className="quiet-button"
													type="button"
													disabled={state.busy}
													onClick={() => {
														const reason = window.prompt(
															"Motivo de baja (mínimo 5 caracteres):",
														);
														if (reason)
															void state.save({
																action: "delete",
																id: i.id,
																revision: i.revision,
																reason,
															});
													}}
												>
													Eliminar del registro activo
												</button>
											)
										) : null}
									</div>
									{details === i.id ? (
										<div className="invoice-details">
											<h4>Conceptos</h4>
											{i.lines.map((line) => (
												<p key={line.id}>
													{line.description} · {line.quantity} ×{" "}
													{usd(line.unit_price_cents)}
												</p>
											))}
											<h4>Pagos registrados</h4>
											{i.payments.map((p) => (
												<div className="payment-row" key={p.id}>
													<p>
														{String(p.received_date).slice(0, 10)} ·{" "}
														{usd(p.amount_cents)} · {p.reference}
														{p.voided_at ? " · Revertido" : ""}
													</p>
													{!p.voided_at && data.canEdit ? (
														<button
															type="button"
															className="quiet-button"
															disabled={state.busy}
															onClick={() => {
																const reason = window.prompt(
																	"Motivo para corregir un registro de pago erróneo (esto no procesa una devolución de dinero):",
																);
																if (reason)
																	void state.save({
																		action: "reverse_payment",
																		id: p.id,
																		reason,
																	});
															}}
														>
															Anular registro de pago
														</button>
													) : (
														<p>{p.void_reason}</p>
													)}
												</div>
											))}
											{!i.payments.length ? (
												<p>Sin pagos registrados.</p>
											) : null}
										</div>
									) : null}
								</article>
							))}
					</div>
					{!data.invoices.length ? (
						<p>
							Aún no hay documentos registrados. El dashboard mostrará cero
							registros, sin inferir cobros a partir de visitas.
						</p>
					) : null}
				</>
			) : (
				<p role="status">Cargando documentos...</p>
			)}
		</div>
	);
}
