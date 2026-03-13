/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
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
  ServerCapabilities,
} from 'vscode-languageserver-protocol';
import { debugLogger } from '../utils/debugLogger.js';
import { CoreEvent, coreEvents } from '../utils/events.js';

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

/**
 * A single text edit.
 */
export interface LSPTextEdit {
  start: LSPPosition;
  end: LSPPosition;
  newText: string;
}

/**
 * Simplified WorkspaceEdit for tool output.
 */
export interface LSPWorkspaceEdit {
  changes?: Record<string, LSPTextEdit[]>;
  documentChanges?: Array<
    | {
        textDocument: { uri: string; version: number | null };
        edits: LSPTextEdit[];
      }
    | { kind: 'create'; uri: string }
    | { kind: 'rename'; oldUri: string; newUri: string }
    | { kind: 'delete'; uri: string }
  >;
}

/**
 * Protocol-specific types for parsing raw JSON-RPC responses.
 */
interface ProtocolPosition {
  line: number;
  character: number;
}

interface ProtocolRange {
  start: ProtocolPosition;
  end: ProtocolPosition;
}

interface ProtocolTextEdit {
  range: ProtocolRange;
  newText: string;
}

interface ProtocolTextDocumentIdentifier {
  uri: string;
  version: number | null;
}

interface ProtocolTextDocumentEdit {
  textDocument: ProtocolTextDocumentIdentifier;
  edits: ProtocolTextEdit[];
}

interface ProtocolFileOperation {
  kind: 'create' | 'rename' | 'delete';
  uri?: string;
  oldUri?: string;
  newUri?: string;
}

interface ProtocolWorkspaceEdit {
  changes?: Record<string, ProtocolTextEdit[]>;
  documentChanges?: Array<ProtocolTextDocumentEdit | ProtocolFileOperation>;
}

/**
 * Safe property existence check to satisfy no-restricted-syntax.
 */
function hasProperty<T extends string>(
  obj: object,
  prop: T,
): obj is { [K in T]: unknown } {
  return prop in obj;
}

/**
 * Type guard for ProtocolTextDocumentEdit.
 */
function isProtocolTextDocumentEdit(
  dc: object,
): dc is ProtocolTextDocumentEdit {
  return (
    hasProperty(dc, 'textDocument') &&
    hasProperty(dc, 'edits') &&
    Array.isArray(dc['edits'])
  );
}

/**
 * Type guard for ProtocolFileOperation.
 */
function isProtocolFileOperation(dc: object): dc is ProtocolFileOperation {
  if (!hasProperty(dc, 'kind')) return false;
  const kind = dc['kind'];
  return (
    typeof kind === 'string' &&
    ['create', 'rename', 'delete'].includes(kind) &&
    (hasProperty(dc, 'uri') ||
      (hasProperty(dc, 'oldUri') && hasProperty(dc, 'newUri')))
  );
}

/**
 * Type guard for LSPWorkspaceEdit.
 */
export function isLSPWorkspaceEdit(val: unknown): val is LSPWorkspaceEdit {
  if (!isObject(val)) return false;
  return hasProperty(val, 'changes') || hasProperty(val, 'documentChanges');
}

export interface LSPRequestParams {
  position?: Position;
  textDocument?: { uri: string };
  [key: string]: unknown;
}

export interface ServerInstance {
  process: ChildProcess;
  connection: MessageConnection;
  capabilities?: ServerCapabilities;
}

export function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function isNumber(val: unknown): val is number {
  return typeof val === 'number';
}

export function isLSPPosition(val: unknown): val is Position {
  if (!isObject(val)) return false;
  const line = val['line'];
  const character = val['character'];
  return isNumber(line) && isNumber(character);
}
export function isLSPRange(val: unknown): val is Range {
  if (!isObject(val)) return false;
  const start = val['start'];
  const end = val['end'];
  return isLSPPosition(start) && isLSPPosition(end);
}

/**
 * Normalizes parameters by converting 1-indexed positions to 0-indexed.
 * Pure function returning a new object. Recursively handles objects and arrays.
 */
