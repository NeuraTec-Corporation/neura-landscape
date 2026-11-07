// One resource scope for both the list and direct property/photo access.
const scope = `FROM visits v
JOIN app_crew_members m ON m.crew_id=v.crew_id
JOIN app_members actor ON actor.email=m.email
JOIN contracts c ON c.id=v.contract_id
JOIN properties p ON p.id=c.property_id
JOIN crews k ON k.id=v.crew_id
WHERE m.email=$1 AND actor.status='active' AND actor.role IN ('worker','crew_lead')
AND v.status IN ('scheduled','started') AND v.deleted_at IS NULL
AND c.deleted_at IS NULL AND c.status='active'
AND p.deleted_at IS NULL AND p.status='active' AND k.deleted_at IS NULL`;
export async function assignedWork(db, email) {
	return (
		await db.query(
			`SELECT v.id,v.status,v.scheduled_at,v.route_order,c.service,p.id property_id,p.name property_name,p.address,p.access_instructions,p.service_hours,k.name crew_name ${scope} ORDER BY v.scheduled_at,v.route_order`,
			[email],
		)
	).rows;
}
export async function assignedProperty(db, email, propertyId) {
	return (
		(
			await db.query(`SELECT v.id ${scope} AND p.id=$2 LIMIT 1`, [
				email,
				propertyId,
			])
		).rows.length > 0
	);
}
