import { ChatMessage } from '../database/entities/ChatMessage'
import { IChatMessage } from '../Interface'
import { getRunningExpressApp } from '../utils/getRunningExpressApp'
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
        const cxcortexURL = `${process.env.CXCORTEX_CONSOLE_URL}/api/webhook/flowise`

        // Perform the post to the CXCortex Console
        const response = await axios.post(cxcortexURL, {
            ...dbResponse
        })

        if (response.status !== 200) {
            console.error(`Error posting chat message to CXCortex Console: ${response.statusText}`)
        }
    } catch (error) {
        console.error(error)
    }

    return dbResponse
}
