import type { Metadata } from "next";
import { AdminApp } from "./admin-app";

export const metadata: Metadata = {
  title: "Choccy Chat admin",
  description: "Approve or reject Choccy Chat directory submissions.",
  robots: { index: false, follow: false },
};

export default function ChoccyChatAdminPage() {
  return <AdminApp />;
}