export function normalizeLSPParams(params: unknown): unknown {
  if (Array.isArray(params)) {
    return params.map(normalizeLSPParams);
  }

  if (isObject(params)) {
    if (isLSPPosition(params)) {
      return {
        line: params.line - 1,
        character: params.character - 1,
      };
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      result[key] = normalizeLSPParams(value);
    }
    return result;
  }

  return params;
}

export function normalizeWorkspaceEdit(edit: LSPWorkspaceEdit): unknown {
  const result: Record<string, unknown> = {};

  if (edit.changes) {
    const changes: Record<string, unknown[]> = {};
    for (const [uri, edits] of Object.entries(edit.changes)) {
      changes[uri] = edits.map((e) => ({
        ...e,
        range: {
          start: { line: e.start.line - 1, character: e.start.character - 1 },
          end: { line: e.end.line - 1, character: e.end.character - 1 },
        },
      }));
    }
    result['changes'] = changes;
  }

  if (edit.documentChanges) {
    result['documentChanges'] = edit.documentChanges.map((dc) => {
      if ('edits' in dc) {
        return {
          ...dc,
          edits: dc.edits.map((e) => ({
            ...e,
            range: {
              start: {
                line: e.start.line - 1,
                character: e.start.character - 1,
              },
              end: { line: e.end.line - 1, character: e.end.character - 1 },
            },
          })),
        };
      }
      return dc;
    });
  }

  return result;
}

/**
 * Recursively denormalizes LSP results from 0-indexed to 1-indexed coordinates.
 * Pure function leveraging immutable updates.
 */
export function denormalizeLSPResult(result: unknown): unknown {
  if (!result) return result;

  if (Array.isArray(result)) {
    return result.map(denormalizeLSPResult);
  }

  if (isObject(result)) {
    let res: Record<string, unknown> = { ...result };

    if (isLSPRange(result)) {
      res = {
        ...res,
        start: {
          line: result.start.line + 1,
          character: result.start.character + 1,
        },
        end: {
          line: result.end.line + 1,
          character: result.end.character + 1,
        },
      };
    }

    const keysToNormalize = [
      'location',
      'range',
      'selectionRange',
      'children',
      'targetRange',
      'targetSelectionRange',
      'originSelectionRange',
    ];
    for (const key of keysToNormalize) {
      const val = res[key];
      if (val !== undefined) {
        res[key] = denormalizeLSPResult(val);
      }
    }

    // Special handling for WorkspaceEdit
    if (hasProperty(res, 'changes') || hasProperty(res, 'documentChanges')) {
      return denormalizeWorkspaceEdit(result);
    }

    return res;
  }

  return result;
}

