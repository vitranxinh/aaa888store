"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export function ChartCard({
  title,
  description,
  data
}: {
  title: string;
  description: string;
  data: { label: string; revenue: number }[];
}) {
  return (
    <Card className="overflow-hidden">
      <CardTitle>{title}</CardTitle>
      <CardDescription className="mt-1">{description}</CardDescription>
      <div className="mt-4 h-80 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 20 }} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={0}
              tickMargin={10}
              fontSize={14}
            />
            <YAxis
              tickFormatter={(value) => `${Number(value) / 1000000}tr`}
              tickLine={false}
              axisLine={false}
              width={56}
              fontSize={14}
            />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Bar dataKey="revenue" fill="#0f766e" radius={[10, 10, 0, 0]} maxBarSize={40} minPointSize={3} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
