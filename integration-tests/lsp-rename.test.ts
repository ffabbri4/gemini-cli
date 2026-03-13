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

describe('lsp rename integration', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should be able to rename a symbol using lsp_rename', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    await rig.setup('should be able to rename a symbol', {
      fakeResponsesPath: join(import.meta.dirname, 'lsp-rename.responses'),
      settings: { tools: { core: ['lsp_rename', 'read_file', 'lsp_symbols'] } },
    });

    // Write a mock typescript file to the workspace
    const fs = await import('node:fs');
    const path = await import('node:path');
    const mockFilePath = path.join(rig.testDir!, 'mockRename.ts');
    const tsconfigPath = path.join(rig.testDir!, 'tsconfig.json');
    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'node',
          strict: true,
        },
      }),
    );
    fs.writeFileSync(mockFilePath, 'export class OldClassName {}');

    const prompt = `Use the lsp_symbols tool to find symbols in mockRename.ts, then use the lsp_rename tool to rename OldClassName to NewClassName in mockRename.ts. It is on line 1 at character 15.`;

    const result = await rig.run({ args: prompt });

    const foundToolCall = await rig.waitForToolCall('lsp_rename');

    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }

    const allTools = rig.readToolLogs();
    expect(
      foundToolCall,
      createToolCallErrorMessage(
        'lsp_rename',
        allTools.map((t) => t.toolRequest.name),
        result,
      ),
    ).toBeTruthy();

    assertModelHasOutput(result);

    // Verify file content was actually changed on disk
    const updatedContent = fs.readFileSync(mockFilePath, 'utf-8');
    expect(updatedContent).toContain('class NewClassName');
    expect(updatedContent).not.toContain('OldClassName');

    checkModelOutputContent(result, {
      expectedContent: 'Renamed',
      testName: 'LSP Rename Test',
    });
  });
});
