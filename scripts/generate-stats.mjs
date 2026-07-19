import { writeFileSync } from 'fs';

const TOKEN = process.env.GITHUB_TOKEN;
const USER = 'akostt';

async function fetchJSON(url) {
  const res = await fetch(url, { headers: TOKEN ? { Authorization: `token ${TOKEN}` } : {} });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return null; }
}

async function getStats() {
  const user = await fetchJSON(`https://api.github.com/users/${USER}`);
  if (!user || user.message) return null;

  let repos = [], events = [];
  try { const r = await fetchJSON(`https://api.github.com/users/${USER}/repos?per_page=100&sort=stars&direction=desc`); if (Array.isArray(r)) repos = r; } catch {}
  try { const e = await fetchJSON(`https://api.github.com/users/${USER}/events/public?per_page=100`); if (Array.isArray(e)) events = e; } catch {}

  let totalStars = 0, totalIssues = 0, totalPRs = 0;
  const langMap = {};

  for (const repo of repos) totalStars += repo.stargazers_count || 0;
  for (const event of events) {
    if (event.type === 'IssuesEvent' && event.payload.action === 'opened') totalIssues++;
    if (event.type === 'PullRequestEvent' && event.payload.action === 'opened') totalPRs++;
  }

  for (const repo of repos.slice(0, 15)) {
    try {
      const langs = await fetchJSON(`https://api.github.com/repos/${USER}/${repo.name}/languages`);
      if (langs && typeof langs === 'object') {
        for (const [lang, bytes] of Object.entries(langs)) langMap[lang] = (langMap[lang] || 0) + bytes;
      }
    } catch {}
  }

  const totalBytes = Object.values(langMap).reduce((a, b) => a + b, 0) || 1;
  const topLangs = Object.entries(langMap)
    .filter(([_, bytes]) => bytes > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bytes]) => ({ name, percent: ((bytes / totalBytes) * 100).toFixed(1) }));

  let streak = { current: 0, longest: 0, total: 0 };
  try {
    const contribs = await fetchJSON(`https://github-contributions-api.jogruber.de/v4/${USER}`);
    if (contribs && contribs.contributions) {
      const days = contribs.contributions;
      streak.total = days.reduce((sum, d) => sum + d.count, 0);
      let current = 0, longest = 0, temp = 0;
      for (let i = days.length - 1; i >= 0; i--) {
        if (days[i].count > 0) { temp++; if (i >= days.length - 2 && current === 0) current = temp; }
        else { if (temp > longest) longest = temp; temp = 0; }
      }
      if (temp > longest) longest = temp;
      if (current === 0) current = temp;
      streak.current = current;
      streak.longest = longest;
    }
  } catch {}

  return { repos: user.public_repos, stars: totalStars, followers: user.followers, issues: totalIssues, prs: totalPRs, topLangs, streak };
}

function langColor(name) {
  const c = {
    'C#': '#178600', 'JavaScript': '#f1e05a', 'TypeScript': '#3178c6',
    'HTML': '#e34c26', 'CSS': '#563d7c', 'Shell': '#89e051',
    'Python': '#3572A5', 'Ruby': '#701516', 'Dockerfile': '#384d54',
    'Makefile': '#427819', 'Perl': '#0298c3', 'PHP': '#4F5D95',
    'C': '#555555', 'C++': '#f34b7d', 'Java': '#b07219', 'Go': '#00ADD8',
    'Rust': '#dea584', 'Swift': '#F05138', 'PowerShell': '#012456'
  };
  return c[name] || '#8b8b8b';
}

