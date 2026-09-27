import { AppLoader } from "@/components/ui/loader";

export default function DashboardLoading() {
  return (
    <AppLoader 
      title="Loading Dashboard" 
      subtitle="Fetching storage metrics and active ephemeral folders..." 
    />
  );
}
