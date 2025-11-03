import { ToolCall } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { DynamicStructuredTool } from '@langchain/core/tools';
import {
  CancellationToken,
  LanguageModelChatTool,
  LanguageModelTool,
  LanguageModelToolInvocationOptions,
  LanguageModelToolResult,
  ProviderResult,
  CancellationTokenSource
} from 'vscode';
import type { z } from 'zod';

import { zodToJsonSchema } from 'zod-to-json-schema';
import { ChatVSCodeToolInput, ZodObjectAny } from './types.js';

export class ChatVSCodeTool<
  T extends ZodObjectAny | Record<string, any> = ZodObjectAny
>
  extends DynamicStructuredTool<T extends ZodObjectAny ? T : ZodObjectAny>
  implements
  LanguageModelChatTool,
  LanguageModelTool<z.infer<T extends ZodObjectAny ? T : ZodObjectAny>> {
  inputSchema?: Record<string, unknown>;

  constructor(fields: ChatVSCodeToolInput<T>) {
    super(fields);
    this.inputSchema = zodToJsonSchema(fields.schema);
  }

  static lc_name(): string {
    return 'ChatVSCodeTool';
  }

  invoke(
    input: string | ToolCall | { [x: string]: any },
    config?: RunnableConfig
  ): Promise<any>
  invoke<T>(
    options: LanguageModelToolInvocationOptions<
      z.infer<T extends ZodObjectAny ? T : ZodObjectAny>
    >,
    token: CancellationToken
  ): ProviderResult<LanguageModelToolResult>

  async invoke<T>(
    inputOrOptions:
      | string
      | ToolCall
      | { [x: string]: any }
      | LanguageModelToolInvocationOptions<ZodObjectAny>,
    configOrToken?: RunnableConfig | CancellationToken
  ): Promise<any> {
    if (
      inputOrOptions &&
      typeof inputOrOptions === 'object' &&
      'input' in inputOrOptions &&
      configOrToken instanceof CancellationTokenSource
    ) {
      // Second overload - VSCode tool invocation
      const options =
        inputOrOptions as LanguageModelToolInvocationOptions<T>;
      
      super.invoke(options.input as any);
    } else {
      // First overload - Standard LangChain invocation
      const input = inputOrOptions as string | ToolCall | { [x: string]: any }
      const config = configOrToken as RunnableConfig
      return super.invoke(input as any, config);
    }
  }
}
