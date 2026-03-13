/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node.js';
import type {
  InitializeParams,
  InitializeResult,
  Position,
  Range,
} from 'vscode-languageserver-protocol';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Native position representation (1-indexed).
 */
export interface LSPPosition {
  line: number;
  character: number;
}

/**
 * Native location representation (1-indexed).
 */
export interface LSPLocation {
  uri: string;
  range: {
    start: LSPPosition;
    end: LSPPosition;
  };
}

interface LSPRequestParams {
  position?: Position;
  textDocument?: { uri: string };
  [key: string]: unknown;
}

interface ServerInstance {
  process: ChildProcess;
  connection: MessageConnection;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function isLSPPosition(val: unknown): val is Position {
  if (!isObject(val)) return false;
  return typeof val.line === 'number' && typeof val.character === 'number';
}

function isLSPRange(val: unknown): val is Range {
  if (!isObject(val)) return false;
  return isLSPPosition(val.start) && isLSPPosition(val.end);
}

function isLSPRequestParams(params: unknown): params is LSPRequestParams {
  if (!isObject(params)) return false;
  if ('position' in params && !isLSPPosition(params.position)) return false;
  return true;
}

/**
 * Manages the lifecycle of Language Servers and provides a unified interface
 * for executing LSP requests.
 */
export class LSPService {
  private static instance: LSPService | undefined;
  private readonly servers = new Map<string, ServerInstance>();
  private readonly pendingConnections = new Map<
    string,
    Promise<MessageConnection>
  >();

  // Mapping of extensions to default language server commands
  private readonly languageToCommand: Record<string, string[]> = {
    typescript: ['typescript-language-server', '--stdio'],
    javascript: ['typescript-language-server', '--stdio'],
    python: ['pyright-langserver', '--stdio'],
    go: ['gopls'],
    rust: ['rust-analyzer'],
  };

  private constructor() {
    // Ensure cleanup on main process exit
    process.on('exit', () => {
      void this.shutdown();
    });
  }

  /**
   * Returns the singleton instance of the LSPService.
   */
  static getInstance(): LSPService {
    if (!LSPService.instance) {
      LSPService.instance = new LSPService();
    }
    return LSPService.instance;
  }

  /**
   * Resolves the appropriate language ID for a file path.
   */
  getLanguageId(filePath: string): string | undefined {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.py':
        return 'python';
      case '.go':
        return 'go';
      case '.rs':
        return 'rust';
      default:
        return undefined;
    }
  }

  /**
   * Gets or creates a connection to a language server for the given project and language.
   * Uses a promise-pooling pattern to prevent race conditions during server startup.
   */
  private async getOrCreateConnection(
    projectRoot: string,
    languageId: string,
  ): Promise<MessageConnection> {
    const key = `${projectRoot}:${languageId}`;
    const existing = this.servers.get(key);
    if (existing) return existing.connection;

    // Check for a pending connection to avoid duplicate spawns
    const pending = this.pendingConnections.get(key);
    if (pending) return pending;

    const connectionPromise = this.spawnServer(projectRoot, languageId, key);
    this.pendingConnections.set(key, connectionPromise);

    try {
      return await connectionPromise;
    } finally {
      this.pendingConnections.delete(key);
    }
  }

