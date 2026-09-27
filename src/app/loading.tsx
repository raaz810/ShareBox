import { AppLoader } from "@/components/ui/loader";

export default function Loading() {
  return (
    <AppLoader 
      title="Loading ShareBox" 
      subtitle="Securing and synchronizing your session..." 
    />
  );
}
