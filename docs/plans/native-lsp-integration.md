# Implementation Plan: Native LSP Tool Integration

## Objective

Implement a suite of native, high-performance LSP tools to replace reliance on
`grep` for codebase exploration and semantic navigation.

## Key Files & Context

- **New Service:** `packages/core/src/services/lspService.ts` (Manages server
  pool and JSON-RPC).
- **New Tools:** `packages/core/src/tools/lspTools.ts` (Implements
  `lsp_definition`, `lsp_references`, etc.).
- **Registry:** `packages/core/src/config/config.ts` (Registers tools).
- **Dependencies:** `vscode-languageserver-protocol`, `vscode-jsonrpc`.

## Implementation Steps

### Phase 1: Infrastructure

1. **LSPService:**
   - Implement a singleton `LSPService` in `packages/core/src/services/`.
   - Add a mapping of file extensions to default server commands (e.g., `.ts` ->
     `typescript-language-server`).
   - Implement `getServer(projectRoot, languageId)` to spawn/retrieve servers.
   - Implement `sendRequest(method, params)` with 1-indexed to 0-indexed
     coordinate conversion.

### Phase 2: Tool Implementation

1. **Tool Definitions:**
   - Define `LSP_DEFINITION_TOOL_NAME`, `LSP_REFERENCES_TOOL_NAME`, etc., in
     `packages/core/src/tools/tool-names.ts`.
   - Create `packages/core/src/tools/definitions/lspTools.ts` with dense,
     pro-level descriptions.
2. **Tool Classes:**
   - Implement `LSPDefinitionTool`, `LSPReferencesTool`, `LSPSymbolsTool`, and
     `LSPImplementationTool` in `packages/core/src/tools/lspTools.ts`.
   - Ensure all inputs (line/character) are normalized from 1-indexed to
     0-indexed before calling `LSPService`.
   - Ensure all outputs (Locations/Ranges) are normalized back to 1-indexed.

### Phase 3: Integration

1. **Registration:**
   - Update `createToolRegistry` in `packages/core/src/config/config.ts` to
     register the new tools.
2. **Implicit Discovery:**
   - Ensure the `LSPService` gracefully handles cases where a server binary is
     missing from the `$PATH` by returning a clear error to the model.

## Verification & Testing

- **Unit Tests:** Create `packages/core/src/tools/lspTools.test.ts` using mock
  language server responses.
- **Integration Tests:** Add a new E2E test in
  `integration-tests/lsp-tools.test.ts` that runs against a real
  `typescript-language-server` if available in the test environment.
- **Manual Verification:** Use the CLI in a TypeScript project to verify
  `lsp_definition` correctly resolves symbols across files.
