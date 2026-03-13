/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LSPDefinitionTool,
  LSPSymbolsTool,
  LSPReferencesTool,
  LSPImplementationTool,
} from './lspTools.js';
import { LSPService } from '../services/lspService.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

vi.mock('../services/lspService.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../services/lspService.js')>();
  return {
    ...actual,
    LSPService: {
      getInstance: vi.fn().mockReturnValue({
        sendRequest: vi.fn(),
        findProjectRoot: vi.fn().mockResolvedValue('/mock/project/root'),
      }),
    },
  };
});

describe('LSP Tools Integration', () => {
  let mockConfig: Config;
  let mockBus: MessageBus;
  let lspServiceMock: {
    sendRequest: ReturnType<typeof vi.fn>;
    findProjectRoot: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue('/mock/project/root'),
    } as unknown as Config;
    mockBus = {
      emit: vi.fn(),
    } as unknown as MessageBus;

    lspServiceMock = LSPService.getInstance() as unknown as {
      sendRequest: ReturnType<typeof vi.fn>;
      findProjectRoot: ReturnType<typeof vi.fn>;
    };
  });

  describe('LSPDefinitionTool', () => {
    it('executes textDocument/definition and formats success', async () => {
      lspServiceMock.sendRequest.mockResolvedValueOnce([
        { uri: 'file:///mock/project/root/test.ts' },
      ]);
      const tool = new LSPDefinitionTool(mockConfig, mockBus);
      // @ts-expect-error Accessing protected method for testing
      const invocation = tool.createInvocation(
        { file_path: 'test.ts', line: 10, character: 5 },
        mockBus,
      );

      const result = await invocation.execute(new AbortController().signal);

      expect(lspServiceMock.sendRequest).toHaveBeenCalledWith(
        expect.stringContaining('test.ts'),
        'textDocument/definition',
        {
          textDocument: { uri: 'file:///mock/project/root/test.ts' },
          position: { line: 10, character: 5 },
        },
        undefined,
      );
      expect(result.returnDisplay).toBe('Found definition(s).');
      expect(result.llmContent).toContain('file:///mock/project/root/test.ts');
    });

    it('handles errors gracefully', async () => {
      lspServiceMock.sendRequest.mockRejectedValueOnce(
        new Error('LSP Timeout'),
      );
      const tool = new LSPDefinitionTool(mockConfig, mockBus);
      // @ts-expect-error Accessing protected method for testing
      const invocation = tool.createInvocation(
        { file_path: 'test.ts', line: 10, character: 5 },
        mockBus,
      );

      const result = await invocation.execute(new AbortController().signal);

      expect(result.returnDisplay).toBe('Failed to find definition.');
      expect(result.llmContent).toContain('LSP Error: LSP Timeout');
    });
  });

  describe('LSPSymbolsTool', () => {
    it('executes textDocument/documentSymbol and formats success', async () => {
      lspServiceMock.sendRequest.mockResolvedValueOnce([{ name: 'MyClass' }]);
      const tool = new LSPSymbolsTool(mockConfig, mockBus);
      // @ts-expect-error Accessing protected method for testing
      const invocation = tool.createInvocation(
        { file_path: 'test.ts' },
        mockBus,
      );

      const result = await invocation.execute(new AbortController().signal);

      expect(lspServiceMock.sendRequest).toHaveBeenCalledWith(
        expect.stringContaining('test.ts'),
        'textDocument/documentSymbol',
        {
          textDocument: { uri: 'file:///mock/project/root/test.ts' },
        },
        undefined,
      );
      expect(result.returnDisplay).toBe('Found symbol(s).');
    });
  });

  describe('LSPReferencesTool', () => {
    it('executes textDocument/references and formats success', async () => {
      lspServiceMock.sendRequest.mockResolvedValueOnce([]);
      const tool = new LSPReferencesTool(mockConfig, mockBus);
      // @ts-expect-error Accessing protected method for testing
      const invocation = tool.createInvocation(
        { file_path: 'test.ts', line: 1, character: 1 },
        mockBus,
      );

      const result = await invocation.execute(new AbortController().signal);

      expect(lspServiceMock.sendRequest).toHaveBeenCalledWith(
        expect.stringContaining('test.ts'),
        'textDocument/references',
        expect.objectContaining({
          context: { includeDeclaration: true },
        }),
        undefined,
      );
      expect(result.returnDisplay).toBe('Found reference(s).');
    });
  });

  describe('LSPImplementationTool', () => {
    it('executes textDocument/implementation and formats success', async () => {
      lspServiceMock.sendRequest.mockResolvedValueOnce([]);
      const tool = new LSPImplementationTool(mockConfig, mockBus);
      // @ts-expect-error Accessing protected method for testing
      const invocation = tool.createInvocation(
        { file_path: 'test.ts', line: 1, character: 1 },
        mockBus,
      );

      const result = await invocation.execute(new AbortController().signal);

      expect(lspServiceMock.sendRequest).toHaveBeenCalledWith(
        expect.stringContaining('test.ts'),
        'textDocument/implementation',
        expect.anything(),
        undefined,
      );
      expect(result.returnDisplay).toBe('Found implementation(s).');
    });
  });
});
