/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  denormalizeLSPResult,
  normalizeLSPParams,
  LSPService,
  isObject,
  isLSPPosition,
  isLSPRange,
} from './lspService.js';
import type { Range } from 'vscode-languageserver-protocol';
import type { LSPRequestParams } from './lspService.js';

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

describe('LSPService Type Guards', () => {
  it('identifies objects correctly', () => {
    expect(isObject({})).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject('string')).toBe(false);
  });

  it('identifies positions correctly', () => {
    expect(isLSPPosition({ line: 1, character: 1 })).toBe(true);
    expect(isLSPPosition({ line: 1 })).toBe(false);
    expect(isLSPPosition(null)).toBe(false);
  });

  it('identifies ranges correctly', () => {
    expect(
      isLSPRange({
        start: { line: 1, character: 1 },
        end: { line: 2, character: 2 },
      }),
    ).toBe(true);
    expect(isLSPRange({ start: { line: 1, character: 1 } })).toBe(false);
  });
});

describe('LSP Coordinate Normalization (Pure Functions)', () => {
  it('normalizeLSPParams converts 1-indexed to 0-indexed', () => {
    const input: LSPRequestParams = {
      position: { line: 10, character: 5 },
      textDocument: { uri: 'file://test.ts' },
    };
    const output = normalizeLSPParams(input) as LSPRequestParams;

    expect(output.position).toEqual({ line: 9, character: 4 });
    expect(output.textDocument).toEqual(input.textDocument);
    // Ensure immutability
    expect(input.position?.line).toBe(10);
  });

  it('denormalizeLSPResult converts 0-indexed to 1-indexed', () => {
    const input = {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 5, character: 10 },
      },
    };
    const output = denormalizeLSPResult(input) as typeof input;

    expect(output.range.start).toEqual({ line: 1, character: 1 });
    expect(output.range.end).toEqual({ line: 6, character: 11 });
    // Ensure immutability
    expect(input.range.start.line).toBe(0);
  });

  it('denormalizeLSPResult handles arrays', () => {
    const input = [
      { start: { line: 0, character: 0 }, end: { line: 1, character: 1 } },
    ];
    const output = denormalizeLSPResult(input) as typeof input;

    expect(output[0].start).toEqual({ line: 1, character: 1 });
  });

  // Property-based Testing Simulation
  it('Property Test: denormalize(normalize(pos)) === pos', () => {
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
      const originalLine = Math.floor(Math.random() * 1000) + 1;
      const originalChar = Math.floor(Math.random() * 500) + 1;

      const input: LSPRequestParams = {
        position: { line: originalLine, character: originalChar },
      };

      const normalized = normalizeLSPParams(input) as LSPRequestParams;
      // In a real LSP loop, normalized params are processed and returned as ranges/locations.
      // We simulate returning the exact same position as a range.
      const simulatedResult = {
        start: { ...normalized.position! },
        end: { ...normalized.position! },
      };

      const output = denormalizeLSPResult(simulatedResult) as Range;

      expect(output.start.line).toBe(originalLine);
      expect(output.start.character).toBe(originalChar);
      expect(output.end.line).toBe(originalLine);
      expect(output.end.character).toBe(originalChar);
    }
  });
});

describe('LSPService Singleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maintains a singleton instance', () => {
    const instance1 = LSPService.getInstance();
    const instance2 = LSPService.getInstance();
    expect(instance1).toBe(instance2);
  });
  it('identifies correct language IDs', async () => {
    const service = LSPService.getInstance();
    expect(await service.getLanguageId('test.ts')).toBe('typescript');
    expect(await service.getLanguageId('test.tsx')).toBe('typescript');
    expect(await service.getLanguageId('test.js')).toBe('javascript');
    expect(await service.getLanguageId('test.py')).toBe('python');
    expect(await service.getLanguageId('test.txt')).toBeUndefined();
  });

  it('discovers the project root correctly', async () => {
    const service = LSPService.getInstance();
    const currentFile = import.meta.filename;
    const root = await service.findProjectRoot(currentFile);

    // In this repo, the root should contain package.json
    expect(root).toBeDefined();
    expect(root.length).toBeGreaterThan(0);
    // It should be an absolute path
    expect(root.startsWith('/')).toBe(true);
  });
});
