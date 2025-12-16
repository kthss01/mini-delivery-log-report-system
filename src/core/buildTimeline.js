export function buildTimeline(events) {
	const byOrder = new Map();

	for (const e of events) {
		const key = e.order_id;
		if (!byOrder.has(key)) byOrder.set(key, []);
		byOrder.get(key).push(e);
	}

	const timelines = [];
	for (const [orderId, list] of byOrder.entries()) {
		// event_id 기준 중복 제거
		const seen = new Set();
		const deduped = [];
		for (const ev of list) {
			if (seen.has(ev.event_id)) continue;
			seen.add(ev.event_id);
			deduped.push(ev);
		}

		// 시간 정렬
		deduped.sort((a, b) => a.event_time - b.event_time);

		timelines.push({
			orderId,
			events: deduped,
		});
	}

	return timelines;
}
