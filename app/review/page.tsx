import { Suspense } from "react";
import MediationWorkspace from "@/components/MediationWorkspace";

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <MediationWorkspace />
    </Suspense>
  );
}
