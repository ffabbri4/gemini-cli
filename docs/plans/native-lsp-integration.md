# Implementation Plan: Native LSP Tool Integration

## Objective

Implement a suite of native, high-performance LSP tools to replace reliance on
`grep` for codebase exploration and semantic navigation, and to enable safe,
compiler-aware code mutation.

## Key Files & Context

- **New Service:** `packages/core/src/services/lspService.ts` (Manages server
  pool and JSON-RPC).
- **New Tools:** `packages/core/src/tools/lspTools.ts` (Implements
  `lsp_definition`, `lsp_references`, etc.).
- **Registry:** `packages/core/src/config/config.ts` (Registers tools).
- **Dependencies:** `vscode-languageserver-protocol`, `vscode-jsonrpc`.

## Implementation Steps

### Phase 1: Infrastructure (COMPLETED)

1. **LSPService:**
   - Implement a singleton `LSPService` in `packages/core/src/services/`.
   - Add a mapping of file extensions to default server commands (e.g., `.ts` ->
     `typescript-language-server`).
   - Implement `getServer(projectRoot, languageId)` to spawn/retrieve servers.
   - Implement `sendRequest(method, params)` with 1-indexed to 0-indexed
     coordinate conversion.
   - **Fix:** Add `textDocument/didOpen` support to send file content.

### Phase 2: Core Discovery Tools (COMPLETED)

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

### Phase 3: Advanced Discovery & Infrastructure (NEXT)

1. **Additional Discovery Tools:**
   - Implement `lsp_global_symbols` (`workspace/symbol`).
   - Implement `lsp_type_definition` (`textDocument/typeDefinition`).
   - Implement `lsp_hover` (`textDocument/hover`).
2. **Capabilities Exposure:**
   - Implement `lsp_capabilities` to return the server's initialized
     capabilities.
3. **Internal Synchronization:**
   - Enhance `LSPService` to support `textDocument/didChange` internally.
   - Integrate `didChange` with `WriteFileTool` and `EditTool` via an event bus
     to ensure the LSP server is always in sync with the file system.

### Phase 4: Mutation Tools

1. **Mutation Tool Implementation:**
   - Implement `lsp_rename` (`textDocument/rename`).
   - Implement `lsp_fix` (`textDocument/codeAction`).
2. **WorkspaceEdit Support:**
   - Implement a utility to apply `WorkspaceEdit` objects returned by the LSP
     server across multiple files safely.

## Verification & Testing

- **Unit Tests:** Create `packages/core/src/tools/lspTools.test.ts` using mock
  language server responses.
- **Integration Tests:** Add a new E2E test in
  `integration-tests/lsp-tools.test.ts` that runs against a real
  `typescript-language-server` if available in the test environment.
- **Manual Verification:** Use the CLI in a TypeScript project to verify
  `lsp_definition` correctly resolves symbols across files.
