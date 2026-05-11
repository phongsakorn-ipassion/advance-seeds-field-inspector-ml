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
  const absoluteServerUrl = useMemo(() => toAbsoluteUrl(serverUrl), [serverUrl]);
  const spec = useMemo(
    () => buildOpenApiSpec(version, deployments, { serverUrl: absoluteServerUrl, modelLineSlug }),
    [version, deployments, absoluteServerUrl, modelLineSlug],
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

function toAbsoluteUrl(value: string): string {
  if (!value) return typeof window !== "undefined" ? window.location.origin : "https://example.invalid";
  try {
    return new URL(value).toString();
  } catch {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://example.invalid";
    const path = value.startsWith("/") ? value : `/${value}`;
    return `${origin}${path}`;
  }
}

function renderSwaggerStandaloneHtml(spec: OpenApiDoc, title: string): string {
  const specJson = JSON.stringify(spec).replace(/</g, "\\u003c");
  const safeTitle = title.replace(/[<>&"]/g, "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Swagger · ${safeTitle}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>
    html, body { margin: 0; background: #fafafa; font-family: system-ui, sans-serif; }
    #swagger { max-width: 1280px; margin: 0 auto; }
    #boot-error { padding: 16px; color: #b91c1c; white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 12px; }
  </style>
</head>
<body>
  <div id="boot-error" hidden></div>
  <div id="swagger"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    (function () {
      function report(err) {
        var box = document.getElementById('boot-error');
        box.hidden = false;
        box.textContent = 'Swagger UI failed to initialize:\\n' + (err && err.stack ? err.stack : err);
        console.error(err);
      }
      window.addEventListener('error', function (e) { report(e.error || e.message); });
      function boot() {
        try {
          if (typeof SwaggerUIBundle !== 'function') {
            report(new Error('swagger-ui-bundle.js did not load from unpkg'));
            return;
          }
          var specObject = ${specJson};
          var specBlob = new Blob([JSON.stringify(specObject)], { type: 'application/json' });
          var specUrl = URL.createObjectURL(specBlob);
          window.ui = SwaggerUIBundle({
            url: specUrl,
            dom_id: '#swagger',
            presets: [SwaggerUIBundle.presets.apis],
            layout: 'BaseLayout',
            deepLinking: false,
            defaultModelsExpandDepth: -1,
            docExpansion: 'list',
            requestInterceptor: function (req) { return req; },
          });
        } catch (err) {
          report(err);
        }
      }
      if (document.readyState === 'complete') boot();
      else window.addEventListener('load', boot);
    })();
  </script>
</body>
</html>`;
}
