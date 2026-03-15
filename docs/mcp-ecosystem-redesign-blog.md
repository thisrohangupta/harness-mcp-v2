# Redesigning the Harness MCP Server for the MCP Ecosystem

MCP is quickly becoming the standard interface between AI agents and software systems. But as more teams adopt MCP, one thing is becoming obvious: exposing raw API surface area is not the same thing as designing a great agent interface.

That realization is what drove the redesign of the Harness MCP Server.

Instead of treating MCP like a thin wrapper around REST endpoints, we rebuilt the server around how agents actually work: limited context windows, probabilistic tool selection, cross-product workflows, and a growing ecosystem of clients, gateways, and multi-agent runtimes.

The result is a more opinionated, more scalable, and more useful MCP server for both developers and the broader MCP ecosystem.

## The first wave of MCP servers taught us an important lesson

The earliest MCP pattern was straightforward: take an API, map each endpoint to a tool, and expose everything.

That works fine for small products. It breaks down fast for platforms.

Harness is not a single-product surface. It spans CI/CD, GitOps, Feature Flags, Cloud Cost Management, Security Testing, software supply chain, developer portals, access control, and more. If we mirrored that one endpoint at a time, the result would be hundreds of tools competing for an agent's attention.

That creates three problems:

1. **Tool overload** - LLMs get worse at tool selection as the menu expands.
2. **Context bloat** - Huge tool catalogs consume prompt budget before the agent even starts reasoning.
3. **Maintenance drag** - Every new endpoint or product area becomes another tool contract to manage and explain.

In other words, the naive "one endpoint, one tool" model is technically correct but operationally poor for agentic systems.

## The redesign: from endpoint wrappers to an agent interface

We redesigned the Harness MCP Server around a simple idea: agents do better with a small set of consistent verbs and a strong discovery model than they do with hundreds of narrowly scoped tools.

Today, the server exposes:

- **11 consolidated MCP tools**
- **122+ resource types**
- **26 toolsets across the Harness platform**
- **26 prompt templates for common workflows**
- **MCP resources for reusable context like pipeline YAML and execution summaries**

Instead of asking an agent to choose from a massive tool list, we give it a compact interface:

- `harness_describe`
- `harness_list`
- `harness_get`
- `harness_create`
- `harness_update`
- `harness_delete`
- `harness_execute`
- `harness_search`
- `harness_diagnose`
- `harness_status`
- `harness_ask`

This is a fundamentally different design philosophy. The tool choice stays stable while the platform capability grows underneath it.

## Why this matters for agents

This redesign is not just cleaner engineering. It changes how well agents can operate.

### 1. Better tool selection

An agent is much more likely to succeed when it only needs to decide between a handful of verbs such as "describe," "list," "get," or "execute." That is a simpler reasoning problem than choosing between dozens or hundreds of endpoint-specific tools with overlapping descriptions.

### 2. Discovery becomes a first-class workflow

The `harness_describe` tool gives agents an immediate way to understand what the server can do before they act. That reduces hallucination, improves tool choice, and makes the system more self-documenting.

### 3. Cross-product workflows feel natural

Real work rarely stays inside one product boundary. A single task might involve:

- diagnosing a failed pipeline
- checking delegate health
- reviewing deployment configuration
- verifying a feature flag rollout
- inspecting cost anomalies after release
- triaging downstream security issues

The redesigned model makes those workflows possible without forcing the agent to learn a brand new tool vocabulary for every product area.

### 4. Lower token overhead

Compact tool surfaces matter. When the interface is smaller and more regular, the agent spends less time parsing schemas and more time solving the problem in front of it.

## Under the hood: a registry, not a pile of wrappers

The core of the redesign is a registry-based dispatch architecture.

The tools themselves are intentionally thin. They act as generic verbs. The real intelligence lives in the registry, where each resource type defines:

- scope
- identifiers
- supported operations
- API paths
- parameter mappings
- response extraction
- deep-link behavior

That gives us several advantages:

- **Scalability** - adding a new resource type does not require inventing a new top-level tool
- **Consistency** - agents interact with the same verbs across the platform
- **Maintainability** - product expansion becomes declarative instead of repetitive
- **Extensibility** - new toolsets can be added without rewriting the server model

