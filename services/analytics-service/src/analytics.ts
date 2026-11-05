export interface TicketMetric {
  ticketId: string; version: number; category: string; location: string; departmentId: string;
  departmentName: string; status: string; createdAt: string; updatedAt: string; resolvedAt: string;
}

// Resolution time is measured at RESOLVED, never at confirmation or auto-closure.
export function aggregate(rows: TicketMetric[]) {
  const countBy = (key: keyof TicketMetric) => Object.entries(rows.reduce((acc, row) => {
    const name = String(row[key] || 'Unassigned'); acc[name] = (acc[name] ?? 0) + 1; return acc;
  }, {} as Record<string, number>)).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const resolved = rows.filter(r => r.resolvedAt && ['RESOLVED', 'CLOSED'].includes(r.status));
  const hours = (r: TicketMetric) => Math.max(0, (Date.parse(r.resolvedAt) - Date.parse(r.createdAt)) / 3600000);
  const mttr = (list: TicketMetric[]) => list.length ? list.reduce((n, r) => n + hours(r), 0) / list.length : null;
  const names = [...new Set(rows.filter(r => r.departmentId).map(r => r.departmentId))];
  const daily = Object.entries(rows.reduce((acc, r) => {
    const date = r.createdAt.slice(0, 10); acc[date] = (acc[date] ?? 0) + 1; return acc;
  }, {} as Record<string, number>)).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  return {
    total: rows.length, resolvedCount: resolved.length, mttrHours: mttr(resolved),
    closedRate: rows.length ? rows.filter(r => r.status === 'CLOSED').length / rows.length * 100 : 0,
    byStatus: countBy('status'), byCategory: countBy('category'), hotspots: countBy('location').slice(0, 10), daily,
    byDepartment: names.map(id => ({ id, name: rows.find(r => r.departmentId === id)!.departmentName,
      count: rows.filter(r => r.departmentId === id).length, mttrHours: mttr(resolved.filter(r => r.departmentId === id)) })),
    generatedAt: new Date().toISOString(), consistency: 'eventual',
  };
}
