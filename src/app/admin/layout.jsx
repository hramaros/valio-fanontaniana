import AdminShell from "@/components/AdminShell";

export const metadata = {
  title: "Pilotage — valio.fanontaniana",
};

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
