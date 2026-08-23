export const queryKeys = {
  dashboard: () => ['dashboard'] as const,
  leads: () => ['leads'] as const,
  lead: (id: string) => ['leads', id] as const,
  products: () => ['products'] as const,
  categories: () => ['categories'] as const,
  testimonials: () => ['testimonials'] as const,
  product: (id: string) => ['products', id] as const,
  landingPages: () => ['landing-pages'] as const,
  landingPage: (id: string) => ['landing-pages', id] as const,
  landingRevisions: (id: string) => ['landing-pages', id, 'revisions'] as const,
};
