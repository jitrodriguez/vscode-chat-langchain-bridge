// src/types.ts
import type { BaseFunctionCallOptions } from '@langchain/core/language_models/base';
import type { BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import type {
  DynamicStructuredTool, DynamicStructuredToolInput, DynamicTool, StructuredTool
} from '@langchain/core/tools';
import type {
  LanguageModelChat, CancellationToken, LanguageModelChatRequestOptions, ChatResponseStream
} from 'vscode';
import type { z } from 'zod';
import type { ChatVSCodeTool } from './tools.js';

export interface VscodeBaseInput {
  model: LanguageModelChat;
  token: CancellationToken;
}

export interface ChatVSCodeCallOptions
  extends LanguageModelChatRequestOptions, BaseFunctionCallOptions {}

export interface ChatVSCodeFields
  extends BaseChatModelParams, VscodeBaseInput {
  responseStream: ChatResponseStream;
}

export type ChatVSCodeToolType =
  | StructuredTool
  | DynamicStructuredTool
  | DynamicTool
  | ChatVSCodeTool;

export type ZodObjectAny = z.ZodObject<any, any, any, any>;

export interface ChatVSCodeToolInput<
  T extends ZodObjectAny | Record<string, any> = ZodObjectAny
> extends DynamicStructuredToolInput<
  T extends ZodObjectAny ? T : ZodObjectAny
> {}