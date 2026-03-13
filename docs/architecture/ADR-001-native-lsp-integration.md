# ADR-001: Native LSP Tool Integration

## Status

Proposed (2026-03-08)

## Context

Gemini CLI currently relies on `grep` and `glob` for codebase navigation. This
is inefficient and error-prone for complex semantic operations. While the Model
Context Protocol (MCP) exists for extending the CLI, it introduces unnecessary
abstraction and latency for language-specific semantic exploration.

## Decision

We will implement a native, zero-abstraction LSP (Language Server Protocol)
integration.

### Key Design Points

1. **Direct Communication:** Use `vscode-jsonrpc` and
   `vscode-languageserver-protocol` to communicate directly with language
   servers over Stdio.
2. **Explicit Tools:** Expose explicit tools for major LSP capabilities:
   - `lsp_definition` (`textDocument/definition`)
   - `lsp_references` (`textDocument/references`)
   - `lsp_symbols` (`textDocument/documentSymbol`)
   - `lsp_implementation` (`textDocument/implementation`)
3. **1-Indexed Normalization:** All tools will accept and return 1-indexed line
   and character numbers to maintain consistency with existing CLI tools.
4. **Project-Aware Lifecycle:** An `LSPService` singleton will manage a pool of
   language server processes keyed by `(projectRoot, languageId)`.
5. **Implicit Discovery:** The system will attempt to find language servers
   (e.g., `typescript-language-server`) in the user's `$PATH` by default.

## Consequences

- **Positive:** Low-latency, highly precise codebase navigation.
- **Positive:** Zero abstraction—the model interacts with the raw protocol,
  allowing for full use of LSP features.
- **Neutral:** Adds two lightweight dependencies (`vscode-jsonrpc`,
  `vscode-languageserver-protocol`).
- **Negative:** Requires users to have relevant language servers installed in
  their environment for the tools to function.
