/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LSP_DEFINITION_TOOL_NAME,
  LSP_REFERENCES_TOOL_NAME,
  LSP_SYMBOLS_TOOL_NAME,
  LSP_IMPLEMENTATION_TOOL_NAME,
  LSP_PARAM_LINE,
  LSP_PARAM_CHARACTER,
  PARAM_FILE_PATH,
} from './base-declarations.js';
import type { ToolDefinition } from './types.js';

export const LSP_DEFINITION_DEFINITION: ToolDefinition = {
  base: {
    name: LSP_DEFINITION_TOOL_NAME,
    description:
      'LSP textDocument/definition. Returns Location[] for the symbol at the given 1-indexed position.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PARAM_FILE_PATH]: { type: 'string', description: 'Target file path.' },
        [LSP_PARAM_LINE]: {
          type: 'number',
          description: '1-indexed line number.',
        },
        [LSP_PARAM_CHARACTER]: {
          type: 'number',
          description: '1-indexed character offset.',
        },
      },
      required: [PARAM_FILE_PATH, LSP_PARAM_LINE, LSP_PARAM_CHARACTER],
    },
  },
};

export const LSP_REFERENCES_DEFINITION: ToolDefinition = {
  base: {
    name: LSP_REFERENCES_TOOL_NAME,
    description:
      'LSP textDocument/references. Returns Location[] of all usages for the symbol at the given 1-indexed position.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PARAM_FILE_PATH]: { type: 'string', description: 'Target file path.' },
        [LSP_PARAM_LINE]: {
          type: 'number',
          description: '1-indexed line number.',
        },
        [LSP_PARAM_CHARACTER]: {
          type: 'number',
          description: '1-indexed character offset.',
        },
      },
      required: [PARAM_FILE_PATH, LSP_PARAM_LINE, LSP_PARAM_CHARACTER],
    },
  },
};

export const LSP_IMPLEMENTATION_DEFINITION: ToolDefinition = {
  base: {
    name: LSP_IMPLEMENTATION_TOOL_NAME,
    description:
      'LSP textDocument/implementation. Returns Location[] of implementations for the symbol at the given 1-indexed position.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PARAM_FILE_PATH]: { type: 'string', description: 'Target file path.' },
        [LSP_PARAM_LINE]: {
          type: 'number',
          description: '1-indexed line number.',
        },
        [LSP_PARAM_CHARACTER]: {
          type: 'number',
          description: '1-indexed character offset.',
        },
      },
      required: [PARAM_FILE_PATH, LSP_PARAM_LINE, LSP_PARAM_CHARACTER],
    },
  },
};

export const LSP_SYMBOLS_DEFINITION: ToolDefinition = {
  base: {
    name: LSP_SYMBOLS_TOOL_NAME,
    description:
      'LSP textDocument/documentSymbol. Returns a hierarchical list of symbols (classes, methods, variables) defined in the given file.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PARAM_FILE_PATH]: { type: 'string', description: 'Target file path.' },
      },
      required: [PARAM_FILE_PATH],
    },
  },
};
