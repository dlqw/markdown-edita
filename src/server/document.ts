import type { TextDocumentContentChangeEvent } from 'vscode-languageserver/node';

export interface ServerDocument {
  readonly uri: string;
  readonly languageId: string;
  readonly version: number;
  getText(): string;
}

export class ServerDocumentImpl implements ServerDocument {
  private readonly _uri: string;
  private readonly _languageId: string;
  private _version: number;
  private _content: string;

  constructor(uri: string, languageId: string, version: number, content: string) {
    this._uri = uri;
    this._languageId = languageId;
    this._version = version;
    this._content = content;
  }

  get uri(): string {
    return this._uri;
  }

  get languageId(): string {
    return this._languageId;
  }

  get version(): number {
    return this._version;
  }

  getText(): string {
    return this._content;
  }

  update(changes: TextDocumentContentChangeEvent[], version: number): ServerDocumentImpl {
    for (const change of changes) {
      if ('range' in change) {
        const start = this.offsetAt(change.range.start.line, change.range.start.character);
        const end = this.offsetAt(change.range.end.line, change.range.end.character);
        this._content = this._content.slice(0, start) + change.text + this._content.slice(end);
      } else {
        this._content = change.text;
      }
    }
    this._version = version;
    return this;
  }

  private offsetAt(line: number, character: number): number {
    let currentLine = 0;
    let index = 0;
    while (index < this._content.length && currentLine < line) {
      if (this._content.charCodeAt(index) === 10) {
        currentLine += 1;
      }
      index += 1;
    }
    return Math.min(index + character, this._content.length);
  }
}
