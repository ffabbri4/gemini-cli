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
} from './tool-names.js';
import {
  LSP_DEFINITION_DEFINITION,
  LSP_REFERENCES_DEFINITION,
  LSP_SYMBOLS_DEFINITION,
  LSP_IMPLEMENTATION_DEFINITION,
} from './definitions/lspTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { LSPService } from '../services/lspService.js';

// --- Base LSP Invocation ---

abstract class BaseLSPInvocation<
  TParams extends { file_path: string },
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

  abstract execute(_signal: AbortSignal): Promise<ToolResult>;
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

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const fullPath = this.resolvePath(this.params.file_path);
      const result = await this.lspService.sendRequest(
        this.projectRoot,
        fullPath,
        'textDocument/definition',
        {
          textDocument: { uri: this.getFileURL(this.params.file_path) },
          position: {
            line: this.params.line,
            character: this.params.character,
          },
        },
      );

      return {
        llmContent: JSON.stringify(result, null, 2),
        returnDisplay: 'Found definition(s).',
      };
    } catch (error) {
      return {
        llmContent: `LSP Error: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: 'Failed to find definition.',
        error: { message: String(error), type: ToolErrorType.EXECUTION_FAILED },
      };
    }
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

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const fullPath = this.resolvePath(this.params.file_path);
      const result = await this.lspService.sendRequest(
        this.projectRoot,
        fullPath,
        'textDocument/references',
        {
          textDocument: { uri: this.getFileURL(this.params.file_path) },
          position: {
            line: this.params.line,
            character: this.params.character,
          },
          context: { includeDeclaration: true },
        },
      );

      return {
        llmContent: JSON.stringify(result, null, 2),
        returnDisplay: 'Found reference(s).',
      };
    } catch (error) {
      return {
        llmContent: `LSP Error: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: 'Failed to find references.',
        error: { message: String(error), type: ToolErrorType.EXECUTION_FAILED },
      };
    }
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

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const fullPath = this.resolvePath(this.params.file_path);
      const result = await this.lspService.sendRequest(
        this.projectRoot,
        fullPath,
        'textDocument/implementation',
        {
          textDocument: { uri: this.getFileURL(this.params.file_path) },
          position: {
            line: this.params.line,
            character: this.params.character,
          },
        },
      );

      return {
        llmContent: JSON.stringify(result, null, 2),
        returnDisplay: 'Found implementation(s).',
      };
    } catch (error) {
      return {
        llmContent: `LSP Error: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: 'Failed to find implementations.',
        error: { message: String(error), type: ToolErrorType.EXECUTION_FAILED },
      };
    }
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

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const fullPath = this.resolvePath(this.params.file_path);
      const result = await this.lspService.sendRequest(
        this.projectRoot,
        fullPath,
        'textDocument/documentSymbol',
        {
          textDocument: { uri: this.getFileURL(this.params.file_path) },
        },
      );

      return {
        llmContent: JSON.stringify(result, null, 2),
        returnDisplay: 'Found symbol(s).',
      };
    } catch (error) {
      return {
        llmContent: `LSP Error: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: 'Failed to find symbols.',
        error: { message: String(error), type: ToolErrorType.EXECUTION_FAILED },
      };
    }
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
