# Hand-off: Google Colab MCP Server

## What this is

The official [`googlecolab/colab-mcp`](https://github.com/googlecolab/colab-mcp) Model Context Protocol server. Lets an AI agent create, execute, and iterate on Google Colab notebooks (including GPU runtimes) directly from the editor.

We use it on **Advance Seeds Field Inspector ML** to drive YOLO training and quick experiments on Colab GPUs without leaving the agent loop. Already wired up for Claude Code via [`.mcp.json`](../.mcp.json) at the repo root.

## Prerequisites

- [`uv`](https://docs.astral.sh/uv/) installed and on `PATH` (provides `uvx`). Install: `brew install uv` (macOS) or `curl -LsSf https://astral.sh/uv/install.sh | sh`.
- A Google account with Colab access (free tier is fine; Pro/Pro+ for better GPUs).
- First run opens a browser for OAuth — approve once per machine.

## Server spec (same for every host)

```json
{
  "command": "uvx",
  "args": ["git+https://github.com/googlecolab/colab-mcp"],
  "timeout": 30000
}
```

## Per-tool install

### Claude Code (already done in this repo)

File: `.mcp.json` (project) or `~/.claude.json` (user)

```json
{
  "mcpServers": {
    "colab-mcp": {
      "command": "uvx",
      "args": ["git+https://github.com/googlecolab/colab-mcp"],
      "timeout": 30000
    }
  }
}
```

Or CLI: `claude mcp add colab-mcp -- uvx git+https://github.com/googlecolab/colab-mcp`

### Cursor

File: `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) — same JSON shape as above.

### Cline / Roo Code (VS Code)

Settings → MCP Servers → Add. Use the same `command` and `args`.

### Windsurf

File: `~/.codeium/windsurf/mcp_config.json` — same JSON shape.

### VS Code Copilot (with MCP support, 2026+)

File: `.vscode/mcp.json` — same JSON shape, key is `servers` instead of `mcpServers`.

### Continue.dev

`~/.continue/config.yaml`:

```yaml
mcpServers:
  - name: colab-mcp
    command: uvx
    args: ["git+https://github.com/googlecolab/colab-mcp"]
```

## Verification

After adding + restarting the host:

1. Look for tools prefixed `colab-mcp__*` (e.g. `create_notebook`, `execute_cell`).
2. Ask the agent: *"Create a new Colab notebook, attach a T4 GPU, and run `import torch; print(torch.cuda.is_available())`."*
3. First call triggers a browser OAuth flow — approve and re-run.

## Prompt to paste into the new tool

> I'm handing you a project that uses the Google Colab MCP server (`googlecolab/colab-mcp`) for GPU-backed notebook automation. It's already configured for Claude Code via `.mcp.json` at the repo root. Please:
>
> 1. Detect which AI tool/host you are running inside, then add the same server to *that host's* MCP config file using the spec below. Do not edit `.mcp.json` (that's reserved for Claude Code).
> 2. Verify `uvx` is on `PATH`; if not, instruct me how to install `uv`.
> 3. Tell me to restart the host, then confirm the `colab-mcp__*` tools are visible.
> 4. As a smoke test, propose (don't run) a 3-step plan that would: create a notebook, attach a GPU runtime, and execute a CUDA-availability check.
>
> Server spec:
>
> ```json
> { "command": "uvx", "args": ["git+https://github.com/googlecolab/colab-mcp"], "timeout": 30000 }
> ```
>
> Project context: ML model training (YOLO seed-classification) with existing local + Banana training launchers; Colab is a third execution target for quick GPU experiments.

## References

- [Announcing the Colab MCP Server (Google Developers Blog)](https://developers.googleblog.com/announcing-the-colab-mcp-server-connect-any-ai-agent-to-google-colab/)
- [googlecolab/colab-mcp on GitHub](https://github.com/googlecolab/colab-mcp)
- [Model Context Protocol spec](https://modelcontextprotocol.io)
