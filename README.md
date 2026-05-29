# 🚀 ADAMAS Feedback Bot & Attendance Sync

Tired of clicking through hundreds of pages just to submit academic feedback or calculating attendance metrics by hand? The **ADAMAS Feedback Bot & Attendance Sync** does it all automatically with a premium cyber-cowboy aesthetic!

Now available both as a **High-Fidelity Chrome/Brave Extension** and a **Command Line CLI tool**!

---

## 🌟 Key Features

* **⚡ Ultra-Fast Automation:** Autofills and submits pending feedback forms on the Adamas University Student Portal in seconds.
* **🤠 Cowboy Vibe Selector:** Adjust the tone of your feedback text:
  * `SAVAGE`: Direct, candid, and high-impact.
  * `DIPLOMATIC`: Balanced, professional, and formal.
  * `FRIENDLY`: Highly positive, encouraging, and warm.
* **🎯 Sniper Mode:** Customize vibes individually for each subject if you don't want a global vibe!
* **📅 Attendance Sync & Predictor:** Analyzes your biometric attendance data in real-time, highlights low-attendance courses, and calculates the **exact number of consecutive classes** you need to attend to cross the 75% target threshold.
* **🔒 Privacy First:** 100% client-side execution. Your Student ID and password stay completely in your local browser sandbox or terminal cache. Zero external APIs, zero servers.

---

## 🎨 Method 1: The Chrome/Brave Extension (Free 0-Rupees Method)

Get a gorgeous, in-page dark HUD console drawer overlay with a floating neon cowboy shortcut!

### 📥 30-Second Installation Guide:
1. **Download:** Click on the green `Code` button above and choose **Download ZIP**, then unzip it. (Or use the pre-packed **`adamas-feedback-bot.zip`**).
2. **Go to Extensions:** Open Chrome or Brave and navigate to **`chrome://extensions/`**.
3. **Developer Mode:** Turn **ON** the "Developer Mode" toggle in the top right corner.
4. **Load Unpacked:** Click **"Load unpacked"** in the top left and select the folder named **`extension`** inside your extracted files.
5. **Boom!** Your browser will immediately display the custom glowing cyber-cowboy logo.

### 🎮 How it works:
* Go to the **[Adamas Student Portal](https://adamasknowledgecity.ac.in/student/login)**.
* Click the glowing neon-yellow shortcut launcher at the **bottom-right corner** of the page to open your assistant drawer.
* Manage saved credentials (with delete options), pick your favorite vibe, and run the feedback bot with a single tap!

---

## 💻 Method 2: The Command Line Tool (CLI)

Don't want to install an extension? Run the bot directly from your computer's terminal without downloading any files!

### 🚀 Quick Start:
Ensure you have **Node.js** (LTS) installed on your system.

1. Open your computer's terminal:
   * **Windows:** Search for "PowerShell" or "Command Prompt".
   * **Mac / Linux:** Open your "Terminal".
2. Run this command:
   ```bash
   npx feedback-au
   ```
3. Type `y` to install the package.
4. Enter your Student ID and Password, and watch the bot handle the feedback loop automatically!

*Having issues with Playwright or Chromium? Run:*
```bash
npx playwright install chromium
```

---

<details>
<summary>📱 <b>For Android Users (Termux CLI)</b></summary>

If you are running the terminal bot on an Android device using Termux, execute these setup steps sequentially:

```bash
# 1. Update the repository lists
pkg update && pkg upgrade -y

# 2. Enable external X11 repositories
pkg install x11-repo -y

# 3. Install lightweight Chromium browser and Node.js
pkg install chromium nodejs-lts git -y

# 4. Stop Playwright from downloading computer-specific files
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# 5. Run the bot!
npx feedback-au
```
</details>

---

## 🛡️ Privacy & Transparency
We take student security very seriously. All automation scripts are fully transparent and open source. All user session cache, stored tokens, and credentials are saved locally in the browser's `chrome.storage.local` API or terminal environment settings. No third-party analytical trackers, servers, or cloud dependencies exist.
