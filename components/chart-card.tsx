"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

function formatRevenueAxis(value: number) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
  }
  if (Math.abs(amount) >= 1_000_000) {
    return `${Math.round(amount / 1_000_000).toLocaleString("vi-VN")} triệu`;
  }
  return formatCurrency(amount);
}

export function ChartCard({
  title,
  description,
  data
}: {
  title: string;
  description: string;
  data: { label: string; revenue: number }[];
}) {
  const xAxisInterval = data.length > 14 ? Math.ceil(data.length / 6) - 1 : data.length > 8 ? 1 : 0;

  return (
    <Card className="overflow-hidden">
      <CardTitle>{title}</CardTitle>
      <CardDescription className="mt-1">{description}</CardDescription>
      <div className="mt-4 h-80 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 12 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={xAxisInterval}
              minTickGap={10}
              tickMargin={8}
              fontSize={12}
            />
            <YAxis
              tickFormatter={(value) => formatRevenueAxis(Number(value))}
              tickLine={false}
              axisLine={false}
              width={72}
              fontSize={12}
            />
            <Tooltip
              labelFormatter={(label) => `Ngày ${label}`}
              formatter={(value) => [formatCurrency(Number(value)), "Doanh thu"]}
            />
            <Bar dataKey="revenue" fill="#0f766e" radius={[10, 10, 0, 0]} maxBarSize={40} minPointSize={3} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
