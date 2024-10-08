"use server";

import { createStreamableValue } from "ai/rsc";
import { CoreMessage, streamText } from "ai";
import { openai } from "@ai-sdk/openai";

// Function to validate input parameters
function validateInputs(topic: string): { valid: boolean; error?: string } {
    if (!topic.trim()) return { valid: false, error: "Topic cannot be empty." };
    return { valid: true };
}

// Function to calculate token count for input and estimate for output
async function estimateTokens(messages: CoreMessage[], estimatedOutputTokens: number) {

    // Concatenate all message contents into a single string
    const text = messages.map(message => message.content).join(' ');

    // Calculate the token count for the input text
    const totalChars = text.length;
    const inputTokensCount = Math.ceil(totalChars / 4);

    // Return input tokens and estimated output tokens
    return {
        inputTokens: inputTokensCount,
        outputTokens: estimatedOutputTokens,
    };
}

// Function to generate a deterministic response using OpenAI
async function generateDeterministicResponse(messages: CoreMessage[], estimatedOutputTokens: number, availableCredits: number) {
    const creditsPerDollar = Number(process.env.NEXT_PUBLIC_CREDITS_PER_DOLLAR) || 500 as number;
    const creditsPerInputToken = Number(process.env.NEXT_PUBLIC_CREDITS_PER_INPUT_TOKEN) || 0.000005 as number;
    const creditsPerOutputToken = Number(process.env.NEXT_PUBLIC_CREDITS_PER_OUTPUT_TOKEN) || 0.000015 as number;
    
    const model = openai("gpt-4o");

    // Estimate token usage before making the request
    const { inputTokens, outputTokens } = await estimateTokens(messages, estimatedOutputTokens);
    const estimatedCreditCost = (inputTokens * 0.000005) + (outputTokens * 0.000015) * creditsPerDollar * 1.5; // Add 50% buffer

    // If the user does not have enough credits, throw an error
    if (availableCredits < estimatedCreditCost) {
        throw new Error("Not enough credits to process the request.");
    }

    // Proceed with the API call if the user has enough credits
    const { textStream, usage } = await streamText({
        model,
        messages,
        temperature: 0, // Deterministic response
    });

    const stream = createStreamableValue(textStream);

    // Calculate the actual credits used based on the usage returned by the API
    const creditsUsed = ((await usage).promptTokens * creditsPerInputToken + (await usage).completionTokens * creditsPerOutputToken) * creditsPerDollar;


    return {
        result: stream.value,
        creditsUsed,
    };
};

// Helper function to create the grading messages
function createGradingMessages(topic: string, words: string): CoreMessage[] {
    const systemPrompt = `Respond as a writing teacher at the ${words || "college"} level. Your response should be in the form of a letter grade and an explanation.`;
    const userPrompt = `Please grade the essay that follows: \n${topic}`;

    return [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
    ];
}

// Function specific to grading essays
export async function generateGrade(topic: string, words: string, availableCredits: number) {
    const validation = validateInputs(topic);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    // Estimate output tokens based on average response length (adjust this as needed)
    // TODO: Implement a more accurate way to estimate output tokens
    const estimatedOutputTokens = 500; // Rough estimate for response size

    const messages = createGradingMessages(topic, words);
    return await generateDeterministicResponse(messages, estimatedOutputTokens, availableCredits);
}
