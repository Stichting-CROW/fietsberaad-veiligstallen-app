import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import "swagger-ui-react/swagger-ui.css";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

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
