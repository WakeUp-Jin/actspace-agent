import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const docs = defineCollection({
  loader: glob({ base: "./src/content/docs", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    group: z.enum(["getting-started", "core-concepts", "guides", "contributing"]),
    order: z.number().int().nonnegative(),
    updatedAt: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
});

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    authors: z.array(z.string().min(1)).min(1),
    tags: z.array(z.string().min(1)).min(1),
    draft: z.boolean().default(false),
    cover: z.string().min(1),
  }),
});

export const collections = { blog, docs };
