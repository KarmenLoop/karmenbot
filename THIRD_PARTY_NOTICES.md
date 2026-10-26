# Third-party notices

karmenbot (GPL-3.0, see `LICENSE` and `LICENSE-EXCEPTION.md`) includes or adapts work from the projects below. Each is used under
the license shown; the full license texts follow.

| Project | Used for | License |
|---|---|---|
| Koder kernel (agent harness, tools, model catalog, terminal helpers and the KARMEN glass-ring renderer) | Installed into `vendor/` from the official site; **not part of this repository and not open source** | Koder Kernel License (`KERNEL-LICENSE.md`) |
| Koder CLI terminal helpers | Unmodified JavaScript helpers in the runtime asset, with their original license and notices in `vendor/koder-cli/` | GPL-3.0-only, with the original kernel exception |
| Hermes Agent, © 2025 Nous Research | Mixture-of-Agents design; WeCom, DingTalk, Feishu and WeChat (iLink) wire protocols; pairing and chat approval conventions | MIT |
| OpenClaw, © 2026 OpenClaw Foundation | Feishu app-registration flow and channel conventions (reference only) | MIT |
| QR Code generator library, © Project Nayuki | Structure of `src/gateway/qr.mjs` | MIT |
| Playwright MCP (`@playwright/mcp`), © Microsoft Corporation | Optional browser MCP preset (`npx @playwright/mcp`); not bundled in this repo | Apache-2.0 |
| Model Context Protocol reference servers (filesystem, fetch), © Anthropic PBC and contributors | Optional MCP presets via `npx`; not bundled | MIT |

OpenHuman (GPL-3.0) was studied for product ideas only; no OpenHuman code is
included.

## MIT License (Hermes Agent, OpenClaw, Project Nayuki QR Code generator)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Apache License 2.0 (Playwright MCP)

Playwright MCP is used as an optional external process (`npx @playwright/mcp`). It is not vendored into this repository. See https://github.com/microsoft/playwright-mcp for the full Apache-2.0 license text.
