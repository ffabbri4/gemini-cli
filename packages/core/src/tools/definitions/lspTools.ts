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
  LSP_GLOBAL_SYMBOLS_TOOL_NAME,
  LSP_TYPE_DEFINITION_TOOL_NAME,
  LSP_HOVER_TOOL_NAME,
  LSP_RENAME_TOOL_NAME,
  LSP_FIX_TOOL_NAME,
  LSP_CAPABILITIES_TOOL_NAME,
  LSP_PARAM_LINE,
  LSP_PARAM_CHARACTER,
  LSP_PARAM_NEW_NAME,
  PARAM_FILE_PATH,
  PARAM_PATTERN,
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

export const LSP_GLOBAL_SYMBOLS_DEFINITION: ToolDefinition = {
  base: {
    name: LSP_GLOBAL_SYMBOLS_TOOL_NAME,
    description:
      'LSP workspace/symbol. Searches for symbols matching the given pattern across the entire workspace.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PARAM_PATTERN]: {
          type: 'string',
          description: 'The symbol name or pattern to search for.',
        },
      },
      required: [PARAM_PATTERN],
    },
  },
};

export const LSP_TYPE_DEFINITION_DEFINITION: ToolDefinition = {
  base: {
    name: LSP_TYPE_DEFINITION_TOOL_NAME,
    description:
      'LSP textDocument/typeDefinition. Returns Location[] for the type definition of the symbol at the given 1-indexed position.',
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

export const LSP_HOVER_DEFINITION: ToolDefinition = {
  base: {
    name: LSP_HOVER_TOOL_NAME,
    description:
      'LSP textDocument/hover. Returns documentation and type information for the symbol at the given 1-indexed position.',
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

export const LSP_RENAME_DEFINITION: ToolDefinition = {
  base: {
    name: LSP_RENAME_TOOL_NAME,
    description:
      'LSP textDocument/rename. Performs a workspace-wide rename of the symbol at the given 1-indexed position.',
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
        [LSP_PARAM_NEW_NAME]: {
          type: 'string',
          description: 'The new name for the symbol.',
        },
      },
      required: [
        PARAM_FILE_PATH,
        LSP_PARAM_LINE,
        LSP_PARAM_CHARACTER,
        LSP_PARAM_NEW_NAME,
      ],
    },
  },
};

export const LSP_FIX_DEFINITION: ToolDefinition = {
  base: {
    name: LSP_FIX_TOOL_NAME,
    description:
      'LSP textDocument/codeAction. Returns available quick fixes and refactorings for the given 1-indexed range.',
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

export const LSP_CAPABILITIES_DEFINITION: ToolDefinition = {
  base: {
    name: LSP_CAPABILITIES_TOOL_NAME,
    description:
      "Returns the language server's capabilities for the given file type (e.g., what features it supports).",
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PARAM_FILE_PATH]: {
          type: 'string',
          description: 'A file path to determine the language server to query.',
        },
      },
      required: [PARAM_FILE_PATH],
    },
  },
};
