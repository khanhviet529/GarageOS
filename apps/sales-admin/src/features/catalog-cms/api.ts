import type { CategoryInput, CategoryUpdateInput, TestimonialInput, TestimonialUpdateInput } from '@garageos/contracts';
import { api } from '@/lib/client';
export interface Category extends CategoryInput { id: string; version: number }
export interface Testimonial extends TestimonialInput { id: string; status: 'DRAFT'|'PUBLISHED'|'HIDDEN'; version: number }
export const catalogCmsApi = {
  categories: () => api<{items:Category[]}>('/api/v1/marketing/categories'),
  createCategory: (input:CategoryInput) => api<{id:string}>('/api/v1/marketing/categories',{method:'POST',body:JSON.stringify(input)}),
  updateCategory: (id:string,input:CategoryUpdateInput) => api(`/api/v1/marketing/categories/${id}`,{method:'PATCH',body:JSON.stringify(input)}),
  deleteCategory: (id:string) => api<{deleted:boolean}>(`/api/v1/marketing/categories/${id}`,{method:'DELETE'}),
  testimonials: () => api<{items:Testimonial[]}>('/api/v1/marketing/testimonials'),
  createTestimonial: (input:TestimonialInput) => api<{id:string}>('/api/v1/marketing/testimonials',{method:'POST',body:JSON.stringify(input)}),
  updateTestimonial: (id:string,input:TestimonialUpdateInput) => api(`/api/v1/marketing/testimonials/${id}`,{method:'PATCH',body:JSON.stringify(input)}),
  publish: (id:string) => api(`/api/v1/marketing/testimonials/${id}/publish`,{method:'POST'}),
  hide: (id:string) => api(`/api/v1/marketing/testimonials/${id}/hide`,{method:'POST'}),
};