This is the key shift: we stopped designing for API parity and started designing for agent usability.

## We also expanded what "MCP server" means

The redesign is about more than CRUD.

### Prompts as workflows

The server includes more than two dozen prompt templates for common workflows such as:

- building and deploying an app end to end
- debugging failed pipelines
- reviewing DORA metrics
- planning feature flag rollouts
- investigating cloud cost anomalies
- triaging vulnerabilities
- auditing access control
- reviewing pull requests

That matters because good MCP experiences are not just about tools. They are also about reusable workflows that help agents start from a strong operational pattern.

### Resources as reusable context

We expose MCP resources such as pipeline YAML and recent execution summaries so agents can pull structured context directly, instead of repeatedly reconstructing it through ad hoc calls.

This is one of the most powerful ideas in MCP: tools are only part of the interface. Resources and prompts complete the operating model.

### Diagnose, status, and ask

We also leaned into higher-level capabilities:

- `harness_diagnose` aggregates execution details, pipeline structure, and logs for failure analysis
- `harness_status` gives a real-time health view into project activity
- `harness_ask` connects to Harness intelligence services for natural-language creation and update flows

These are not just wrappers around single endpoints. They are agent-native entry points.

## Reinforcing the power of MCP in the ecosystem

The broader MCP ecosystem is evolving fast. Developers are no longer using one desktop client with one local server. They are mixing:

- local IDE assistants
- terminal agents
- remote MCP deployments
- team-shared gateways
- governance layers
- multi-agent workflows

That shift influenced the redesign in a major way.

### It works across clients

The server supports stdio for local tools like Claude Desktop, Cursor, Windsurf, and Gemini CLI style integrations, while also supporting HTTP transport for remote and shared deployments.

That means the same server can move from an individual developer laptop to a team-level platform service without changing its core contract.

### It works with gateways

Because the server adheres to MCP while supporting HTTP deployment, it fits naturally behind the next generation of MCP gateways and proxies, including platforms used for centralized authentication, governance, observability, and routing.

In practice, that means teams can put the Harness MCP Server behind shared control planes such as Portkey, LiteLLM, Envoy AI Gateway, Kong, or other MCP-compatible infrastructure and still preserve the same agent experience.

This is where MCP gets really interesting. The protocol stops being a local plugin mechanism and starts becoming an integration layer for AI systems at organizational scale.

### It supports safer real-world usage

A stronger ecosystem needs trust and operational safety, not just connectivity. The redesign includes:

- confirmation flows through MCP elicitation for write operations
- fail-closed behavior for destructive deletes when confirmation is unavailable
- read-only mode for shared or demo environments
- rate limiting, retries, and bounded pagination
- secret metadata without secret value exposure

These choices make the server more deployable in real environments where governance matters.

## What this says about the future of MCP

The biggest lesson from this redesign is that the best MCP servers are not API mirrors. They are carefully designed agent interfaces.

That has implications beyond Harness.

As the ecosystem matures, the winning MCP servers will likely share a few traits:

- **small, coherent tool surfaces**
- **strong discovery paths**
- **composable resources and prompts**
- **safe write patterns**
- **support for both local and remote execution**
- **architectures that scale with product breadth**

MCP is powerful not because it lets us expose more tools. It is powerful because it gives us a standard way to expose the right abstractions.

## Why this redesign matters for Harness

Harness is a natural fit for this model because software delivery is already cross-functional and multi-surface.

A developer might start with a failed pipeline, move into deployment state, inspect a GitOps application, review security findings, check cloud cost impact, and verify a feature flag rollout. That is not five separate stories. It is one operational story.

The redesigned Harness MCP Server is built to let agents follow that story from start to finish.

Instead of presenting Harness as a collection of disconnected APIs, the server now presents it as an actionable system that an agent can explore, reason about, and operate against.

## Closing thought

MCP is still early, but the direction is already clear: the ecosystem does not need more endpoint dumps disguised as tools. It needs interfaces that help agents think, discover, and act safely across complex systems.

That is the spirit behind the Harness MCP Server redesign.

We did not just add more MCP support. We rethought the shape of the interface so it works better for agents, better for teams, and better for the emerging MCP ecosystem as a whole.
