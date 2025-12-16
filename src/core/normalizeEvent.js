export function normalizeEvent(e) {
	// 필수 필드 체크
	if (!e?.event_id || !e?.order_id || !e?.event_type || !e?.event_time)
		return null;

	const eventType = String(e.event_type).toUpperCase();
	const eventTime = new Date(e.event_time);

	if (Number.isNaN(eventTime.getTime())) return null;

	return {
		...e,
		event_type: eventType,
		event_time: eventTime,
	};
}
