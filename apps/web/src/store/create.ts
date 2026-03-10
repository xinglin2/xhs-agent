import { create } from 'zustand';
import { apiPost, apiPut } from '@/lib/api';

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export type Category = 'travel' | 'food' | 'lifestyle' | 'beauty' | 'fashion' | 'tech';
export type Tone = 'warm' | 'aspirational' | 'educational' | 'humorous';

export interface GeneratedContent {
  title: string;
  body: string;
  hashtags: string[];
}

export interface UploadedImage {
  id: string;
  file?: File;
  previewUrl: string;
  uploadedUrl?: string;
  processedUrl?: string;
  ratio: '3:4' | '1:1';
  filter: string;
  uploadProgress: number;
  isUploaded: boolean;
  isProcessed: boolean;
}

export type ImageFilter =
  | 'none'
  | 'warm'
  | 'cool'
  | 'vivid'
  | 'fade'
  | 'dramatic';

interface CreateState {
  // Input
  inputText: string;
  inputLanguage: string;
  category: Category;
  tone: Tone;

  // Generated output
  generatedContent: GeneratedContent | null;
  postId: string | null;

  // Images
  images: UploadedImage[];

  // Loading states
  isGenerating: boolean;
  isProcessingImages: boolean;
  uploadErrors: Record<string, string>;

  // Step
  currentStep: 1 | 2 | 3;

  // Actions
  setInputText: (text: string) => void;
  setInputLanguage: (lang: string) => void;
  setCategory: (cat: Category) => void;
  setTone: (tone: Tone) => void;
  setCurrentStep: (step: 1 | 2 | 3) => void;

  generate: () => Promise<void>;
  updateContent: (updates: Partial<GeneratedContent>) => void;

  addImages: (files: File[]) => void;
  removeImage: (id: string) => void;
  reorderImages: (fromIndex: number, toIndex: number) => void;
  updateImageRatio: (id: string, ratio: '3:4' | '1:1') => void;
  updateImageFilter: (id: string, filter: string) => void;
  uploadImages: () => Promise<void>;
  processImage: (id: string) => Promise<void>;
  processAllImages: () => Promise<void>;

  reset: () => void;
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const initialState = {
  inputText: '',
  inputLanguage: 'en',
  category: 'lifestyle' as Category,
  tone: 'warm' as Tone,
  generatedContent: null,
  postId: null,
  images: [],
  isGenerating: false,
  isProcessingImages: false,
  uploadErrors: {},
  currentStep: 1 as const,
};

// ──────────────────────────────────────────────────────────
// Store
// ──────────────────────────────────────────────────────────

export const useCreateStore = create<CreateState>((set, get) => ({
  ...initialState,

  setInputText: (text) => set({ inputText: text }),
  setInputLanguage: (lang) => set({ inputLanguage: lang }),
  setCategory: (cat) => set({ category: cat }),
  setTone: (tone) => set({ tone }),
  setCurrentStep: (step) => set({ currentStep: step }),

  generate: async () => {
    const { inputText, inputLanguage, category, tone, postId } = get();
    if (!inputText.trim()) return;

    set({ isGenerating: true });
    try {
      interface GenerateResponse {
        postId: string;
        content: GeneratedContent;
      }
      const data = await apiPost<GenerateResponse>('/posts/generate', {
        inputText,
        inputLanguage,
        category,
        tone,
        postId, // pass existing ID for re-generation
      });
      set({
        generatedContent: data.content,
        postId: data.postId,
        isGenerating: false,
      });
    } catch (err) {
      set({ isGenerating: false });
      throw err;
    }
  },

  updateContent: (updates) => {
    const { generatedContent, postId } = get();
    if (!generatedContent) return;
    const updated = { ...generatedContent, ...updates };
    set({ generatedContent: updated });

    // Persist to backend if we have a postId
    if (postId) {
      apiPut(`/posts/${postId}/content`, updated).catch((err) => {
        console.error('[CreateStore] Failed to save content update:', err);
      });
    }
  },

  addImages: (files) => {
    const currentImages = get().images;
    const remaining = 9 - currentImages.length;
    const toAdd = files.slice(0, remaining);

    const newImages: UploadedImage[] = toAdd.map((file) => ({
      id: generateId(),
      file,
      previewUrl: URL.createObjectURL(file),
      ratio: '3:4',
      filter: 'none',
      uploadProgress: 0,
      isUploaded: false,
      isProcessed: false,
    }));

    set({ images: [...currentImages, ...newImages] });
  },

  removeImage: (id) => {
    const images = get().images;
    const img = images.find((i) => i.id === id);
    if (img?.previewUrl && img.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(img.previewUrl);
    }
    set({ images: images.filter((i) => i.id !== id) });
  },

  reorderImages: (fromIndex, toIndex) => {
    const images = [...get().images];
    const [moved] = images.splice(fromIndex, 1);
    images.splice(toIndex, 0, moved);
    set({ images });
  },

  updateImageRatio: (id, ratio) => {
    set({
      images: get().images.map((img) =>
        img.id === id ? { ...img, ratio } : img,
      ),
    });
  },

  updateImageFilter: (id, filter) => {
    set({
      images: get().images.map((img) =>
        img.id === id ? { ...img, filter } : img,
      ),
    });
  },

  uploadImages: async () => {
    const { images, postId } = get();
    const toUpload = images.filter((i) => !i.isUploaded && i.file);

    for (const img of toUpload) {
      if (!img.file) continue;
      try {
        const formData = new FormData();
        formData.append('image', img.file);
        if (postId) formData.append('postId', postId);

        interface UploadResponse {
          url: string;
        }
        const data = await apiPost<UploadResponse>('/images/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            const pct = Math.round((e.loaded * 100) / (e.total ?? 1));
            set({
              images: get().images.map((i) =>
                i.id === img.id ? { ...i, uploadProgress: pct } : i,
              ),
            });
          },
        });

        set({
          images: get().images.map((i) =>
            i.id === img.id
              ? { ...i, uploadedUrl: data.url, isUploaded: true, uploadProgress: 100 }
              : i,
          ),
        });
      } catch (err: unknown) {
        const message = (err as { message?: string })?.message ?? '上传失败';
        set({
          uploadErrors: { ...get().uploadErrors, [img.id]: message },
        });
      }
    }
  },

  processImage: async (id) => {
    const img = get().images.find((i) => i.id === id);
    if (!img?.uploadedUrl) return;

    try {
      interface ProcessResponse {
        processedUrl: string;
      }
      const data = await apiPost<ProcessResponse>('/images/process', {
        imageUrl: img.uploadedUrl,
        ratio: img.ratio,
        filter: img.filter,
      });
      set({
        images: get().images.map((i) =>
          i.id === id ? { ...i, processedUrl: data.processedUrl, isProcessed: true } : i,
        ),
      });
    } catch (err) {
      console.error(`[CreateStore] processImage ${id} failed:`, err);
      throw err;
    }
  },

  processAllImages: async () => {
    const { images, uploadImages, processImage } = get();
    set({ isProcessingImages: true });

    try {
      // First upload any unuploaded images
      await uploadImages();

      // Then process each
      await Promise.all(
        images
          .filter((i) => i.isUploaded && !i.isProcessed)
          .map((i) => processImage(i.id)),
      );
    } finally {
      set({ isProcessingImages: false });
    }
  },

  reset: () => {
    // Revoke object URLs
    get().images.forEach((img) => {
      if (img.previewUrl.startsWith('blob:')) URL.revokeObjectURL(img.previewUrl);
    });
    set(initialState);
  },
}));