  private async spawnServer(
    projectRoot: string,
    languageId: string,
    key: string,
  ): Promise<MessageConnection> {
    const command = this.languageToCommand[languageId];
    if (!command) {
      throw new Error(
        `No language server configured for language: ${languageId}`,
      );
    }

    debugLogger.log(
      `Starting LSP server for ${languageId} at ${projectRoot}: ${command.join(' ')}`,
    );

    const childProcess = spawn(command[0], command.slice(1), {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: process.env,
    });

    childProcess.on('error', (err) => {
      debugLogger.error(`LSP Server (${languageId}) spawn error:`, err);
    });

    childProcess.on('exit', (code) => {
      debugLogger.log(`LSP Server (${languageId}) exited with code ${code}`);
      this.servers.delete(key);
    });

    if (!childProcess.stdout || !childProcess.stdin) {
      childProcess.kill();
      throw new Error('Failed to open stdio for LSP server');
    }

    const connection = createMessageConnection(
      new StreamMessageReader(childProcess.stdout),
      new StreamMessageWriter(childProcess.stdin),
    );

    connection.listen();

    const rootUri = pathToFileURL(projectRoot).toString();
    const initializeParams: InitializeParams = {
      processId: process.pid,
      rootUri,
      capabilities: {
        textDocument: {
          definition: { dynamicRegistration: true },
          references: { dynamicRegistration: true },
          implementation: { dynamicRegistration: true },
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
          },
        },
      },
      workspaceFolders: [
        {
          uri: rootUri,
          name: path.basename(projectRoot),
        },
      ],
    };

    try {
      const result = await connection.sendRequest<InitializeResult>(
        'initialize',
        initializeParams,
      );
      debugLogger.log(
        `LSP Server (${languageId}) initialized with capabilities:`,
        result.capabilities,
      );
      await connection.sendNotification('initialized', {});

      this.servers.set(key, { process: childProcess, connection });
      return connection;
    } catch (error) {
      childProcess.kill();
      throw new Error(`Failed to initialize LSP server: ${String(error)}`);
    }
  }

  /**
   * Executes an LSP request, handling coordinate normalization (1-indexed to 0-indexed).
   */
  async sendRequest(
    projectRoot: string,
    filePath: string,
    method: string,
    params: unknown,
  ): Promise<unknown> {
    const languageId = this.getLanguageId(filePath);
    if (!languageId) {
      throw new Error(
        `Unsupported file type for LSP: ${path.extname(filePath)}`,
      );
    }

    const connection = await this.getOrCreateConnection(
      projectRoot,
      languageId,
    );

    // Normalize coordinates if present in params (1-indexed -> 0-indexed)
    let lspParams = params;
    if (isLSPRequestParams(params) && params.position) {
      lspParams = {
        ...params,
        position: {
          line: params.position.line - 1,
          character: params.position.character - 1,
        },
      };
    }

    const result = await connection.sendRequest(method, lspParams);

    // Denormalize coordinates in result (0-indexed -> 1-indexed)
    return this.normalizeResult(result);
  }

  /**
   * Recursively normalizes coordinates in LSP results from 0-indexed to 1-indexed.
   */
  private normalizeResult(result: unknown): unknown {
    if (!result) return result;

    if (Array.isArray(result)) {
      const list: unknown[] = [];
      for (const item of result) {
        list.push(this.normalizeResult(item));
      }
      return list;
    }

    if (isObject(result)) {
      const res: Record<string, unknown> = { ...result };

      // Handle Range (start, end)
      if (isLSPRange(result)) {
        res.start = {
          line: result.start.line + 1,
          character: result.start.character + 1,
        };
        res.end = {
          line: result.end.line + 1,
          character: result.end.character + 1,
        };
      }

      // Handle properties that might contain Locations or Ranges recursively
      const keysToNormalize = [
        'location',
        'range',
        'selectionRange',
        'children',
      ];
      for (const key of keysToNormalize) {
        const val = res[key];
        if (val) {
          res[key] = this.normalizeResult(val);
        }
      }

      return res;
    }

    return result;
  }

  /**
   * Shuts down all active language server connections and terminates processes.
   */
  async shutdown(): Promise<void> {
    const cleanupPromises: Array<Promise<void>> = [];

    for (const [
      key,
      { connection, process: childProcess },
    ] of this.servers.entries()) {
      const cleanup = async () => {
        try {
          // Graceful shutdown
          await connection.sendRequest('shutdown');
          await connection.sendNotification('exit');
        } catch (_e) {
          // Force terminate if graceful fails
          childProcess.kill('SIGKILL');
        } finally {
          this.servers.delete(key);
        }
      };
      cleanupPromises.push(cleanup());
    }

    await Promise.allSettled(cleanupPromises);
  }
}
