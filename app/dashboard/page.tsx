import DashboardShell from "@/components/layout/DashboardShell";
import WelcomeSection from "@/components/dashboard/WelcomeSection";
import FeatureGrid from "@/components/dashboard/FeatureGrid";
import RepoOverview from "@/components/dashboard/RepoOverview";

export default function DashboardPage() {
  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto">
        <WelcomeSection />
        <FeatureGrid />
        <div className="mt-8">
          <RepoOverview />
        </div>
      </div>
    </DashboardShell>
  );
}
