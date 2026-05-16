// =============================================
//  GitHub Story Generator — Backend (server.js)
//  Run karo: node server.js
// =============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const OpenAI = require('openai');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/githubstories';

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── MongoDB Connection ───────────────────────
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected!'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// ── Story Schema ─────────────────────────────
const storySchema = new mongoose.Schema({
  slug: { type: String, unique: true, required: true }, // unique share link
  username: String,
  user: Object,       // GitHub user data
  repos: Array,       // GitHub repos
  storyData: Object,  // processed data
  narrative: String,  // AI generated text
  createdAt: { type: Date, default: Date.now }
});

const Story = mongoose.model('Story', storySchema);

// ── Middleware ───────────────────────────────
app.use(cors());
app.use(express.json());

// ── Health Check ─────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'GitHub Story Generator API is running!' });
});

// ── Main API Route — Generate Story ──────────
app.post('/api/generate', async (req, res) => {
  const { username } = req.body;

  if (!username || typeof username !== 'string') {
    return res.status(400).json({ message: 'Username required hai bhai!' });
  }

  const cleanUsername = username.trim().replace(/[^a-zA-Z0-9-]/g, '');
  if (!cleanUsername) {
    return res.status(400).json({ message: 'Invalid username!' });
  }

  try {
    console.log(`[INFO] Fetching GitHub data for: ${cleanUsername}`);

    const headers = {};
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const [userRes, reposRes] = await Promise.all([
      axios.get(`https://api.github.com/users/${cleanUsername}`, { headers }),
      axios.get(`https://api.github.com/users/${cleanUsername}/repos?per_page=100&sort=updated`, { headers })
    ]);

    const user = userRes.data;
    const repos = reposRes.data;

    console.log(`[INFO] Got ${repos.length} repos for ${user.login}`);

    const storyData = processGitHubData(user, repos);
    const narrative = await generateNarrative(user, storyData);

    res.json({ user, repos, narrative, storyData });

  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ message: 'GitHub user nahi mila! Username check karo.' });
    }
    if (error.response?.status === 403) {
      return res.status(429).json({ message: 'GitHub API rate limit hit ho gaya. Thodi der baad try karo.' });
    }
    console.error('[ERROR]', error.message);
    res.status(500).json({ message: 'Server mein kuch gadbad hui. Console check karo.' });
  }
});

// ── Save Story Route ──────────────────────────
app.post('/api/save', async (req, res) => {
  const { username, user, repos, storyData, narrative } = req.body;

  if (!username || !user) {
    return res.status(400).json({ message: 'Data incomplete hai!' });
  }

  try {
    // Unique slug banao — username + random string
    const slug = `${username.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;

    const story = new Story({ slug, username, user, repos, storyData, narrative });
    await story.save();

    console.log(`[INFO] Story saved with slug: ${slug}`);
    res.json({ slug, shareUrl: `/story/${slug}` });

  } catch (error) {
    console.error('[ERROR] Save failed:', error.message);
    res.status(500).json({ message: 'Story save nahi hui. Dobara try karo.' });
  }
});

// ── Get Saved Story Route ─────────────────────
app.get('/api/story/:slug', async (req, res) => {
  try {
    const story = await Story.findOne({ slug: req.params.slug });

    if (!story) {
      return res.status(404).json({ message: 'Story nahi mili! Link check karo.' });
    }

    res.json(story);

  } catch (error) {
    console.error('[ERROR] Fetch story failed:', error.message);
    res.status(500).json({ message: 'Kuch gadbad hui.' });
  }
});

// ── Get All Saved Stories (optional) ─────────
app.get('/api/stories', async (req, res) => {
  try {
    const stories = await Story.find({}, 'slug username createdAt').sort({ createdAt: -1 }).limit(20);
    res.json(stories);
  } catch (error) {
    res.status(500).json({ message: 'Stories fetch nahi hui.' });
  }
});

// ── Helper: GitHub data process karo ─────────
function processGitHubData(user, repos) {
  const langCount = {};
  let totalStars = 0;
  let totalForks = 0;

  repos.forEach(repo => {
    if (repo.language) {
      langCount[repo.language] = (langCount[repo.language] || 0) + 1;
    }
    totalStars += repo.stargazers_count || 0;
    totalForks += repo.forks_count || 0;
  });

  const totalLangRepos = Object.values(langCount).reduce((a, b) => a + b, 0) || 1;
  const langs = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([lang, count]) => ({
      lang,
      pct: Math.round((count / totalLangRepos) * 100)
    }));

  const createdYear = new Date(user.created_at).getFullYear();
  const yearsActive = new Date().getFullYear() - createdYear;

  const topRepos = [...repos]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 4);

  const tags = [];
  if (langs[0]) tags.push(langs[0].lang + ' Dev');
  if (repos.length > 30) tags.push('Prolific Shipper');
  if (totalStars > 100) tags.push('Community Builder');
  if (yearsActive > 5) tags.push('Veteran Coder');
  if (user.followers > 50) tags.push('Thought Leader');
  if (repos.filter(r => !r.fork).length > repos.length * 0.7) tags.push('Original Creator');
  tags.push('Open Source');

  return { langs, totalStars, totalForks, topRepos, tags, yearsActive, createdYear };
}

// ── Helper: OpenAI se narrative generate karo ─
async function generateNarrative(user, storyData) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[WARN] OPENAI_API_KEY nahi hai — narrative skip hoga');
    return null;
  }

  try {
    const prompt = `You are writing a cinematic developer story for a GitHub profile. Write exactly 3 sentences. Be specific, poetic, and inspiring.

Developer: ${user.name || user.login}
Bio: ${user.bio || 'No bio'}
Top languages: ${storyData.langs.map(l => l.lang).join(', ')}
Public repos: ${user.public_repos}
Total stars: ${storyData.totalStars}
Followers: ${user.followers}
Years on GitHub: ${storyData.yearsActive}
Location: ${user.location || 'Unknown'}

Write exactly 3 sentences as if narrating their developer journey in a documentary.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.choices?.[0]?.message?.content || null;

  } catch (err) {
    console.error('[ERROR] AI narrative failed:', err.message);
    return null;
  }
}

// ── Server Start ──────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Server: http://localhost:${PORT}`);
  console.log(`🔑 OpenAI key: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Nope'}`);
  console.log(`🗄️  MongoDB: ${MONGODB_URI}`);
});