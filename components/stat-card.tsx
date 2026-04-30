import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card>
      <CardDescription>{label}</CardDescription>
      <CardTitle className="mt-2 text-3xl">{value}</CardTitle>
      <p className="mt-2 text-sm text-slate-500">{note}</p>
    </Card>
  );
}
