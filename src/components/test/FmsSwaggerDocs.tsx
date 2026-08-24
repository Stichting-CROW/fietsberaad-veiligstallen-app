import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import "swagger-ui-react/swagger-ui.css";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

const FMS_DOCS_NAV = [
  { href: "/test/fms-api-docs-v4", label: "V4 referentie" },
  { href: "/test/fms-api-docs-migrate-v2", label: "Migratie V2 → V4" },
  { href: "/test/fms-api-docs-migrate-v3", label: "Migratie V3 → V4" },
  { href: "/test/fms-api-docs", label: "V2 + V3 (ColdFusion)" },
] as const;

type FmsSwaggerDocsProps = {
  specUrl: string;
};

const FmsSwaggerDocs: React.FC<FmsSwaggerDocsProps> = ({ specUrl }) => {
  const [spec, setSpec] = useState<object | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("swagger-docs-page");
    document.body.classList.add("swagger-docs-page");
    return () => {
      document.documentElement.classList.remove("swagger-docs-page");
      document.body.classList.remove("swagger-docs-page");
    };
  }, []);

  useEffect(() => {
    fetch(specUrl)
      .then((r) => r.json())
      .then(setSpec)
      .catch(console.error);
  }, [specUrl]);

  if (!spec) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p>Laden...</p>
      </div>
    );
  }

  return (
    <div className="swagger-docs-container">
      <nav className="px-4 py-3 border-b bg-white flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {FMS_DOCS_NAV.map((item) => (
          <a key={item.href} href={item.href} className="text-blue-700 hover:underline">
            {item.label}
          </a>
        ))}
      </nav>
      <SwaggerUI
        spec={spec}
        docExpansion="none"
        defaultModelsExpandDepth={1}
        defaultModelExpandDepth={1}
      />
    </div>
  );
};

export default FmsSwaggerDocs;
