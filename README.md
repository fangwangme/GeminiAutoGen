# Gemini Auto Image Generator

A Chrome Extension that automates batch image generation on Google Gemini. Load a JSON file with image prompts, and the extension will automatically generate high-resolution images (~5MB each) and save them with custom filenames.

![Screenshot](docs/images/screenshot.png)

## ✨ Features

- **Batch Processing** - Load hundreds of prompts from a JSON file and process them automatically
- **High-Resolution Downloads** - Clicks "Download full size" to get the maximum quality images
- **Smart Skip** - Automatically skips already-generated images
- **Conversation Lock** - Lock to a specific Gemini chat URL for consistent context
- **Progress Tracking** - Real-time progress bar with elapsed/remaining time estimates
- **Auto-Rename** - Automatically renames downloaded files to your specified names

## 📦 Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/yourusername/GeminiAutoGen.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in top-right corner)

4. Click **Load unpacked** and select the cloned folder

5. Click the extension icon and select **Open Side Panel**

## ⚙️ Setup

Before using the extension, you need to configure the file directories:

1. Click the **⚙️ Settings** button in the side panel

2. Select **Source Folder** - Where Chrome saves downloads (e.g., `Downloads/Chrome`)

3. Select **Output Folder** - Where renamed images will be saved (e.g., `Downloads/GeminiOutput`)

## 🚀 Usage

### 1. Prepare Your Prompts

Create a JSON file with an array of tasks:

```json
[
  {
    "name": "sunset_beach",
    "prompt": "A beautiful sunset over a tropical beach with palm trees"
  },
  {
    "name": "mountain_lake",
    "prompt": "A serene mountain lake reflecting snow-capped peaks"
  }
]
```

### 2. Lock Conversation (Optional but Recommended)

To use the same Gemini conversation for all images:

1. Open [Gemini](https://gemini.google.com) and create or open a chat
2. Copy the URL from the address bar
3. Paste it in the **Locked Conversation URL** input
4. Click **Lock**

This ensures all images are generated in the same context, even if you restart the browser.

### 3. Start Generation

1. Load your JSON file using the file picker
2. Click **Start**
3. Watch the progress as images are generated and saved

The extension will:

- Send each prompt to Gemini
- Wait for image generation (up to 5 minutes per image)
- Click "Download full size"
- Rename and move the file to your output folder
- Recreate the browser tab between tasks for reliability

## 🏗️ Architecture

```
├── manifest.json      # Extension config (Manifest V3)
├── sidepanel.html/js  # UI and task orchestration
├── content.js         # Single-task processor (IIFE)
├── background.js      # File system operations
├── options.html/js    # Directory configuration
├── offscreen.html/js  # Offscreen document for file ops
└── utils/idb.js       # IndexedDB wrapper for handles
```

### Key Design Decisions

| Feature         | Approach           | Why                                   |
| --------------- | ------------------ | ------------------------------------- |
| Content Script  | Dynamic injection  | Avoids polluting the page permanently |
| Task Processing | One task per tab   | Prevents Blob URL corruption          |
| File Detection  | Filesystem polling | More reliable than download listeners |
| Tab Management  | Destroy & recreate | Ensures clean browser context         |

## ⏱️ Timeouts

| Operation             | Timeout | Description                                   |
| --------------------- | ------- | --------------------------------------------- |
| Image Generation      | 5 min   | Maximum wait for Gemini to generate           |
| Download Verification | 2 min   | Wait for file to appear in source folder      |
| Tab Recreation        | 2 sec   | Pause between closing old and opening new tab |
| Page Initialization   | 1.5 sec | Wait after page load before injecting script  |

## 🐛 Troubleshooting

### "Please open gemini.google.com"

- Make sure you're on a Gemini chat page, or lock a conversation URL first

### Downloads fail silently

- This is usually caused by browser context corruption
- The extension automatically recreates tabs between tasks to prevent this

### "No file loaded"

- Your JSON file may be invalid
- Ensure it's an array of objects with `name` and `prompt` properties

### Extension stops unexpectedly

- Click **Reset** to clear all state
- Reload the extension from `chrome://extensions/`
- Start again with your JSON file

## 📄 License

MIT License - feel free to use and modify.

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

**Disclaimer**: This extension automates interactions with Google Gemini. Use responsibly and in accordance with Google's Terms of Service.
