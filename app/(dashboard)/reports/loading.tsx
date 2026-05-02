import { DashboardPageLoading } from "@/components/dashboard-page-loading";

export default function ReportsLoading() {
  return (
    <DashboardPageLoading
      titleWidth="w-44 sm:w-56 lg:w-72"
      descriptionWidth="w-72 lg:w-96"
      showActionButton={false}
      cardCount={3}
      cardMinHeight="min-h-[180px]"
    />
  );
}
