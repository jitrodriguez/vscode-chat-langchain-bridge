import { BaseFunctionCallOptions } from '@langchain/core/language_models/base';
import { BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { DynamicStructuredTool, DynamicStructuredToolInput, DynamicTool, StructuredTool } from '@langchain/core/tools';
import { CancellationToken, ChatResponseStream, LanguageModelChat, LanguageModelChatRequestOptions } from 'vscode';
import { z } from 'zod/v3';
import { ChatVSCodeTool } from './tools.js';


export interface ChatVscodeBaseInput {
  model: LanguageModelChat;
  token: CancellationToken;
}

export interface ChatVSCodeCallOptions
  extends LanguageModelChatRequestOptions, BaseFunctionCallOptions {};

export interface ChatVSCodeFields
  extends BaseChatModelParams, ChatVscodeBaseInput {
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