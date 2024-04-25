import { ChatMessage } from '../database/entities/ChatMessage'
import { IChatMessage, IReactFlowObject } from '../Interface'
import { getRunningExpressApp } from '../utils/getRunningExpressApp'
import chatflows from '../services/chatflows'
import { InternalFlowiseError } from '../errors/internalFlowiseError'
import { StatusCodes } from 'http-status-codes'
import { Assistant } from '../database/entities/Assistant'
import axios from 'axios'

/**
 * Method that add chat messages.
 * @param {Partial<IChatMessage>} chatMessage
 */
export const utilAddChatMessage = async (chatMessage: Partial<IChatMessage>): Promise<ChatMessage> => {
    const appServer = getRunningExpressApp()
    const newChatMessage = new ChatMessage()
    Object.assign(newChatMessage, chatMessage)
    if (!newChatMessage.createdDate) {
        newChatMessage.createdDate = new Date()
    }
    const chatmessage = await appServer.AppDataSource.getRepository(ChatMessage).create(newChatMessage)
    const dbResponse = await appServer.AppDataSource.getRepository(ChatMessage).save(chatmessage)

    // When a chat message is created, we want to post it to the CXCortex Console
    try {
        if (!chatMessage.chatflowid) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                'Error: chatMessagesController.createChatMessage - chatflowid not provided!'
            )
        }
        const chatflow = await chatflows.getChatflowById(chatMessage.chatflowid)
        if (!chatflow) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Error: chatMessagesController.createChatMessage - Cannot find chatflow!')
        }

        const flowData = chatflow.flowData
        const parsedFlowData: IReactFlowObject = JSON.parse(flowData)
        const nodes = parsedFlowData.nodes

        const openAIAssistant = nodes.find((node) => node.data.type === 'OpenAIAssistant')

        if (openAIAssistant) {
            const internalAssistantId = openAIAssistant.data.inputs?.selectedAssistant as string | undefined

            if (internalAssistantId) {
                const assistant = await appServer.AppDataSource.getRepository(Assistant).findOneBy({
                    id: internalAssistantId
                })

                if (!assistant) {
                    throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Assistant ${internalAssistantId} not found`)
                }

                const openAIAssistantId = JSON.parse(assistant.details)?.id as string | undefined

                const cxcortexURL = process.env.CXCORTEX_CONSOLE_URL

                if (!cxcortexURL) {
                    throw new InternalFlowiseError(
                        StatusCodes.PRECONDITION_FAILED,
                        'Error: chatMessagesController.createChatMessage - CXCortex Console URL not provided!'
                    )
                }

                // Perform the post to the CXCortex Console
                const response = await axios.post(cxcortexURL, {
                    assistant_id: openAIAssistantId,
                    thread_id: chatMessage.sessionId
                })

                if (response.status !== 200) {
                    throw new InternalFlowiseError(
                        StatusCodes.INTERNAL_SERVER_ERROR,
                        'Error: chatMessagesController.createChatMessage - Failed to post to CXCortex Console'
                    )
                }
            }
        }
    } catch (error) {
        console.error(error)
    }

    return dbResponse
}
