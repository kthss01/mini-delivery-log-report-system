const SEGMENTS = [
	["S1", "ORDER_CREATED", "STORE_ACCEPTED"],
	["S2", "STORE_ACCEPTED", "COOKING_STARTED"],
	["S3", "COOKING_STARTED", "COOKING_FINISHED"],
	["S4", "COOKING_FINISHED", "RIDER_ASSIGNED"],
	["S5", "RIDER_ASSIGNED", "PICKED_UP"],
	["S6", "PICKED_UP", "DELIVERED"],
];

function findTime(events, type) {
	const ev = events.find((x) => x.event_type === type);
	return ev ? ev.event_time : null;
}

export function calculateLeadTime(timelines) {
	return timelines.map((t) => {
		const events = t.events;
		const segments = {};

		for (const [code, from, to] of SEGMENTS) {
			const a = findTime(events, from);
			const b = findTime(events, to);
			segments[code] = a && b ? Math.floor((b - a) / 1000) : null;
		}

		const created = findTime(events, "ORDER_CREATED");
		const delivered = findTime(events, "DELIVERED");
		const totalLeadTime =
			created && delivered
				? Math.floor((delivered - created) / 1000)
				: null;

		return {
			orderId: t.orderId,
			// 집계에 쓰기 좋게 대표 차원도 같이 올려둘 수 있음(첫 이벤트에서 뽑기)
			region: events[0]?.region ?? null,
			store_id: events[0]?.store_id ?? null,
			segments,
			totalLeadTime,
		};
	});
}
