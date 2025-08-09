import { type VSFaqFull } from "~/types/faq";

export const getFaqSections = async (siteId: string): Promise<VSFaqFull[]> => {
  try {
    if(! siteId) return [];

    const response = await fetch(`/api/faq?siteId=${siteId}`);
    return await response.json() as VSFaqFull[];
  } catch (err) {
    console.error('err', err)
    return [];
  }
}
