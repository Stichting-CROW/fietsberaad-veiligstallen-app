import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });
import "swagger-ui-react/swagger-ui.css";

const FmsApiDocsPage: React.FC = () => {
  const [spec, setSpec] = useState<object | null>(null);

  useEffect(() => {
    fetch("/api/openapi/fms-api")
      .then((r) => r.json())
      .then(setSpec)
      .catch(console.error);
  }, []);

  if (!spec) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p>Laden...</p>
      </div>
    );
  }

  return (
    <div className="swagger-container">
      <SwaggerUI spec={spec} />
    </div>
  );
};

export default FmsApiDocsPage;
