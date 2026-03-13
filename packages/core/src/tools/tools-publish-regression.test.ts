/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { BaseToolInvocation } from './tools.js';
import type { ToolResult } from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class MockToolInvocation extends BaseToolInvocation<any, ToolResult> {
  getDescription() {
    return 'Mock Tool';
  }
  async execute() {
    return { returnDisplay: 'Success', llmContent: 'Success' };
  }
}

describe('Tool Invocation Publish Regression', () => {
  it('should not throw "Cannot read properties of undefined (reading \'publish\')" when messageBus is undefined', async () => {
    // Deliberately passing undefined for the MessageBus to simulate the broken environment
    const tool = new MockToolInvocation(
      {},
      undefined as unknown as MessageBus,
      'mock_tool',
    );
    const abortSignal = new AbortController().signal;

    // In the broken version, getMessageBusDecision (called inside shouldConfirmExecute)
    // or publishPolicyUpdate would crash here because this.messageBus was undefined
    // but the code attempted this.messageBus.publish()
    await expect(tool.shouldConfirmExecute(abortSignal)).resolves.not.toThrow();
  });
});
