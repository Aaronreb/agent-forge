"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, Workflow } from "@/lib/api";
import WorkflowEditor from "../WorkflowEditor";

export default function EditWorkflowPage() {
  const { id } = useParams<{ id: string }>();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);

  useEffect(() => {
    api.getWorkflow(id).then(setWorkflow);
  }, [id]);

  if (!workflow) return <div className="text-gray-500 text-center py-20">Loading…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Edit Workflow</h1>
      <WorkflowEditor workflow={workflow} />
    </div>
  );
}