function generateSVG(stats) {
  const W = 860;
  const PAD = 28;
  const contentW = W - PAD * 2;

  // ─── Layout ───
  const yTitle = 30;
  const yCards = 50;
  const cardH = 68;
  const yDiv1 = yCards + cardH + 14;
  const yStreakLabel = yDiv1 + 16;
  const yStreak = yStreakLabel + 14;
  const streakH = 52;
  const yDiv2 = yStreak + streakH + 14;
  const yLangLabel = yDiv2 + 16;
  const yLangBars = yLangLabel + 14;
  const langSpacing = 34;
  const numLangs = stats?.topLangs?.length || 0;
  const yDiv3 = yLangBars + numLangs * langSpacing + 8;
  const yBottom = yDiv3 + 16;
  const H = yBottom + 80;

  // ─── Stat cards ───
  const topStats = [
    { label: 'Repos', value: stats?.repos ?? '-', color: '#e94560' },
    { label: 'Stars', value: stats?.stars ?? '-', color: '#f5a623' },
    { label: 'Followers', value: stats?.followers ?? '-', color: '#3178c6' },
    { label: 'PRs', value: stats?.prs ?? '-', color: '#178600' },
    { label: 'Issues', value: stats?.issues ?? '-', color: '#8957e5' },
  ];
  const cardGap = 12;
  const cardW = (contentW - cardGap * 4) / 5;

  const statCards = topStats.map((s, i) => {
    const x = PAD + i * (cardW + cardGap);
    return `<g>
      <rect x="${x}" y="${yCards}" width="${cardW}" height="${cardH}" rx="10" fill="#161b22" stroke="#30363d"/>
      <text x="${x + cardW / 2}" y="${yCards + 34}" fill="${s.color}" font-size="24" font-weight="bold" font-family="'Segoe UI',sans-serif" text-anchor="middle">${s.value}</text>
      <text x="${x + cardW / 2}" y="${yCards + 54}" fill="#8b949e" font-size="11" font-family="'Segoe UI',sans-serif" text-anchor="middle">${s.label}</text>
    </g>`;
  }).join('');

  // ─── Streak ───
  const streakData = [
    { label: 'Current Streak', value: `${stats?.streak?.current ?? 0} days`, color: '#f5a623' },
    { label: 'Longest Streak', value: `${stats?.streak?.longest ?? 0} days`, color: '#e94560' },
    { label: 'Total Contributions', value: stats?.streak?.total ?? 0, color: '#3178c6' },
  ];
  const streakCardW = (contentW - cardGap * 2) / 3;

  const streakCards = streakData.map((s, i) => {
    const x = PAD + i * (streakCardW + cardGap);
    return `<g>
      <rect x="${x}" y="${yStreak}" width="${streakCardW}" height="${streakH}" rx="10" fill="#161b22" stroke="#30363d"/>
      <text x="${x + streakCardW / 2}" y="${yStreak + 24}" fill="${s.color}" font-size="18" font-weight="bold" font-family="'Segoe UI',sans-serif" text-anchor="middle">${s.value}</text>
      <text x="${x + streakCardW / 2}" y="${yStreak + 42}" fill="#8b949e" font-size="10" font-family="'Segoe UI',sans-serif" text-anchor="middle">${s.label}</text>
    </g>`;
  }).join('');

  // ─── Languages ───
  const langBarStart = PAD + 100;
  const langBarEnd = W - PAD;
  const barMaxW = langBarEnd - langBarStart - 50;

  const langBars = (stats?.topLangs || []).map((l, i) => {
    const color = langColor(l.name);
    const ly = yLangBars + i * langSpacing;
    const barW = (parseFloat(l.percent) / 100) * barMaxW;
    return `
    <text x="${PAD}" y="${ly + 12}" fill="#c9d1d9" font-size="13" font-family="'Segoe UI',sans-serif">${l.name}</text>
    <rect x="${langBarStart}" y="${ly}" width="${barMaxW}" height="16" rx="8" fill="#21262d"/>
    <rect x="${langBarStart}" y="${ly}" width="${barW}" height="16" rx="8" fill="${color}"/>
    <text x="${langBarStart + barMaxW + 8}" y="${ly + 12}" fill="#8b949e" font-size="12" font-family="'Segoe UI',sans-serif">${l.percent}%</text>`;
  }).join('');

  // ─── Bottom section: cat (left) + achievements (right) ───
  const catX = PAD + 10;
  const catCY = yBottom + 38;
  const o = '#e8923a', od = '#c87a2e', w = '#ffffff', pk = '#f97583';

  // Achievements moved to README as HTML

  const cat = `
  <ellipse cx="${catX + 20}" cy="${catCY + 32}" rx="18" ry="4" fill="#000" opacity="0.12"/>
  <path d="M${catX + 34},${catCY + 8} C${catX + 50},${catCY - 2} ${catX + 56},${catCY - 28} ${catX + 46},${catCY - 38}" fill="none" stroke="${o}" stroke-width="6" stroke-linecap="round">
    <animate attributeName="d" values="M${catX + 34},${catCY + 8} C${catX + 50},${catCY - 2} ${catX + 56},${catCY - 28} ${catX + 46},${catCY - 38};M${catX + 34},${catCY + 8} C${catX + 54},${catCY - 8} ${catX + 60},${catCY - 22} ${catX + 50},${catCY - 34};M${catX + 34},${catCY + 8} C${catX + 50},${catCY - 2} ${catX + 56},${catCY - 28} ${catX + 46},${catCY - 38}" dur="1.8s" repeatCount="indefinite"/>
  </path>
  <circle cx="${catX + 46}" cy="${catCY - 38}" r="4" fill="${w}" opacity="0.85">
    <animate attributeName="cx" values="${catX + 46};${catX + 50};${catX + 46}" dur="1.8s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="${catCY - 38};${catCY - 34};${catCY - 38}" dur="1.8s" repeatCount="indefinite"/>
  </circle>
  <ellipse cx="${catX + 20}" cy="${catCY + 2}" rx="22" ry="18" fill="${o}"/>
  <ellipse cx="${catX + 20}" cy="${catCY + 8}" rx="14" ry="12" fill="${w}" opacity="0.85"/>
  <ellipse cx="${catX + 10}" cy="${catCY + 24}" rx="6" ry="4" fill="${w}"/>
  <ellipse cx="${catX + 30}" cy="${catCY + 24}" rx="6" ry="4" fill="${w}"/>
  <circle cx="${catX + 20}" cy="${catCY - 22}" r="20" fill="${o}"/>
  <ellipse cx="${catX + 20}" cy="${catCY - 14}" rx="12" ry="9" fill="${w}" opacity="0.85"/>
  <ellipse cx="${catX + 20}" cy="${catCY - 24}" rx="8" ry="5" fill="${od}" opacity="0.4"/>
  <path d="M${catX + 5},${catCY - 36} L${catX + 10},${catCY - 52} L${catX + 18},${catCY - 36}" fill="${o}"/>
  <path d="M${catX + 35},${catCY - 36} L${catX + 30},${catCY - 52} L${catX + 22},${catCY - 36}" fill="${o}"/>
  <path d="M${catX + 8},${catCY - 38} L${catX + 10},${catCY - 48} L${catX + 15},${catCY - 38}" fill="${pk}" opacity="0.35"/>
  <path d="M${catX + 32},${catCY - 38} L${catX + 30},${catCY - 48} L${catX + 25},${catCY - 38}" fill="${pk}" opacity="0.35"/>
  <circle cx="${catX + 13}" cy="${catCY - 24}" r="4.5" fill="#1c2128"/>
  <circle cx="${catX + 27}" cy="${catCY - 24}" r="4.5" fill="#1c2128"/>
  <circle cx="${catX + 14.5}" cy="${catCY - 26}" r="1.8" fill="white"/>
  <circle cx="${catX + 28.5}" cy="${catCY - 26}" r="1.8" fill="white"/>
  <path d="M${catX + 20},${catCY - 18} L${catX + 18},${catCY - 15.5} L${catX + 22},${catCY - 15.5} Z" fill="${pk}"/>
  <path d="M${catX + 16},${catCY - 14} Q${catX + 18},${catCY - 11} ${catX + 20},${catCY - 15}" fill="none" stroke="#1c2128" stroke-width="0.9" stroke-linecap="round"/>
  <path d="M${catX + 24},${catCY - 14} Q${catX + 22},${catCY - 11} ${catX + 20},${catCY - 15}" fill="none" stroke="#1c2128" stroke-width="0.9" stroke-linecap="round"/>
  <line x1="${catX + 6}" y1="${catCY - 18}" x2="${catX - 8}" y2="${catCY - 22}" stroke="#1c2128" stroke-width="0.6" opacity="0.35"/>
  <line x1="${catX + 6}" y1="${catCY - 15}" x2="${catX - 8}" y2="${catCY - 14}" stroke="#1c2128" stroke-width="0.6" opacity="0.35"/>
  <line x1="${catX + 34}" y1="${catCY - 18}" x2="${catX + 48}" y2="${catCY - 22}" stroke="#1c2128" stroke-width="0.6" opacity="0.35"/>
  <line x1="${catX + 34}" y1="${catCY - 15}" x2="${catX + 48}" y2="${catCY - 14}" stroke="#1c2128" stroke-width="0.6" opacity="0.35"/>`;

  const label = (text, x, yPos) =>
    `<text x="${x}" y="${yPos}" fill="#8b949e" font-size="10" font-family="'Segoe UI',sans-serif" letter-spacing="1" font-weight="600">${text}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0d1117"/>
      <stop offset="100%" style="stop-color:#161b22"/>
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#e94560">
        <animate attributeName="stop-color" values="#e94560;#f5a623;#e94560" dur="4s" repeatCount="indefinite"/>
      </stop>
      <stop offset="50%" style="stop-color:#8957e5">
        <animate attributeName="stop-color" values="#8957e5;#3178c6;#8957e5" dur="4s" repeatCount="indefinite"/>
      </stop>
      <stop offset="100%" style="stop-color:#f5a623">
        <animate attributeName="stop-color" values="#f5a623;#e94560;#f5a623" dur="4s" repeatCount="indefinite"/>
      </stop>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" rx="14" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" rx="14" fill="none" stroke="url(#glow)" stroke-width="1.5" opacity="0.4">
    <animate attributeName="opacity" values="0.25;0.6;0.25" dur="4s" repeatCount="indefinite"/>
  </rect>

  <text x="${W / 2}" y="${yTitle}" fill="#e94560" font-size="18" font-weight="bold" font-family="'Segoe UI',sans-serif" text-anchor="middle" letter-spacing="1">GitHub Stats</text>

  ${statCards}

  <line x1="${PAD}" y1="${yDiv1}" x2="${W - PAD}" y2="${yDiv1}" stroke="#30363d" stroke-width="0.5"/>
  ${label('STREAK', PAD + 2, yStreakLabel)}
  ${streakCards}

  <line x1="${PAD}" y1="${yDiv2}" x2="${W - PAD}" y2="${yDiv2}" stroke="#30363d" stroke-width="0.5"/>
  ${label('MOST USED LANGUAGES', PAD + 2, yLangLabel)}
  ${langBars}

  <line x1="${PAD}" y1="${yDiv3}" x2="${W - PAD}" y2="${yDiv3}" stroke="#30363d" stroke-width="0.5"/>

  ${cat}

  <text x="${PAD}" y="${H - 10}" fill="#30363d" font-size="9" font-family="'Segoe UI',sans-serif">@${USER}</text>
</svg>`;
}

async function main() {
  const stats = await getStats();
  if (!stats) { console.error('Failed to fetch stats'); process.exit(1); }
  console.log(JSON.stringify(stats, null, 2));
  const svg = generateSVG(stats);
  writeFileSync('assets/stats.svg', svg);
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
