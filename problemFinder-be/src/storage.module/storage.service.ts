import prisma from "../config/database.config";
import { callAI } from "../config/ai.config";
import { ClassifiedPost } from "../classifier.module/classifier.service";

// ── AI Cleaning ──────────────────────────────────────────────────────────────

async function cleanAndSummariseWithAI(post: ClassifiedPost): Promise<{ title: string; summary: string }> {
    const prompt = `
    You are a problem extraction assistant. 
    Given a Reddit post, extract the core problem being described.

    Return ONLY a JSON object in this exact format with no extra text:
    {
    "title": "a clean, concise problem title under 100 characters",
    "summary": "a 2-3 sentence summary of the core problem being described"
    }

    Reddit post title: ${post.title}
    Reddit post body: ${post.body.slice(0, 1000)}
    `.trim();

    try {
        const response = await callAI(prompt);

        // Strip any markdown code blocks if AI wraps response in them
        const cleaned = response.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);

        return {
        title: parsed.title || post.title,
        summary: parsed.summary || post.body.slice(0, 200),
        };
    } catch (error) {
        // If AI fails fall back to raw post data
        return {
        title: post.title,
        summary: post.body.slice(0, 200),
        };
    }
    }

    // ── Deduplication ────────────────────────────────────────────────────────────

    async function isDuplicate(post: ClassifiedPost): Promise<boolean> {
    // Level 1 — exact reddit post ID match
    const existingById = await prisma.problem.findUnique({
        where: { redditPostId: post.redditPostId },
    });

    if (existingById) {
        return true;
    }

    // Level 2 — title similarity using Jaccard at 80% threshold
    const recentProblems = await prisma.problem.findMany({
        select: { title: true },
        where: {
        expiresAt: { gt: new Date() },
        },
    });

    for (const existing of recentProblems) {
        const similarity = jaccardSimilarity(
        post.title.toLowerCase(),
        existing.title.toLowerCase()
        );

        if (similarity >= 0.8) {
        // Keep the version with higher upvotes
        await prisma.problem.updateMany({
            where: { title: existing.title },
            data:
            post.upvotes >
            (
                await prisma.problem.findFirst({
                where: { title: existing.title },
                select: { upvotes: true },
                })
            )!.upvotes
                ? { upvotes: post.upvotes }
                : {},
        });

        return true;
        }
    }

    return false;
    }

    function jaccardSimilarity(a: string, b: string): number {
    const setA = new Set(a.split(" "));
    const setB = new Set(b.split(" "));

    const intersection = new Set([...setA].filter((word) => setB.has(word)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
    }

    // ── TTL Purge ────────────────────────────────────────────────────────────────

    export async function purgeExpiredProblems(): Promise<void> {
    const deleted = await prisma.problem.deleteMany({
        where: {
        expiresAt: { lt: new Date() },
        },
    });

    console.log(`Purged ${deleted.count} expired problems`);
    }

    // ── Save ─────────────────────────────────────────────────────────────────────

    async function savePost(post: ClassifiedPost): Promise<void> {
    const duplicate = await isDuplicate(post);

    if (duplicate) {
        console.log(`Skipping duplicate: ${post.title}`);
        return;
    }

    const { title, summary } = await cleanAndSummariseWithAI(post);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.problem.create({
        data: {
        title,
        summary,
      category: post.category,
      confidenceScore: post.confidenceScore,
      source: "reddit",
      sourceUrl: post.url,
      url: post.url,
      redditPostId: post.redditPostId,
      upvotes: post.upvotes,
      commentCount: post.commentCount,
      expiresAt,
    },
    });

    console.log(`Saved: ${title}`);
    }

    // ── Main Export ──────────────────────────────────────────────────────────────

    export async function storePosts(posts: ClassifiedPost[]): Promise<{
    saved: number;
    duplicates: number;
    total: number;
    }> {
    await purgeExpiredProblems();

    let saved = 0;
    let duplicates = 0;

    for (const post of posts) {
        const duplicate = await isDuplicate(post);

        if (duplicate) {
        duplicates++;
        continue;
        }

        await savePost(post);
        saved++;
    }

    return {
        saved,
        duplicates,
        total: posts.length,
    };
    }
