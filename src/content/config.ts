// 1. Import utilities from `astro:content`
import { defineCollection, z } from 'astro:content';
// 2. Define your collection(s)
const case_studiesCollection = defineCollection({ 
    type: 'content',
    schema: ({ image }) => z.object({
        title: z.string(),
        cover: image(),
        imageAlt: z.string(),
      }),
    });
// 3. Export a single `collections` object to register your collection(s)
//    This key should match your collection directory name in "src/content"
export const collections = {
  case_studies: case_studiesCollection,
};