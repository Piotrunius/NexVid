import { execSync, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on('SIGINT', () => {
  console.log('\n\x1b[31m ✖  Process aborted by user (SIGINT).\x1b[0m');
  rl.close();
  process.exit(1);
});

const format = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bgGray: '\x1b[48;5;236m',
};

const ui = {
  header: (text) =>
    console.log(
      `\n${format.bold}${format.blue} ❖  ${text.toUpperCase()}  ${format.reset}\n${format.dim} ──────────────────────────────────────${format.reset}`,
    ),
  step: (text) => console.log(`${format.green} ► ${format.reset} ${text}`),
  info: (text) => console.log(`${format.dim} │  ${text}${format.reset}`),
  warn: (text) => console.log(`\n${format.yellow} ⚠ ${format.reset} ${text}`),
  error: (text) => console.error(`\n${format.red} ✖  ERROR:${format.reset} ${text}`),
  success: (text) => console.log(`\n${format.bold}${format.green} ✔  ${text}${format.reset}\n`),
  execBoundary: (label) =>
    console.log(`${format.bgGray}${format.dim} ── STDOUT/STDERR: ${label} ── ${format.reset}`),
  menu: (num, text) => console.log(`  ${format.cyan}${num}.${format.reset} ${text}`),
  summary: (label, value) =>
    console.log(`  ${format.dim}▪${format.reset} ${label.padEnd(12)} ${value}`),
};

const question = (query) =>
  new Promise((resolve) => rl.question(`${format.cyan} ❯ ${format.reset} ${query}`, resolve));

const askChoice = async (query, validOptions, defaultOpt = null) => {
  while (true) {
    const answer = await question(query);
    const choice = answer.trim();
    if (choice === '' && defaultOpt !== null) return defaultOpt;
    if (validOptions.includes(choice)) return choice;
    ui.warn(`Invalid input. Required: ${validOptions.join(', ')}`);
  }
};

const runCmd = (cmd, label) => {
  ui.execBoundary(label);
  try {
    execSync(cmd, { stdio: 'inherit' });
    ui.execBoundary('END');
    return true;
  } catch (error) {
    ui.error(`Execution aborted: ${label}`);
    ui.execBoundary('ERROR END');
    return false;
  }
};

const runSafeCmd = (bin, args, label) => {
  ui.execBoundary(label);
  try {
    execFileSync(bin, args, { stdio: 'inherit' });
    ui.execBoundary('END');
    return true;
  } catch (error) {
    ui.error(`Execution aborted: ${label}`);
    ui.execBoundary('ERROR END');
    return false;
  }
};

