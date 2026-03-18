import { useEffect } from "react";
import { useRouter } from "next/router";

/**
 * Redirect /simulation to /beheer/parking-simulation
 */
export default function SimulationRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/beheer/parking-simulation");
  }, [router]);
  return (
    <div className="container mx-auto px-4 py-8 max-w-[87.5%]">
      <p>Doorverwijzen...</p>
    </div>
  );
}
