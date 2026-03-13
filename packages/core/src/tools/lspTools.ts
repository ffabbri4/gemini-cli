/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  LSP_DEFINITION_TOOL_NAME,
  LSP_REFERENCES_TOOL_NAME,
  LSP_SYMBOLS_TOOL_NAME,
  LSP_IMPLEMENTATION_TOOL_NAME,
  LSP_GLOBAL_SYMBOLS_TOOL_NAME,
  LSP_TYPE_DEFINITION_TOOL_NAME,
  LSP_HOVER_TOOL_NAME,
  LSP_RENAME_TOOL_NAME,
  LSP_FIX_TOOL_NAME,
  LSP_CAPABILITIES_TOOL_NAME,
} from './tool-names.js';
import {
  LSP_DEFINITION_DEFINITION,
  LSP_REFERENCES_DEFINITION,
  LSP_SYMBOLS_DEFINITION,
  LSP_IMPLEMENTATION_DEFINITION,
  LSP_GLOBAL_SYMBOLS_DEFINITION,
  LSP_TYPE_DEFINITION_DEFINITION,
  LSP_HOVER_DEFINITION,
  LSP_RENAME_DEFINITION,
  LSP_FIX_DEFINITION,
  LSP_CAPABILITIES_DEFINITION,
} from './definitions/lspTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { LSPService, isLSPWorkspaceEdit } from '../services/lspService.js';

// --- Base LSP Invocation ---

abstract class BaseLSPInvocation<
  TParams extends { file_path?: string },