async function sendDiscordNotification(message, branch, sha) {
  const webhookUrl = process.env.DISCORD_WEBHOOK;

  if (!webhookUrl) {
    return false;
  }

  const config = {
    feat: { label: 'Feature', color: 5763719 },
    fix: { label: 'Fix', color: 15548997 },
    chore: { label: 'Chore', color: 10197915 },
    refactor: { label: 'Refactor', color: 3447003 },
    perf: { label: 'Performance', color: 15844367 },
    sec: { label: 'Security', color: 15105570 },
    default: { label: 'Update', color: 3447003 },
  };

  const match = message.match(/^(\w+)(?:\(.+?\))?:/);
  const typeKey = match ? match[1].toLowerCase() : null;
  const type = config[typeKey] || config.default;

  const payload = {
    username: 'NexVid Update',
    content: process.env.DISCORD_ROLE_ID ? `<@&${process.env.DISCORD_ROLE_ID}>` : '',
    embeds: [
      {
        title: `Site ${type.label} Pushed`,
        description: 'A new push has been synchronized with the remote server.',
        color: type.color,
        fields: [
          { name: 'Branch', value: `\`${branch}\``, inline: true },
          { name: 'Commit', value: `\`${sha}\``, inline: true },
          { name: 'Message', value: `\`\`\`${message}\`\`\``, inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    ui.info(`Discord webhook sent: [${type.label}]`);
    return true;
  } catch (err) {
    ui.error(`Discord Webhook: ${err.message}`);
    return false;
  }
}

async function generateCommitMessage() {
  let diff;
  try {
    diff = execSync('git diff --cached', { maxBuffer: 10 * 1024 * 1024 })
      .toString()
      .trim();
  } catch (err) {
    ui.warn('Git Diff Error (Buffer might be exceeded). Proceeding without AI.');
    return null;
  }

  if (!diff) return null;

  const MAX_DIFF_LENGTH = 4000;
  if (diff.length > MAX_DIFF_LENGTH) {
    diff = diff.substring(0, MAX_DIFF_LENGTH) + '\n...[diff truncated]';
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    ui.info('Generating commit message (Groq)...');
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `Generate a strictly compliant Conventional Commit message based on the provided git diff.
Rules:
1. Determine the correct type:
  - feat: A new feature.
  - fix: A bug fix.
  - refactor: A code change that neither fixes a bug nor adds a feature.
  - chore: Updating build tasks, configurations, etc.
  - perf: A performance improvement.
  - sec: Security patches.
2. Determine a short, 1-word scope based on the modified function, feature, or file (e.g., ai, discord, ui, git, worker).
3. Format MUST be exactly: "type(scope): short description in lowercase imperative mood".
4. Maximum description length is 50 characters.
5. Output ONLY the raw string. No markdown formatting, no quotes, no preamble.`,
          },
          { role: 'user', content: diff },
        ],
        max_tokens: 50,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`HTTP ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const rawOutput = data.choices[0].message.content;
    const firstLine = rawOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)[0];

    return firstLine ? firstLine.replace(/^['"]|['"]$/g, '') : null;
  } catch (err) {
    ui.warn(`Groq API Error: ${err.message}`);
    return null;
  }
}

async function ship() {
  const startTime = performance.now();
  const summary = {
    mode: 'Unknown',
    commit: 'None',
    pushed: false,
    discord: false,
    deployWorker: false,
    deployPages: false,
  };

  ui.header('Environment Setup');
  if (!process.env.GROQ_API_KEY) ui.info('GROQ_API_KEY missing - AI features will be disabled.');
  else ui.info('GROQ_API_KEY found.');

  if (!process.env.DISCORD_WEBHOOK)
    ui.info('DISCORD_WEBHOOK missing - Discord notifications disabled.');
  else ui.info('DISCORD_WEBHOOK found.');

  try {
    ui.header('Deployment Mode');
    ui.menu('1', 'Development (Git + Deploy Options)');
    ui.menu('2', 'Preview (Quick Pages deploy to "Preview")');

    const mode = await askChoice('\nChoice (1-2): ', ['1', '2']);

    if (mode === '2') {
      summary.mode = 'Preview';
      ui.step('Deploying Preview');
      summary.deployPages = runCmd('bun run pages:deploy -- --branch preview', 'Pages Deploy');
      return;
    }

    summary.mode = 'Development';
    ui.header('Development Process');

    const gitStatus = execSync('git status --porcelain').toString().trim();

    if (!gitStatus) {
      ui.info('Working tree clean. Skipping commit phase.');
    } else {
      ui.step('Staging files');
      if (!runCmd('git add .', 'Git Add')) throw new Error('Command failed: git add.');

      const useAiChoice = await question('\nUse AI to generate commit message? (y/N): ');
      let finalMsg = '';

      if (useAiChoice.toLowerCase().trim() === 'y') {
        const aiMsg = await generateCommitMessage();
        if (aiMsg) {
          ui.info(`🤖 AI Message: ${format.bold}${format.cyan}${aiMsg}${format.reset}`);
          finalMsg = aiMsg;
        } else {
          ui.warn('AI generation failed. Falling back to manual input.');
          const defaultMsg = `update: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
          const commitMsg = await question(`Commit message [default: ${defaultMsg}]: `);
          finalMsg = commitMsg.trim() || defaultMsg;
        }
      } else {
        const defaultMsg = `update: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
        const commitMsg = await question(`Commit message [default: ${defaultMsg}]: `);
        finalMsg = commitMsg.trim() || defaultMsg;
      }

      summary.commit = finalMsg;

      ui.step(`Creating commit: "${finalMsg}"`);
      if (!runSafeCmd('git', ['commit', '-m', finalMsg], 'Git Commit')) {
        throw new Error('Command failed: git commit.');
      }
    }

    const notifyChoice = await question('\nSend Discord notification? (y/N): ');
    const shouldNotify = notifyChoice.toLowerCase().trim() === 'y';

    const pushChoice = await question('Push to remote origin? (y/N): ');
    if (pushChoice.toLowerCase().trim() === 'y') {
      ui.step('Pushing to remote repository');
      if (runCmd('git push', 'Git Push')) {
        summary.pushed = true;

        if (shouldNotify) {
          ui.step('Sending Discord notification');
          const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
          const sha = execSync('git rev-parse --short HEAD').toString().trim();
          const notifyMessage =
            summary.commit !== 'None'
              ? summary.commit
              : 'Direct push without new commit script msg';
          summary.discord = await sendDiscordNotification(notifyMessage, branch, sha);
        }
      }
    }

    ui.header('Deployment Target');
    ui.menu('1', 'Worker only');
    ui.menu('2', 'Pages only');
    ui.menu('3', 'Both (Worker & Pages)');
    ui.menu('4', 'Skip deployment');

    const deployChoice = await askChoice('\nChoice (1-4): ', ['1', '2', '3', '4']);

    if (deployChoice !== '4') {
      const shouldDeployWorker = deployChoice === '1' || deployChoice === '3';
      const shouldDeployPages = deployChoice === '2' || deployChoice === '3';

      ui.header('Target Environment');
      ui.menu('1', 'Production (main)');
      ui.menu('2', 'Preview (preview)');
      const envChoice = await askChoice('\nChoice (1-2, default: 1): ', ['1', '2'], '1');

      const isPreview = envChoice === '2';
      const targetBranch = isPreview ? 'preview' : 'main';

      if (shouldDeployWorker) {
        ui.step('Deploying Worker');
        summary.deployWorker = runCmd('bun run worker:deploy', 'Worker Deploy');
      }

      if (shouldDeployPages) {
        ui.step(`Deploying Pages to branch "${targetBranch}"`);
        summary.deployPages = runCmd(
          `bun run pages:deploy -- --branch ${targetBranch}`,
          'Pages Deploy',
        );
      }
    }
  } catch (error) {
    ui.error(error.message);
  } finally {
    ui.header('Execution Summary');
    ui.summary('Mode:', summary.mode);
    ui.summary('Commit:', summary.commit);
    ui.summary(
      'Git Push:',
      summary.pushed ? `${format.green}YES${format.reset}` : `${format.dim}NO${format.reset}`,
    );
    ui.summary(
      'Discord:',
      summary.discord ? `${format.green}YES${format.reset}` : `${format.dim}NO${format.reset}`,
    );
    ui.summary(
      'Worker:',
      summary.deployWorker
        ? `${format.green}DEPLOYED${format.reset}`
        : `${format.dim}SKIPPED/FAILED${format.reset}`,
    );
    ui.summary(
      'Pages:',
      summary.deployPages
        ? `${format.green}DEPLOYED${format.reset}`
        : `${format.dim}SKIPPED/FAILED${format.reset}`,
    );

    ui.success('Process completed');
    rl.close();
  }
}

ship();
