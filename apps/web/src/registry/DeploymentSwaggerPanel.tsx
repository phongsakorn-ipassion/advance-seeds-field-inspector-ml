import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { buildOpenApiSpec, type OpenApiDoc } from "./openapi";
import type { RegistryDeployment, RegistryVersion } from "./types";

const SwaggerUI = lazy(async () => {
  await import("swagger-ui-react/swagger-ui.css");
  const mod = await import("swagger-ui-react");
  return { default: mod.default };
});

export function DeploymentSwaggerPanel({
  version,
  deployments,
  serverUrl,
  modelLineSlug,
}: {
  version: RegistryVersion;
  deployments: RegistryDeployment[];
  serverUrl: string;
  modelLineSlug: string;
}) {
  const spec = useMemo(
    () => buildOpenApiSpec(version, deployments, { serverUrl, modelLineSlug }),
    [version, deployments, serverUrl, modelLineSlug],
  );
  const [failed, setFailed] = useState(false);

  return (
    <section className="deployment-swagger-panel" aria-label="API explorer">
      <header className="deployment-swagger-heading">
        <strong>API explorer</strong>
        <span>Interactive Swagger UI scoped to this model version. Use Try it out to issue real requests.</span>
      </header>
      {failed ? (
        <SwaggerFallback spec={spec} />
      ) : (
        <Suspense fallback={<div className="deployment-swagger-loading">Loading Swagger UI…</div>}>
          <SwaggerBoundary onError={() => setFailed(true)}>
            <SwaggerUI spec={spec} />
          </SwaggerBoundary>
        </Suspense>
      )}
    </section>
  );
}

function SwaggerBoundary({ children, onError }: { children: React.ReactNode; onError: () => void }) {
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    function handle(event: ErrorEvent) {
      if (event.message?.includes("swagger")) {
        setErrored(true);
        onError();
      }
    }
    window.addEventListener("error", handle);
    return () => window.removeEventListener("error", handle);
  }, [onError]);
  if (errored) return null;
  return <>{children}</>;
}

function SwaggerFallback({ spec }: { spec: OpenApiDoc }) {
  const paths = (spec.paths ?? {}) as Record<string, Record<string, OpenApiOperation>>;
  return (
    <div className="deployment-swagger-fallback" role="alert">
      <strong>Swagger UI failed to load. Showing endpoint summary instead.</strong>
      <ul>
        {Object.entries(paths).flatMap(([path, methods]) =>
          Object.entries(methods).map(([method, op]) => (
            <li key={`${method}-${path}`}>
              <code>{method.toUpperCase()} {path}</code>
              <span>{op.summary ?? ""}</span>
            </li>
          )),
        )}
      </ul>
    </div>
  );
}

type OpenApiOperation = { summary?: string };
