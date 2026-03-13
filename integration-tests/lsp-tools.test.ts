/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import {
  TestRig,
  createToolCallErrorMessage,
  printDebugInfo,
  assertModelHasOutput,
  checkModelOutputContent,
} from './test-helper.js';

describe('lsp tools integration', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should be able to list symbols in a typescript file using lsp_symbols', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    await rig.setup('should be able to list symbols', {
      fakeResponsesPath: join(import.meta.dirname, 'lsp-tools.responses'),
      settings: { tools: { core: ['lsp_symbols', 'write_file', 'read_file'] } },
    });

    // Write a mock typescript file to the workspace
    const fs = await import('node:fs');
    const path = await import('node:path');
    fs.writeFileSync(
      path.join(rig.testDir!, 'mockService.ts'),
      `
      export class MockService {
        constructor() {}
        public doSomething() {
          return true;
        }
      }
      export const CONSTANT_VAL = 42;
      `,
    );

    const prompt = `Use the lsp_symbols tool to find the symbols in mockService.ts and list them in your response.`;

    const result = await rig.run({ args: prompt });

    const foundToolCall = await rig.waitForToolCall('lsp_symbols');

    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }

    const allTools = rig.readToolLogs();
    expect(
      foundToolCall,
      createToolCallErrorMessage(
        'lsp_symbols',
        allTools.map((t) => t.toolRequest.name),
        result,
      ),
    ).toBeTruthy();

    assertModelHasOutput(result);
    checkModelOutputContent(result, {
      expectedContent: 'MockService',
      testName: 'LSP Symbols Test',
    });
    checkModelOutputContent(result, {
      expectedContent: 'CONSTANT_VAL',
      testName: 'LSP Symbols Test - Constant',
    });
  });
});