> extends BaseToolInvocation<TParams, ToolResult> {
  constructor(
    protected readonly config: Config,
    params: TParams,
    messageBus: MessageBus,
    toolName: string,
  ) {
    super(params, messageBus, toolName);
  }

  protected get lspService(): LSPService {
    return LSPService.getInstance();
  }

  protected get projectRoot(): string {
    return this.config.getTargetDir();
  }

  protected resolvePath(filePath: string): string {
    return path.resolve(this.projectRoot, filePath);
  }

  protected getFileURL(filePath: string): string {
    return pathToFileURL(this.resolvePath(filePath)).toString();
  }

  /**
   * Subclasses must provide the LSP method name and parameters.
   */
  protected abstract getLSPRequest(): { method: string; lspParams: unknown };

  /**
   * Subclasses must provide a success display message.
   */
  protected abstract getSuccessDisplay(): string;

  /**
   * Subclasses must provide a failure display message.
   */
  protected abstract getFailureDisplay(): string;

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      // For workspace-wide tools, we might not have a file_path in params
      // but LSPService.sendRequest requires a file_path to determine the language server.
      // We use a dummy file in the root if not provided.
      const filePath = this.params.file_path ?? 'index.ts';
      const fullPath = this.resolvePath(filePath);
      const { method, lspParams } = this.getLSPRequest();
      const result = await this.lspService.sendRequest(
        this.projectRoot,
        fullPath,
        method,
        lspParams,
      );

      // Handle WorkspaceEdit if returned (mutation tools)
      if (isLSPWorkspaceEdit(result)) {
        const editResult = await this.lspService.applyWorkspaceEdit(
          this.projectRoot,
          result,
        );
        if (!editResult.success) {
          throw new Error(
            `Failed to apply workspace edit: ${editResult.error}`,
          );
        }
      }

      return {
        llmContent: JSON.stringify(result, null, 2),
        returnDisplay: this.getSuccessDisplay(),
      };
    } catch (error) {
      return {
        llmContent: `LSP Error: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: this.getFailureDisplay(),
        error: { message: String(error), type: ToolErrorType.EXECUTION_FAILED },
      };
    }
  }
}

// --- lsp_definition ---

interface LSPPositionParams {
  file_path: string;
  line: number;
  character: number;
}

class LSPDefinitionInvocation extends BaseLSPInvocation<LSPPositionParams> {
  getDescription(): string {
    return `Finding definition for symbol in ${this.params.file_path} at ${this.params.line}:${this.params.character}`;
  }

  protected getLSPRequest() {
    return {
      method: 'textDocument/definition',
      lspParams: {
        textDocument: { uri: this.getFileURL(this.params.file_path) },
        position: {
          line: this.params.line,
          character: this.params.character,
        },
      },
    };
  }

  protected getSuccessDisplay() {
    return 'Found definition(s).';
  }

  protected getFailureDisplay() {
    return 'Failed to find definition.';
  }
}

export class LSPDefinitionTool extends BaseDeclarativeTool<
  LSPPositionParams,
  ToolResult
> {
  static readonly Name = LSP_DEFINITION_TOOL_NAME;
  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LSPDefinitionTool.Name,
      'Go to Definition',
      LSP_DEFINITION_DEFINITION.base.description!,
      Kind.Search,
      LSP_DEFINITION_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }
  protected createInvocation(
    params: LSPPositionParams,
    messageBus: MessageBus,
  ): BaseToolInvocation<LSPPositionParams, ToolResult> {
    return new LSPDefinitionInvocation(
      this.config,
      params,
      messageBus,
      this.name,
    );
  }
  override getSchema(modelId?: string) {
    return resolveToolDeclaration(LSP_DEFINITION_DEFINITION, modelId);
  }
}

// --- lsp_references ---

class LSPReferencesInvocation extends BaseLSPInvocation<LSPPositionParams> {
  getDescription(): string {
    return `Finding references for symbol in ${this.params.file_path} at ${this.params.line}:${this.params.character}`;
  }

  protected getLSPRequest() {
    return {
      method: 'textDocument/references',
      lspParams: {
        textDocument: { uri: this.getFileURL(this.params.file_path) },
        position: {
          line: this.params.line,
          character: this.params.character,
        },
        context: { includeDeclaration: true },
      },
    };
  }

  protected getSuccessDisplay() {
    return 'Found reference(s).';
  }

  protected getFailureDisplay() {
    return 'Failed to find references.';
  }
}

export class LSPReferencesTool extends BaseDeclarativeTool<
  LSPPositionParams,
  ToolResult
> {
  static readonly Name = LSP_REFERENCES_TOOL_NAME;
  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LSPReferencesTool.Name,
      'Find References',
      LSP_REFERENCES_DEFINITION.base.description!,
      Kind.Search,
      LSP_REFERENCES_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }
  protected createInvocation(
    params: LSPPositionParams,
    messageBus: MessageBus,
  ): BaseToolInvocation<LSPPositionParams, ToolResult> {
    return new LSPReferencesInvocation(
      this.config,
      params,
      messageBus,
      this.name,
    );
  }
  override getSchema(modelId?: string) {
    return resolveToolDeclaration(LSP_REFERENCES_DEFINITION, modelId);
  }
}

// --- lsp_implementation ---

class LSPImplementationInvocation extends BaseLSPInvocation<LSPPositionParams> {
  getDescription(): string {
    return `Finding implementations for symbol in ${this.params.file_path} at ${this.params.line}:${this.params.character}`;
  }

  protected getLSPRequest() {
    return {
      method: 'textDocument/implementation',
      lspParams: {
        textDocument: { uri: this.getFileURL(this.params.file_path) },
        position: {
          line: this.params.line,
          character: this.params.character,
        },
      },
    };
  }

  protected getSuccessDisplay() {
    return 'Found implementation(s).';
  }

  protected getFailureDisplay() {
    return 'Failed to find implementations.';
  }
}

export class LSPImplementationTool extends BaseDeclarativeTool<
  LSPPositionParams,
  ToolResult
> {
  static readonly Name = LSP_IMPLEMENTATION_TOOL_NAME;
  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LSPImplementationTool.Name,
      'Go to Implementation',
      LSP_IMPLEMENTATION_DEFINITION.base.description!,
      Kind.Search,
      LSP_IMPLEMENTATION_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }
  protected createInvocation(
    params: LSPPositionParams,
    messageBus: MessageBus,
  ): BaseToolInvocation<LSPPositionParams, ToolResult> {
    return new LSPImplementationInvocation(
      this.config,
      params,
      messageBus,
      this.name,
    );
  }
  override getSchema(modelId?: string) {
    return resolveToolDeclaration(LSP_IMPLEMENTATION_DEFINITION, modelId);
  }
}

// --- lsp_symbols ---

interface LSPSymbolsParams {
  file_path: string;
}

class LSPSymbolsInvocation extends BaseLSPInvocation<LSPSymbolsParams> {
  getDescription(): string {
    return `Finding symbols in ${this.params.file_path}`;
  }

  protected getLSPRequest() {
    return {
      method: 'textDocument/documentSymbol',
      lspParams: {
        textDocument: { uri: this.getFileURL(this.params.file_path) },
      },
    };
  }

  protected getSuccessDisplay() {
    return 'Found symbol(s).';
  }

  protected getFailureDisplay() {
    return 'Failed to find symbols.';
  }
}

export class LSPSymbolsTool extends BaseDeclarativeTool<
  LSPSymbolsParams,
  ToolResult
> {
  static readonly Name = LSP_SYMBOLS_TOOL_NAME;
  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LSPSymbolsTool.Name,
      'Document Symbols',
      LSP_SYMBOLS_DEFINITION.base.description!,
      Kind.Search,
      LSP_SYMBOLS_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }
  protected createInvocation(
    params: LSPSymbolsParams,
    messageBus: MessageBus,
  ): BaseToolInvocation<LSPSymbolsParams, ToolResult> {
    return new LSPSymbolsInvocation(this.config, params, messageBus, this.name);
  }
  override getSchema(modelId?: string) {
    return resolveToolDeclaration(LSP_SYMBOLS_DEFINITION, modelId);
  }
}

// --- lsp_global_symbols ---

interface LSPGlobalSymbolsParams {
  file_path?: string;
  pattern: string;
}

class LSPGlobalSymbolsInvocation extends BaseLSPInvocation<LSPGlobalSymbolsParams> {
  getDescription(): string {
    return `Searching for global symbols matching "${this.params.pattern}"`;
  }

  protected getLSPRequest() {
    return {
      method: 'workspace/symbol',
      lspParams: {
        query: this.params.pattern,
      },
    };
  }

  protected getSuccessDisplay() {
    return 'Found global symbol(s).';
  }

  protected getFailureDisplay() {
    return 'Failed to find global symbols.';
  }
}

export class LSPGlobalSymbolsTool extends BaseDeclarativeTool<
  LSPGlobalSymbolsParams,
  ToolResult
> {
  static readonly Name = LSP_GLOBAL_SYMBOLS_TOOL_NAME;
  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LSPGlobalSymbolsTool.Name,
      'Workspace Symbols',
      LSP_GLOBAL_SYMBOLS_DEFINITION.base.description!,
      Kind.Search,
      LSP_GLOBAL_SYMBOLS_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }
  protected createInvocation(
    params: LSPGlobalSymbolsParams,
    messageBus: MessageBus,
  ): BaseToolInvocation<LSPGlobalSymbolsParams, ToolResult> {
    return new LSPGlobalSymbolsInvocation(
      this.config,
      params,
      messageBus,
      this.name,
    );
  }
  override getSchema(modelId?: string) {
    return resolveToolDeclaration(LSP_GLOBAL_SYMBOLS_DEFINITION, modelId);
  }
}

// --- lsp_type_definition ---

class LSPTypeDefinitionInvocation extends BaseLSPInvocation<LSPPositionParams> {
  getDescription(): string {
    return `Finding type definition for symbol in ${this.params.file_path} at ${this.params.line}:${this.params.character}`;
  }

  protected getLSPRequest() {
    return {
      method: 'textDocument/typeDefinition',
      lspParams: {
        textDocument: { uri: this.getFileURL(this.params.file_path) },
        position: {
          line: this.params.line,
          character: this.params.character,
        },
      },
    };
  }

  protected getSuccessDisplay() {
    return 'Found type definition(s).';
  }

  protected getFailureDisplay() {
    return 'Failed to find type definition.';
  }
}

export class LSPTypeDefinitionTool extends BaseDeclarativeTool<
  LSPPositionParams,
  ToolResult
> {
  static readonly Name = LSP_TYPE_DEFINITION_TOOL_NAME;
  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LSPTypeDefinitionTool.Name,
      'Go to Type Definition',
      LSP_TYPE_DEFINITION_DEFINITION.base.description!,
      Kind.Search,
      LSP_TYPE_DEFINITION_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }
  protected createInvocation(
    params: LSPPositionParams,
    messageBus: MessageBus,
  ): BaseToolInvocation<LSPPositionParams, ToolResult> {
    return new LSPTypeDefinitionInvocation(
      this.config,
      params,
      messageBus,
      this.name,
    );
  }
  override getSchema(modelId?: string) {
    return resolveToolDeclaration(LSP_TYPE_DEFINITION_DEFINITION, modelId);
  }
}

// --- lsp_hover ---

class LSPHoverInvocation extends BaseLSPInvocation<LSPPositionParams> {
  getDescription(): string {
    return `Getting hover information for symbol in ${this.params.file_path} at ${this.params.line}:${this.params.character}`;
  }

  protected getLSPRequest() {
    return {
      method: 'textDocument/hover',
      lspParams: {
        textDocument: { uri: this.getFileURL(this.params.file_path) },
        position: {
          line: this.params.line,
          character: this.params.character,
        },
      },
    };
  }

  protected getSuccessDisplay() {
    return 'Retrieved hover information.';
  }

  protected getFailureDisplay() {
    return 'Failed to get hover information.';
  }
}

export class LSPHoverTool extends BaseDeclarativeTool<
  LSPPositionParams,
  ToolResult
> {
  static readonly Name = LSP_HOVER_TOOL_NAME;
  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LSPHoverTool.Name,
      'Hover Information',
      LSP_HOVER_DEFINITION.base.description!,
      Kind.Search,
      LSP_HOVER_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }
  protected createInvocation(
    params: LSPPositionParams,
    messageBus: MessageBus,
  ): BaseToolInvocation<LSPPositionParams, ToolResult> {
    return new LSPHoverInvocation(this.config, params, messageBus, this.name);
  }
  override getSchema(modelId?: string) {
    return resolveToolDeclaration(LSP_HOVER_DEFINITION, modelId);
  }
}

// --- lsp_rename ---

interface LSPRenameParams extends LSPPositionParams {
  new_name: string;
}

class LSPRenameInvocation extends BaseLSPInvocation<LSPRenameParams> {
  getDescription(): string {
    return `Renaming symbol in ${this.params.file_path} at ${this.params.line}:${this.params.character} to "${this.params.new_name}"`;
  }

  protected getLSPRequest() {
    return {
      method: 'textDocument/rename',
      lspParams: {
        textDocument: { uri: this.getFileURL(this.params.file_path) },
        position: {
          line: this.params.line,
          character: this.params.character,
        },
        newName: this.params.new_name,
      },
    };
  }

  protected getSuccessDisplay() {
    return 'Renamed symbol across workspace.';
  }

  protected getFailureDisplay() {
    return 'Failed to rename symbol.';
  }
}

export class LSPRenameTool extends BaseDeclarativeTool<
  LSPRenameParams,
  ToolResult
> {
  static readonly Name = LSP_RENAME_TOOL_NAME;
  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LSPRenameTool.Name,
      'Rename Symbol',
      LSP_RENAME_DEFINITION.base.description!,
      Kind.Edit,
      LSP_RENAME_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }
  protected createInvocation(
    params: LSPRenameParams,
    messageBus: MessageBus,
  ): BaseToolInvocation<LSPRenameParams, ToolResult> {
    return new LSPRenameInvocation(this.config, params, messageBus, this.name);
  }
  override getSchema(modelId?: string) {
    return resolveToolDeclaration(LSP_RENAME_DEFINITION, modelId);
  }
}

// --- lsp_fix ---

class LSPFixInvocation extends BaseLSPInvocation<LSPPositionParams> {
  getDescription(): string {
    return `Getting code actions for ${this.params.file_path} at ${this.params.line}:${this.params.character}`;
  }

  protected getLSPRequest() {
    return {
      method: 'textDocument/codeAction',
      lspParams: {
        textDocument: { uri: this.getFileURL(this.params.file_path) },
        range: {
          start: { line: this.params.line, character: this.params.character },
          end: { line: this.params.line, character: this.params.character + 1 },
        },
        context: { diagnostics: [] },
      },
    };
  }

  protected getSuccessDisplay() {
    return 'Retrieved code actions.';
  }

  protected getFailureDisplay() {
    return 'Failed to get code actions.';
  }
}

export class LSPFixTool extends BaseDeclarativeTool<
  LSPPositionParams,
  ToolResult
> {
  static readonly Name = LSP_FIX_TOOL_NAME;
  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LSPFixTool.Name,
      'Code Actions / Fix',
      LSP_FIX_DEFINITION.base.description!,
      Kind.Edit,
      LSP_FIX_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }
  protected createInvocation(
    params: LSPPositionParams,
    messageBus: MessageBus,
  ): BaseToolInvocation<LSPPositionParams, ToolResult> {
    return new LSPFixInvocation(this.config, params, messageBus, this.name);
  }
  override getSchema(modelId?: string) {
    return resolveToolDeclaration(LSP_FIX_DEFINITION, modelId);
  }
}

// --- lsp_capabilities ---

interface LSPCapabilitiesParams {
  file_path: string;
}

class LSPCapabilitiesInvocation extends BaseLSPInvocation<LSPCapabilitiesParams> {
  getDescription(): string {
    return `Querying server capabilities for ${this.params.file_path}`;
  }

  protected getLSPRequest() {
    // This is a special case, we don't actually send a request to the server
    // but we use the existing sendRequest infrastructure if we wanted to.
    // However, LSPService now has a getCapabilities method.
    return { method: 'internal/capabilities', lspParams: {} };
  }

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const fullPath = this.resolvePath(this.params.file_path);
      const capabilities = await this.lspService.getCapabilities(
        this.projectRoot,
        fullPath,
      );
      return {
        llmContent: JSON.stringify(capabilities, null, 2),
        returnDisplay: this.getSuccessDisplay(),
      };
    } catch (error) {
      return {
        llmContent: `LSP Error: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: this.getFailureDisplay(),
        error: { message: String(error), type: ToolErrorType.EXECUTION_FAILED },
      };
    }
  }

  protected getSuccessDisplay() {
    return 'Retrieved server capabilities.';
  }

  protected getFailureDisplay() {
    return 'Failed to retrieve server capabilities.';
  }
}

export class LSPCapabilitiesTool extends BaseDeclarativeTool<
  LSPCapabilitiesParams,
  ToolResult
> {
  static readonly Name = LSP_CAPABILITIES_TOOL_NAME;
  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LSPCapabilitiesTool.Name,
      'Server Capabilities',
      LSP_CAPABILITIES_DEFINITION.base.description!,
      Kind.Search,
      LSP_CAPABILITIES_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }
  protected createInvocation(
    params: LSPCapabilitiesParams,
    messageBus: MessageBus,
  ): BaseToolInvocation<LSPCapabilitiesParams, ToolResult> {
    return new LSPCapabilitiesInvocation(
      this.config,
      params,
      messageBus,
      this.name,
    );
  }
  override getSchema(modelId?: string) {
    return resolveToolDeclaration(LSP_CAPABILITIES_DEFINITION, modelId);
  }
}
