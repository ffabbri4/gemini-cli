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
integration that supports both semantic exploration and precise codebase
mutation.

### Key Design Points

1. **Direct Communication:** Use `vscode-jsonrpc` and
   `vscode-languageserver-protocol` to communicate directly with language
   servers over Stdio.
2. **Explicit Discovery Tools:** Expose tools for major LSP discovery
   capabilities:
   - `lsp_definition` (`textDocument/definition`)
   - `lsp_references` (`textDocument/references`)
   - `lsp_symbols` (`textDocument/documentSymbol`)
   - `lsp_implementation` (`textDocument/implementation`)
   - `lsp_global_symbols` (`workspace/symbol`)
   - `lsp_type_definition` (`textDocument/typeDefinition`)
   - `lsp_hover` (`textDocument/hover`)
3. **Explicit Mutation Tools:** Expose tools for safe, compiler-aware
   refactoring:
   - `lsp_rename` (`textDocument/rename`)
   - `lsp_fix` (`textDocument/codeAction`)
4. **Metadata & Capabilities:** Expose a tool to query server capabilities
   (`lsp_capabilities`) so the model can avoid sending unsupported requests.
5. **1-Indexed Normalization:** All tools will accept and return 1-indexed line
   and character numbers to maintain consistency with existing CLI tools.
6. **Project-Aware Lifecycle:** An `LSPService` singleton will manage a pool of
   language server processes keyed by `(projectRoot, languageId)`.
7. **Implicit Discovery:** The system will attempt to find language servers
   (e.g., `typescript-language-server`) in the user's `$PATH` by default.

## Consequences

- **Positive:** Low-latency, highly precise codebase navigation and refactoring.
- **Positive:** Zero abstraction—the model interacts with the raw protocol,
  allowing for full use of LSP features.
- **Positive:** Increased reliability of code edits via `WorkspaceEdit` support.
- **Neutral:** Adds two lightweight dependencies (`vscode-jsonrpc`,
  `vscode-languageserver-protocol`).
- **Negative:** Requires users to have relevant language servers installed in
  their environment for the tools to function.
