import axios from "axios";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = "deepseek/deepseek-r1";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function callAI(input: string | Message[]): Promise<string> {
  const messages: Message[] =
    typeof input === "string"
      ? [{ role: "user", content: input }]
      : input;
  const useGroq = Boolean(process.env.GROQ_API_KEY);
  const baseUrl = useGroq ? GROQ_BASE_URL : OPENROUTER_BASE_URL;
  const model = useGroq ? GROQ_MODEL : OPENROUTER_MODEL;
  const apiKey = useGroq
    ? process.env.GROQ_API_KEY
    : process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "No AI API key configured. Set GROQ_API_KEY or OPENROUTER_API_KEY."
    );
  }

  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(useGroq
          ? {}
          : {
              "HTTP-Referer": "http://localhost:3000",
              "X-Title": "Problem Discovery Tool",
            }),
      },
    }
  );

  return response.data.choices[0].message.content;
}
