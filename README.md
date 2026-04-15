# 🚀 Adamas University Feedback Automator

Tired of clicking through pages just to submit your academic feedback? This tool does it all for you automatically in seconds!

![Feedback Bot Preview](./public/preview.png)

> **⚠️ Quick Disclaimer:**
> Please use this only for your own account. Your ID and password are safe — they stay securely on your computer and are only used to log in directly to the university portal. No data is saved or shared.

---

## 🛠️ How to Use It

Don't worry if you've never used a terminal before! Just follow these two simple steps.

### Step 1: Install Node.js
Your computer needs a small background program called **Node.js** to run this tool. You can download it directly from their site, or be a pro and use a quick terminal command to install it.

**🪟 For Windows:**
* Download from the [Node.js Website](https://nodejs.org/) (Choose the "LTS" version).
* **Or** open PowerShell and paste this command:
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```

**🍎 For Mac:**
* Download from the [Node.js Website](https://nodejs.org/) (Choose the "LTS" version).
* **Or** open your Terminal and paste these commands:
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  source ~/.zshrc
  nvm install --lts
  nvm use --lts
  ```

**🐧 For Linux:**
* Open your Terminal and paste these commands:
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  source ~/.bashrc
  nvm install --lts
  nvm use --lts
  ```

---

### Step 2: Run the Bot
1. Open your computer's terminal:
   * **Windows:** Search for "Command Prompt" or "PowerShell" in your start menu.
   * **Mac/Linux:** Search for "Terminal".
2. Copy and paste the following command, then press **Enter**:

   ```bash
   npx feedback-au
   ```

3. If it asks you to install a package, just type `y` and press Enter.
4. The bot will start and ask for your Student ID and Password. *(Note: your password will be hidden as you type, but it's there!)*
5. Sit back and watch it complete all your pending subject feedbacks instantly! ✨

---

## ❓ What exactly does this do?
1. Opens a secure, invisible web browser.
2. Logs you into the Adamas Student Portal.
3. Automatically finds all the subject feedback forms you need to complete.
4. Fills them in with positive ratings and submits them for you.
5. Gives you a clean summary checklist when everything is done!

---

### 🔧 Having Trouble?
If you get an error saying something about "browsers" or "playwright", just copy and paste this command into your terminal and press Enter:
```bash
npx playwright install chromium
```
Once that finishes downloading, run `npx feedback-au` again!

<details>
<summary>📱 <b>For Android Users (Termux)</b></summary>

If you are running this on your phone using Termux, follow these steps slowly one by one. **Do not skip any!**

**Step 1: Update your system**
Copy this line, paste it into Termux, and press Enter. *(If it ever asks `Y/n`, just type `y` and press Enter)*.
```bash
pkg update && pkg upgrade -y
```

**Step 2: Get the extra Android packages**
Copy and paste this, then press Enter:
```bash
pkg install x11-repo -y
```

**Step 3: Install the browser and Node.js**
Copy and paste this, then press Enter. This installs a lightweight Android browser so your phone doesn't freeze!
```bash
pkg install chromium nodejs-lts git -y
```

**Step 4: Stop the bad download**
Copy and paste this exact line, then press Enter. This tells the tool **not** to download the 150MB broken computer browser.
```bash
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
```

**Step 5: Run the bot!**
Finally, copy and paste this command and press Enter to start the magic:
```bash
npx feedback-au
```
*(If it says "Need to install... Ok to proceed? (y)", just type `y` and press Enter!)*
</details>