function denormalizeWorkspaceEdit(edit: unknown): LSPWorkspaceEdit {
  const result: LSPWorkspaceEdit = {};
  if (!isObject(edit)) return result;

  const protocolEdit = edit as ProtocolWorkspaceEdit;

  if (protocolEdit.changes) {
    result.changes = {};
    for (const [uri, edits] of Object.entries(protocolEdit.changes)) {
      if (Array.isArray(edits)) {
        result.changes[uri] = edits.map((e) => ({
          newText: e.newText,
          start: {
            line: e.range.start.line + 1,
            character: e.range.start.character + 1,
          },
          end: {
            line: e.range.end.line + 1,
            character: e.range.end.character + 1,
          },
        }));
      }
    }
  }

  if (protocolEdit.documentChanges) {
    const documentChanges: Array<
      | {
          textDocument: { uri: string; version: number | null };
          edits: LSPTextEdit[];
        }
      | { kind: 'create'; uri: string }
      | { kind: 'rename'; oldUri: string; newUri: string }
      | { kind: 'delete'; uri: string }
    > = [];

    for (const dc of protocolEdit.documentChanges) {
      if (isProtocolTextDocumentEdit(dc)) {
        documentChanges.push({
          textDocument: dc.textDocument,
          edits: dc.edits.map((e) => ({
            newText: e.newText,
            start: {
              line: e.range.start.line + 1,
              character: e.range.start.character + 1,
            },
            end: {
              line: e.range.end.line + 1,
              character: e.range.end.character + 1,
            },
          })),
        });
      } else if (isProtocolFileOperation(dc)) {
        if (dc.kind === 'create' && dc.uri) {
          documentChanges.push({ kind: dc.kind, uri: dc.uri });
        } else if (dc.kind === 'rename' && dc.oldUri && dc.newUri) {
          documentChanges.push({
            kind: dc.kind,
            oldUri: dc.oldUri,
            newUri: dc.newUri,
          });
        } else if (dc.kind === 'delete' && dc.uri) {
          documentChanges.push({ kind: dc.kind, uri: dc.uri });
        }
      }
    }
    result.documentChanges = documentChanges;
  }

  return result;
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
  private readonly openedFiles = new Map<string, number>();

  // Mapping of extensions to default language server commands
  private readonly languageToCommand: Record<string, string[]> = {
    typescript: ['typescript-language-server', '--stdio'],
    javascript: ['typescript-language-server', '--stdio'],
    python: ['pyright-langserver', '--stdio'],
    go: ['gopls'],
    rust: ['rust-analyzer'],
  };

  private constructor() {
    // Cleanup is now handled gracefully via Config.dispose() asynchronously
    // during the CLI's runExitCleanup() sequence.

    // Subscribe to file system events to keep LSP servers in sync
    coreEvents.on(CoreEvent.LSPFileChanged, (payload) => {
      // Find which project root this file belongs to
      for (const [key] of this.servers) {
        const [projectRoot] = key.split(':');
        if (payload.filePath.startsWith(projectRoot)) {
          void this.notifyFileChanged(
            payload.filePath,
            payload.content,
            projectRoot,
          );
          break;
        }
      }
    });

    coreEvents.on(CoreEvent.LSPFileSaved, (payload) => {
      for (const [key] of this.servers) {
        const [projectRoot] = key.split(':');
        if (payload.filePath.startsWith(projectRoot)) {
          void this.notifyFileSaved(payload.filePath, projectRoot);
          break;
        }
      }
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
   * Discovers the logical project root by walking up the directory tree.
   * Looks for strong signals like package.json or .git.
   */
  async findProjectRoot(startPath: string): Promise<string> {
    const markers = [
      '.git',
      'package.json',
      'tsconfig.json',
      'Cargo.toml',
      'go.mod',
      'pyproject.toml',
      'compile_commands.json',
    ];

    // Ensure we start with a directory
    const stat = await fs.stat(startPath).catch(() => null);
    let currentDir = stat?.isDirectory() ? startPath : path.dirname(startPath);
    const rootDir = path.parse(currentDir).root;

    while (currentDir !== rootDir) {
      for (const marker of markers) {
        const markerPath = path.join(currentDir, marker);
        try {
          await fs.access(markerPath);
          return currentDir; // Found a marker!
        } catch {
          // Marker not found in this directory, continue checking others
        }
      }
      currentDir = path.dirname(currentDir);
    }

    // Fallback: If we reach the file system root, return process.cwd()
    // In the CLI context, this acts as the "global" target directory fallback.
    return process.cwd();
  }

  /**
   * Resolves the appropriate language ID for a file path.
   * If the path is a directory, it attempts to infer the language from root markers.
   */
  async getLanguageId(filePath: string): Promise<string | undefined> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.ts' || ext === '.tsx') return 'typescript';
    if (ext === '.js' || ext === '.jsx') return 'javascript';
    if (ext === '.py') return 'python';
    if (ext === '.go') return 'go';
    if (ext === '.rs') return 'rust';

    if (ext === '') {
      // It might be a directory or a file without extension.
      // Check for common markers in the path or its parent.
      try {
        const stat = await fs.stat(filePath);
        const dir = stat.isDirectory() ? filePath : path.dirname(filePath);

        const checks = [
          { marker: 'tsconfig.json', lang: 'typescript' },
          { marker: 'package.json', lang: 'typescript' },
          { marker: 'pyproject.toml', lang: 'python' },
          { marker: 'requirements.txt', lang: 'python' },
          { marker: 'go.mod', lang: 'go' },
          { marker: 'Cargo.toml', lang: 'rust' },
        ];

        for (const check of checks) {
          try {
            await fs.access(path.join(dir, check.marker));
            return check.lang;
          } catch {
            // continue
          }
        }
      } catch {
        return undefined;
      }
    }

    return undefined;
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
        workspace: {
          workspaceEdit: { documentChanges: true },
          symbol: { dynamicRegistration: true },
        },
        textDocument: {
          definition: { dynamicRegistration: true },
          references: { dynamicRegistration: true },
          implementation: { dynamicRegistration: true },
          typeDefinition: { dynamicRegistration: true },
          hover: { dynamicRegistration: true },
          rename: { dynamicRegistration: true },
          codeAction: { dynamicRegistration: true },
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
          },
          synchronization: {
            didSave: true,
            dynamicRegistration: true,
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

      this.servers.set(key, {
        process: childProcess,
        connection,
        capabilities: result.capabilities,
      });
      return connection;
    } catch (error) {
      childProcess.kill();
      throw new Error(`Failed to initialize LSP server: ${String(error)}`);
    }
  }

  /**
   * Returns the server capabilities for a given project and file.
   */
  async getCapabilities(
    filePath: string,
    explicitProjectRoot?: string,
  ): Promise<ServerCapabilities> {
    const languageId = await this.getLanguageId(filePath);
    if (!languageId) {
      throw new Error(
        `Unsupported file type for LSP: ${path.extname(filePath)}`,
      );
    }

    const projectRoot =
      explicitProjectRoot ?? (await this.findProjectRoot(filePath));
    const key = `${projectRoot}:${languageId}`;
    let server = this.servers.get(key);
    if (!server) {
      await this.getOrCreateConnection(projectRoot, languageId);
      server = this.servers.get(key);
    }
    if (!server?.capabilities) {
      throw new Error(`Capabilities not available for server: ${languageId}`);
    }
    return server.capabilities;
  }

  /**
   * Notifies the server that a file's content has changed in memory.
   */
  async notifyFileChanged(
    filePath: string,
    content: string,
    explicitProjectRoot?: string,
  ): Promise<void> {
    const languageId = await this.getLanguageId(filePath);
    if (!languageId) return;

    const projectRoot =
      explicitProjectRoot ?? (await this.findProjectRoot(filePath));
    const connection = await this.getOrCreateConnection(
      projectRoot,
      languageId,
    );
    const fileUri = pathToFileURL(filePath).toString();

    const currentVersion = this.openedFiles.get(fileUri);

    if (currentVersion === undefined) {
      await connection.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri: fileUri,
          languageId,
          version: 1,
          text: content,
        },
      });
      this.openedFiles.set(fileUri, 1);
    } else {
      const nextVersion = currentVersion + 1;
      await connection.sendNotification('textDocument/didChange', {
        textDocument: {
          uri: fileUri,
          version: nextVersion,
        },
        contentChanges: [{ text: content }],
      });
      this.openedFiles.set(fileUri, nextVersion);
    }
  }

  /**
   * Notifies the server that a file has been saved to disk.
   */
  async notifyFileSaved(
    filePath: string,
    explicitProjectRoot?: string,
  ): Promise<void> {
    const languageId = await this.getLanguageId(filePath);
    if (!languageId) return;

    const projectRoot =
      explicitProjectRoot ?? (await this.findProjectRoot(filePath));
    const connection = await this.getOrCreateConnection(
      projectRoot,
      languageId,
    );
    const fileUri = pathToFileURL(filePath).toString();

    if (this.openedFiles.has(fileUri)) {
      await connection.sendNotification('textDocument/didSave', {
        textDocument: { uri: fileUri },
      });
    }
  }

  /**
   * Executes an LSP request, handling coordinate normalization (1-indexed to 0-indexed).
   */
  async sendRequest(
    filePath: string,
    method: string,
    params: unknown,
    explicitProjectRoot?: string,
    explicitLanguageId?: string,
  ): Promise<unknown> {
    const languageId =
      explicitLanguageId ?? (await this.getLanguageId(filePath));
    if (!languageId) {
      throw new Error(
        `Unsupported file type for LSP: ${path.extname(filePath)}`,
      );
    }

    const projectRoot =
      explicitProjectRoot ?? (await this.findProjectRoot(filePath));
    const connection = await this.getOrCreateConnection(
      projectRoot,
      languageId,
    );

    // Ensure the file is "opened" on the server
    const fileUri = pathToFileURL(filePath).toString();
    if (!this.openedFiles.has(fileUri)) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        await connection.sendNotification('textDocument/didOpen', {
          textDocument: {
            uri: fileUri,
            languageId,
            version: 1,
            text: content,
          },
        });
        this.openedFiles.set(fileUri, 1);
      } catch (error) {
        debugLogger.error(`Failed to send didOpen for ${filePath}:`, error);
      }
    }

    const lspParams = normalizeLSPParams(params);
    const result = await connection.sendRequest(method, lspParams);

    return denormalizeLSPResult(result);
  }

  /**
   * Applies a WorkspaceEdit across multiple files.
   */
  async applyWorkspaceEdit(
    projectRoot: string,
    edit: LSPWorkspaceEdit,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Apply 'changes' (Record<string, TextEdit[]>)
      if (edit.changes) {
        for (const [fileUri, edits] of Object.entries(edit.changes)) {
          const filePath = new URL(fileUri).pathname;
          await this.applyEditsToFile(filePath, edits);
        }
      }

      // 2. Apply 'documentChanges'
      if (edit.documentChanges) {
        for (const change of edit.documentChanges) {
          if ('textDocument' in change && 'edits' in change) {
            const filePath = new URL(change.textDocument.uri).pathname;
            await this.applyEditsToFile(filePath, change.edits);
          } else if ('kind' in change) {
            // Handle create, rename, delete
            const fsPromisesLocal = await import('node:fs/promises');
            switch (change.kind) {
              case 'create':
                await fsPromisesLocal.writeFile(
                  new URL(change.uri).pathname,
                  '',
                );
                break;
              case 'rename':
                await fsPromisesLocal.rename(
                  new URL(change.oldUri).pathname,
                  new URL(change.newUri).pathname,
                );
                break;
              case 'delete':
                try {
                  await fsPromisesLocal.unlink(new URL(change.uri).pathname);
                } catch (err: unknown) {
                  if (
                    isObject(err) &&
                    hasProperty(err, 'code') &&
                    err.code === 'ENOENT'
                  ) {
                    // Ignored: File already deleted or doesn't exist
                  } else {
                    throw err;
                  }
                }
                break;
              default:
                debugLogger.warn(
                  `Unknown document change kind: ${JSON.stringify(change)}`,
                );
            }
          }
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async applyEditsToFile(
    filePath: string,
    edits: LSPTextEdit[],
  ): Promise<void> {
    const fsPromisesLocal = await import('node:fs/promises');
    let content = await fsPromisesLocal.readFile(filePath, 'utf-8');

    // Sort edits in reverse order to maintain index validity
    const sortedEdits = [...edits].sort((a, b) => {
      if (a.start.line !== b.start.line) return b.start.line - a.start.line;
      return b.start.character - a.start.character;
    });

    const lines = content.split('\n');

    for (const edit of sortedEdits) {
      const startLine = edit.start.line - 1;
      const startChar = edit.start.character - 1;
      const endLine = edit.end.line - 1;
      const endChar = edit.end.character - 1;

      if (startLine === endLine) {
        const line = lines[startLine];
        lines[startLine] =
          line.substring(0, startChar) + edit.newText + line.substring(endChar);
      } else {
        const firstLine = lines[startLine].substring(0, startChar);
        const lastLine = lines[endLine].substring(endChar);
        lines.splice(
          startLine,
          endLine - startLine + 1,
          firstLine + edit.newText + lastLine,
        );
      }
    }

    content = lines.join('\n');
    await fsPromisesLocal.writeFile(filePath, content);
    // Notify server of the change
    coreEvents.emitLSPFileSaved(filePath);
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
          this.openedFiles.clear();
        }
      };
      cleanupPromises.push(cleanup());
    }

    await Promise.allSettled(cleanupPromises);
  }
}
