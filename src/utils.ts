import { DynamicStructuredTool, StructuredTool } from '@langchain/core/tools';
import { AIMessage, BaseMessage, ContentBlock, HumanMessage, MessageContent, SystemMessage, ToolCall, ToolMessage } from '@langchain/core/messages';
import { ChatContext, ChatRequestTurn, ChatResponseAnchorPart, ChatResponseMarkdownPart, ChatResponseTurn, LanguageModelChatMessage, LanguageModelTextPart, LanguageModelToolCallPart, LanguageModelToolResultPart, Uri } from 'vscode';
import { ChatVSCodeToolInput, ChatVSCodeToolType } from './types.js';
import { ChatVSCodeTool } from './tools.js';

/**
 * Ensures every LangChain tool is wrapped in a ChatVSCodeTool instance that
 * exposes the schema and invoke function expected by the VS Code chat bridge.
 */
export function toVSCodeChatTool(tool: ChatVSCodeToolType): ChatVSCodeTool {
  if (tool instanceof ChatVSCodeTool) {
    return tool as ChatVSCodeTool
  }
  if (tool instanceof DynamicStructuredTool) {
    return new ChatVSCodeTool({
      name: tool.name,
      description: tool.description,
      schema: tool.schema as ChatVSCodeToolInput['schema'],
      func: (input, _?, config?) => {
        return tool.invoke(input, config)
      },
    })
  }
  if (tool instanceof StructuredTool) {
    return new ChatVSCodeTool({
      name: tool.name,
      description: tool.description,
      schema: tool.schema as ChatVSCodeToolInput['schema'],
      func: (input, _?, config?) => {
        return tool.invoke(input, config);
      },
    })
  }
  throw new Error('Invalid tool type');
}

/**
 * Type guard for plain text content blocks.
 */
export function
  isTextContentBlock(part: ContentBlock): part is ContentBlock.Text {
  return part.type === 'text';
}

/**
 * Type guard for multimodal image content blocks.
 */
export function
  isImageContentBlock(part: ContentBlock): part is ContentBlock.Multimodal.Image {
  return part.type === 'image';
}

/**
 * Type guard for multimodal plain text blocks.
 */
export function
  isMultiModalPlainText(part: ContentBlock): part is ContentBlock.Multimodal.PlainText {
  return part.type === 'text-plain';
}

/**
 * Converts a MessageContent to an array of LanguageModelTextPart.
 * Supports plain text and image content blocks.
 * @param content The MessageContent to convert.
 * @returns The converted array of LanguageModelTextPart.
 */
export function
  toTextContent(content: MessageContent): Array<LanguageModelTextPart> {
  if (typeof content === 'string') {
    return [new LanguageModelTextPart(content)];
  }
  if (Array.isArray(content)) {
    return content.map((part: ContentBlock) => {
      if (isTextContentBlock(part)) {
        return new LanguageModelTextPart(part.text);
      } else if (isImageContentBlock(part)) {
        if (part.url) {
          return new LanguageModelTextPart(part.url);
        }

        if (part.data && part.mimeType) {
          // Some APIs require the Base64 `data:<mimeType>;base64,<data>` format.
          const base64String = typeof part.data === 'string'
            ? part.data
            : Buffer.from(part.data).toString('base64');

          const dataUrl = `data:${part.mimeType};base64,${base64String}`;

          // Send the data URL or the structured data, depending on the SDK expectations.
          return new LanguageModelTextPart(dataUrl);

        }

        // Handle the 'fileId' case if the SDK supports it directly.
        else if (part.fileId) {
          // If the model supports it, you can send the ID or throw an error.
          throw new Error(`Sending image via fileId not yet supported by this parser.`);
        } else {
          throw new Error(`message part type not supported: ${part}`);
        }

      } else {
        throw new Error(`message part type not supported: ${part}`);
      }
    })
  } else {
    throw new Error('Unknown message content type');
  }
}

/**
 * Converts a BaseMessage to a LanguageModelChatMessage.
 * @param message The BaseMessage to convert.
 * @returns The converted LanguageModelChatMessage.
 */
export function
  convertBaseMessage(message: BaseMessage): LanguageModelChatMessage {
  // if this is an AI message
  if (AIMessage.isInstance(message)) {
    if (!!message.tool_calls?.length) {
      const aiMessage = message as AIMessage & { tool_calls: ToolCall[] };

      const toolCallParts = aiMessage.tool_calls.map(
        (toolCall): LanguageModelToolCallPart => {
          return new LanguageModelToolCallPart(
            toolCall.id || '',
            toolCall.name,
            toolCall.args
          );
        });
      return LanguageModelChatMessage.Assistant(
        toolCallParts,
        aiMessage.name);
    }
    // if this is a text AI message
    return LanguageModelChatMessage.Assistant(
      toTextContent(message.content),
      message.name
    );
  }
  if (HumanMessage.isInstance(message)) {
    const humanMessage = message;
    return LanguageModelChatMessage.User(
      toTextContent(humanMessage.content),
      humanMessage.name
    );
  }

  if (ToolMessage.isInstance(message)) {
    const toolResult = new LanguageModelToolResultPart(
      message.tool_call_id,
      toTextContent(message.content)
    );
    return LanguageModelChatMessage.User(
      [toolResult],
      message.name
    );
  }

  if (SystemMessage.isInstance(message)) {
    return LanguageModelChatMessage.User(
      toTextContent(message.content),
      message.name
    );
  }

  throw new Error(`Unsupported message type: ${message}`);
}

/**
 * Utility function that converts a VS Code chat history into the LangChain
 * message format.
 */
export function convertVscodeHistory(chatContext: ChatContext): BaseMessage[] {
  const result = [];
  for(const message of chatContext.history) {
    if (message instanceof ChatRequestTurn) {
            result.push(new HumanMessage({
              content: message.prompt
            }));
    } else if (message instanceof ChatResponseTurn) {
      result.push(new AIMessage({
        content: chatResponseToString(message)
      }));
    }
  }
  return result;
}

/**
 * Extracts the textual representation of a ChatResponseTurn for LangChain.
 */
export function chatResponseToString(response: ChatResponseTurn): string {
	return response.response
		.map(r => {
			if (r instanceof ChatResponseMarkdownPart) {
				return r.value.value;
			} else if (r instanceof ChatResponseAnchorPart) {
				if (r.value instanceof Uri) {
					return r.value.fsPath;
				} else {
					return r.value.uri.fsPath;
				}
			}

			return '';
		})
		.join('');
}
