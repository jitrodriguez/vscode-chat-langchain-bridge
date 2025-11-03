import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, AIMessageChunk, BaseMessage, ToolCall, ToolMessage } from '@langchain/core/messages';
import { ChatGeneration, ChatGenerationChunk, ChatResult } from '@langchain/core/outputs';
import { Runnable } from '@langchain/core/runnables';
import { CancellationToken, ChatResponseProgressPart, ChatResponseStream, LanguageModelChat, LanguageModelChatMessage, LanguageModelTextPart, LanguageModelToolCallPart } from 'vscode';
import { convertBaseMessage, toVSCodeChatTool } from './utils.js';
import { ChatVSCodeCallOptions, ChatVSCodeFields, ChatVSCodeToolType } from './types.js';


export class ChatVSCode extends BaseChatModel<
    ChatVSCodeCallOptions,
    AIMessageChunk
> {
    protected model: LanguageModelChat;
    token: CancellationToken;
    responseStream: ChatResponseStream;
    constructor(fields: ChatVSCodeFields) {
        super(fields ?? {});
        this.model = fields.model;
        this.token = fields.token;
        this.responseStream = fields.responseStream;
    }

    static lc_name() {
        return "ChatVSCode";
    }
    _llmType() {
        return "vscode";
    }

    async _generate(
        messages: BaseMessage[],
        options: this["ParsedCallOptions"],
        runManager?: CallbackManagerForLLMRun
    ): Promise<ChatResult> {
        let vscodeMessages: LanguageModelChatMessage[] = messages.map(
            (message): LanguageModelChatMessage => {
                return convertBaseMessage(message);
            }
        );

        const lastMessage = messages.at(-1);

        if (messages.length > 0 && ToolMessage.isInstance(lastMessage)) {
            // If the last message is a ToolMessage, we need to handle it differently
            // because it indicates a tool result from the user side.
            // Here, we can implement any specific logic needed for tool results.
            vscodeMessages.push(LanguageModelChatMessage.User(`
                Above is the result from one or more tool calls. The user cannot see the results, so you should use this information to continue the conversation.
                `));
        }

        const response = await this.model.sendRequest(
            vscodeMessages,
            {
                tools: options.tools?.map((tool) => {
                    return {
                        name: tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema,
                    };
                }),
            },
            this.token
        );

        let text = '';
        const toolCalls: ToolCall[] = [];

        for await (const part of response.stream) {
            if (part instanceof LanguageModelTextPart) {
                text += part.value;
                runManager?.handleLLMNewToken(part.value);
            } else if (part instanceof LanguageModelToolCallPart) {
                const toolCall: ToolCall = {
                    id: part.callId,
                    name: part.name,
                    args: part.input,
                    type: 'tool_call'
                };
                toolCalls.push(toolCall);
            } else {
                console.warn(`Unknown part type received from model stream:`);
                console.warn(part);
                const progressText = new ChatResponseProgressPart((part as any).value);
                this.responseStream?.push(progressText);
            }
        }

        let result: ChatResult = {
            generations: []
        };

        const message = new AIMessage(text);
        message.tool_calls = toolCalls;

        const generation: ChatGeneration = {
            text,
            message
        };

        result.generations.push(generation);

        return result;
    }

    async *_streamResponseChunks(
        messages: BaseMessage[],
        options: this['ParsedCallOptions'],
        runManager?: CallbackManagerForLLMRun
    ): AsyncGenerator<ChatGenerationChunk> {
        const copilotMessages = messages.map(convertBaseMessage);

        const response = this.model.sendRequest(copilotMessages, {
            tools: options.tools?.map((tool) => {
                return {
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                };
            }),
        },
            this.token
        );
        for await (const part of (await response).stream) {
            if (this.token.isCancellationRequested) {
                break;
            }

            if (part instanceof LanguageModelTextPart) {
                // console.log("Received text part from model stream:", part);
                const chunk = new ChatGenerationChunk({
                    text: part.value,
                    message: new AIMessageChunk(part.value),
                });
                runManager?.handleLLMNewToken(part.value);
                yield chunk;
            } else if (part instanceof LanguageModelToolCallPart) {
                // console.log("Received tool call part from model stream:", part);
                const chunkMessage = new AIMessageChunk({
                    tool_call_chunks: [
                        {
                            name: part.name,
                            args: JSON.stringify(part.input), // Chunk the input as a JSON string
                            id: part.callId,
                            type: 'tool_call_chunk',
                        }
                    ]
                });
                const chunk = new ChatGenerationChunk({
                    text: '',
                    message: chunkMessage,
                });
                yield chunk;
            } else {
                console.log("Is ChatResponseProgressPart:", part instanceof ChatResponseProgressPart);
                console.warn(`Unknown part type received from model stream:`);
                console.warn(part);
            }
        }
    }

    bindTools(
        tools: ChatVSCodeToolType[],
        kwargs?: Partial<ChatVSCodeCallOptions> | undefined
    ): Runnable<BaseLanguageModelInput, AIMessageChunk, ChatVSCodeCallOptions> {
        if (kwargs && 'strict' in kwargs) {
            delete kwargs.strict;
        }

        return this.withConfig({
            tools: tools.map((tool) => toVSCodeChatTool(tool)),
            ...kwargs,
        })
    }
}