import AdminAuthGate from "@/components/admin-auth-gate";
import DashboardApp from "./dashboard-app";

export default function Home() {
  return <AdminAuthGate><DashboardApp /></AdminAuthGate>;
}
