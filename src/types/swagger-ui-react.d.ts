declare module 'swagger-ui-react' {
  import type { ComponentType } from 'react';

  export type SwaggerUIProps = {
    spec?: object | string;
    url?: string;
    docExpansion?: 'list' | 'full' | 'none';
    defaultModelsExpandDepth?: number;
    defaultModelExpandDepth?: number;
    deepLinking?: boolean;
  };

  const SwaggerUI: ComponentType<SwaggerUIProps>;
  export default SwaggerUI;
}
