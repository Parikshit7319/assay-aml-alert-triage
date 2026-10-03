import type { Metadata } from "next";
import { DemoApp } from "@/components/demo/DemoApp";
import "../app/app.css";

export const metadata: Metadata = { title: "Demo", description: "The Assay workbench on 44 synthetic AML alerts, running in your browser." };

export default function DemoPage() {
  return <DemoApp />;
}
