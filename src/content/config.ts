// 1. Import utilities from `astro:content`
import { defineCollection, z } from 'astro:content';
import { articleDateKey } from '../news/article-order.mjs';
// 2. Define your collection(s)
const case_studiesCollection = defineCollection({ 
    type: 'content',
    schema: ({ image }) => z.object({
        title: z.string(),
        cover: image(),
        imageAlt: z.string(),
      }),
    });

const newsCollection = defineCollection({ 
    type: 'content',
    schema: ({ image }) => z.object({
        title: z.string(),
        cover: image(),
        imageAlt: z.string(),
        figureLink: z.string(),
        articleDate: z.string().refine(
            (value) => articleDateKey(value) !== null,
            { message: 'Expected a real date in D Month YYYY format, e.g. 12 January 2026.' },
        ),
      }),
    });

const announcementCollection = defineCollection({ 
    type: 'content',
    schema: ({ }) => z.object({
        title: z.string(),
        className: z.string()
      }),
    });

const contributorCollection = defineCollection({ 
    type: 'content',
    schema: ({ image }) => z.object({
        name: z.string(),
        affiliation: z.string(),
        jobTitle: z.string(),
        profileLink: z.string(),
        accessionID: z.string(),
        contributorImage: image()
      }),
    });
// 3. Export a single `collections` object to register your collection(s)
//    This key should match your collection directory name in "src/content"
export const collections = {
  case_studies: case_studiesCollection,
  news_articles: newsCollection,
  announcements: announcementCollection,
  contributors: contributorCollection
};
