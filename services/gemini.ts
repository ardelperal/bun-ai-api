import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIService, ChatMessage } from '../types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const geminiService: AIService = {
  name: 'Gemini',
  async chat(messages: ChatMessage[]) {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Filter out system messages to handle them separately or prepend
    const systemMessage = messages.find(m => m.role === 'system');
    
    // Convert messages to Gemini history format
    const history = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    // If there's a system message, we could set it as systemInstruction 
    // but getGenerativeModel is called once. 
    // Alternatively, just prepend it to the first user message for simplicity
    // or use the systemInstruction property if we recreate the model instance.
    
    // For this implementation, let's just start a chat.
    // Note: Gemini's sendMessage takes the *last* message. The history is the *previous* messages.
    
    const lastMessage = history.pop();
    if (!lastMessage) {
        throw new Error('No messages provided');
    }

    const chat = model.startChat({
      history: history,
      systemInstruction: systemMessage?.content
    });

    const result = await chat.sendMessageStream(lastMessage.parts[0].text);

    return (async function* () {
      for await (const chunk of result.stream) {
        yield chunk.text();
      }
    })();
  }
}
