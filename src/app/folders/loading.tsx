import { AppLoader } from "@/components/ui/loader";

export default function FoldersLoading() {
  return (
    <AppLoader 
      title="Loading Folders" 
      subtitle="Retrieving your folders, access states, and links..." 
    />
  );
}
