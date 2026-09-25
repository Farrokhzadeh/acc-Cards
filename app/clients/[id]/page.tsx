import AdminAuthGate from "@/components/admin-auth-gate";
import ClientWorkspacePage from "./client-workspace-page";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminAuthGate><ClientWorkspacePage clientId={id} /></AdminAuthGate>;
}
