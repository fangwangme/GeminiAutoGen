export type TaskItem = {
  name: string;
  prompt: string;
  images?: string[]; // Array of image file paths to attach to the prompt
};
