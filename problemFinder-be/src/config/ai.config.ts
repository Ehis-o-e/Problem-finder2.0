import axios from "axios";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const MODEL = "deepseek/deepseek-r1";

export async function callAI(prompt: string): Promise<string> {
  const response = await axios.post(
    `${OPENROUTER_BASE_URL}/chat/completions`,
    {
      model: MODEL,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Problem Discovery Tool",
      },
    }
  );

  return response.data.choices[0].message.content;
}