import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { buildOpenApiSpec, type OpenApiDoc } from "./openapi";
import type { RegistryDeployment, RegistryVersion } from "./types";

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

  function openInNewTab() {
    const html = renderSwaggerStandaloneHtml(spec, version.semver);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener");
    if (!win) {
      URL.revokeObjectURL(url);
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  return (
    <section className="deployment-swagger-panel" aria-label="API explorer">
      <div className="deployment-swagger-heading">
        <strong>API explorer</strong>
        <span>Open the live Swagger UI for this model version in a new tab.</span>
      </div>
      <button type="button" className="primary-button compact deployment-swagger-open" onClick={openInNewTab}>
        Open Swagger <ExternalLink size={13} aria-hidden="true" />
      </button>
    </section>
  );
}

function renderSwaggerStandaloneHtml(spec: OpenApiDoc, title: string): string {
  const specJson = JSON.stringify(spec).replace(/</g, "\\u003c");
  const safeTitle = title.replace(/[<>&"]/g, "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Swagger · ${safeTitle}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>html, body { margin: 0; background: #fafafa; } #swagger { max-width: 1280px; margin: 0 auto; }</style>
</head>
<body>
  <div id="swagger"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.addEventListener('load', function () {
      window.ui = SwaggerUIBundle({
        spec: ${specJson},
        dom_id: '#swagger',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset,
        ],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: 'StandaloneLayout',
        tryItOutEnabled: true,
        defaultModelsExpandDepth: -1,
      });
    });
  </script>
</body>
</html>`;
}
