# KRISHINITI 🌾

> **Evidence-Based Agricultural Decision-Support System**

KRISHINITI is an intelligent, grounded agricultural advisory platform designed to support farmers with deterministic crop suitability calculations, soil health diagnostics, weather risk mitigation, and AI-grounded explanations powered by Google Gemini.

---

## 🚀 Features

- **Deterministic Agronomic Engine**: Rule-based crop matching and soil health analysis based on verified agricultural parameters.
- **Grounded AI Explanations**: Powered by Google Gemini (`@google/genai`) to provide bilingual (English & Hindi) actionable advisory without hallucinations.
- **Weather & Crop Risk Integration**: Evaluates local weather and soil conditions against crop lifecycle needs.
- **Farmer-Centric UI**: Clean, interactive web interface (`KRISHINITI.html`) built for ease of use.
- **Built-in Rate Limiting & Security**: Rate-limited endpoints for AI explanations.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **AI / LLM**: Google Gemini API (`@google/genai`)
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla ES6)
- **Utilities**: `dotenv`, `cors`, `express-rate-limit`

---

## 📦 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/<your-username>/<your-repo-name>.git
cd KRISHINITI

# Install dependencies
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and fill in your API key:
```bash
cp .env.example .env
```
Edit `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

### 4. Running the Application
```bash
# Start server
npm start
```
The server will run at `http://localhost:3000`. Open `http://localhost:3000/KRISHINITI.html` (or serve `public/` files) in your browser.

---

## 🧪 Testing
```bash
npm test
```

---

## 📄 License
ISC License
