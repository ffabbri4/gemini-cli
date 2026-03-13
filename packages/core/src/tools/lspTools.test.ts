/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LSPService } from '../services/lspService.js';

// We need to mock the parts that LSPService uses to avoid spawning actual processes
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn(),
    stdin: { on: vi.fn() },
    stdout: { on: vi.fn() },
    kill: vi.fn(),
  })),
}));

vi.mock('vscode-jsonrpc/node.js', () => ({
  createMessageConnection: vi.fn(() => ({
    listen: vi.fn(),
    sendRequest: vi.fn(),
    sendNotification: vi.fn(),
    onNotification: vi.fn(),
  })),
  StreamMessageReader: vi.fn(),
  StreamMessageWriter: vi.fn(),
}));

describe('LSPService Normalization', () => {
  let lspService: LSPService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lspService = (LSPService as any).getInstance();
    // Reset the internal servers map for testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (lspService as any).servers = new Map();
  });

  it('should convert 1-indexed coordinates to 0-indexed in requests', async () => {
    const mockConnection = {
      listen: vi.fn(),
      sendRequest: vi.fn().mockImplementation((method) => {
        if (method === 'initialize')
          return Promise.resolve({ capabilities: {} });
        return Promise.resolve({
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
        });
      }),
      sendNotification: vi.fn(),
    };

    // Inject mock connection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (lspService as any).getOrCreateConnection = vi
      .fn()
      .mockResolvedValue(mockConnection);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await lspService.sendRequest<any>(
      '/root',
      'test.ts',
      'textDocument/definition',
      { position: { line: 10, character: 5 } },
    )) as { range: { start: { line: number; character: number } } };

    // Verify normalization (1-indexed 10:5 -> 0-indexed 9:4)
    expect(mockConnection.sendRequest).toHaveBeenCalledWith(
      'textDocument/definition',
      expect.objectContaining({
        position: { line: 9, character: 4 },
      }),
    );

    // Verify denormalization (0-indexed 0:0 -> 1-indexed 1:1)
    expect(result.range.start).toEqual({ line: 1, character: 1 });
  });
});
