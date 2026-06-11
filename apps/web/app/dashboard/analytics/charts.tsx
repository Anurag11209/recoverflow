'use client';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export interface ChartsProps {
  caseTrend: { day: string; count: number }[];
  revenueTrend: { day: string; revenue: string }[];
  categoryBreakdown: { category: string; count: number }[];
  openCases: number;
  recoveredCases: number;
}

const PIE_COLORS = ['#111827', '#4f46e5', '#0891b2', '#d97706', '#dc2626', '#6b7280'];

const shortDay = (day: string) => day.slice(5); // YYYY-MM-DD -> MM-DD

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 p-5">
      <h2 className="text-sm font-medium text-gray-700">{title}</h2>
      <div className="mt-4 h-64">{children}</div>
    </section>
  );
}

export function AnalyticsCharts({
  caseTrend,
  revenueTrend,
  categoryBreakdown,
  openCases,
  recoveredCases,
}: ChartsProps) {
  const revenueData = revenueTrend.map((p) => ({ day: p.day, revenue: Number(p.revenue) }));
  const statusData = [
    { name: 'Open', count: openCases },
    { name: 'Recovered', count: recoveredCases },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Recovered revenue over time">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={revenueData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="day" tickFormatter={shortDay} fontSize={11} tickLine={false} />
            <YAxis fontSize={11} tickLine={false} axisLine={false} width={48} />
            <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
            <Line type="monotone" dataKey="revenue" stroke="#111827" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Recovery cases over time">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={caseTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="day" tickFormatter={shortDay} fontSize={11} tickLine={false} />
            <YAxis
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={32}
              allowDecimals={false}
            />
            <Tooltip formatter={(v) => [v, 'Cases']} />
            <Bar dataKey="count" fill="#4f46e5" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Failure category breakdown">
        {categoryBreakdown.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-gray-500">
            No cases yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categoryBreakdown}
                dataKey="count"
                nameKey="category"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {categoryBreakdown.map((entry, i) => (
                  <Cell key={entry.category} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Open vs recovered">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={statusData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="name" fontSize={11} tickLine={false} />
            <YAxis
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={32}
              allowDecimals={false}
            />
            <Tooltip formatter={(v) => [v, 'Cases']} />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              <Cell fill="#d97706" />
              <Cell fill="#16a34a" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
