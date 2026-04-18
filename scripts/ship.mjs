import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
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
};

const ui = {
  header: (text) =>
    console.log(`\n${format.bold}${format.blue}=== ${text.toUpperCase()} ===${format.reset}\n`),
  step: (text) => console.log(`${format.green}[+]${format.reset} ${text}`),
  info: (text) => console.log(`${format.dim} -  ${text}${format.reset}`),
  warn: (text) => console.log(`\n${format.yellow}[!]${format.reset} ${text}`),
  error: (text) => console.error(`\n${format.red}[x] ERROR:${format.reset} ${text}`),
  success: (text) => console.log(`\n${format.bold}${format.green}[V] ${text}${format.reset}\n`),
};

const question = (query) =>
  new Promise((resolve) => rl.question(`${format.cyan}?${format.reset} ${query}`, resolve));

async function sendDiscordNotification(message, branch, sha) {
  const webhookUrl = process.env.DISCORD_WEBHOOK;

  if (!webhookUrl) {
    ui.warn('Notification skipped: DISCORD_WEBHOOK environment variable is not set.');
    return;
  }

  const config = {
    feat: { label: 'Feature', color: 5763719 },
    fix: { label: 'Fix', color: 15548997 },
    chore: { label: 'Chore', color: 10197915 },
    refactor: { label: 'Refactor', color: 3447003 },
    perf: { label: 'Performance', color: 15844367 },
    sec: { label: 'Security', color: 0 },
    default: { label: 'Update', color: 1 },
  };

  const match = message.match(/^(\w+)(?:\(.+?\))?:/);
  const typeKey = match ? match[1].toLowerCase() : null;
  const type = config[typeKey] || config.default;

  const payload = {
    username: 'NexVid Update',
    content: '<@&1493288088166731836>',
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
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    ui.info(`Discord notification sent: [${type.label}]`);
  } catch (err) {
    ui.error(`Sending to Discord: ${err.message}`);
  }
}

async function ship() {
  try {
    ui.header('Shipping Mode');
    console.log('  1. Development (Git + Deploy selection)');
    console.log('  2. Preview (Quick Pages deploy to "Preview")');

    const mode = await question('\nChoice (1-2): ');

    if (mode.trim() === '2') {
      ui.step('Deploying Preview...');
      execSync('bun run pages:deploy -- --branch preview', { stdio: 'inherit' });
      ui.success('Done');
      return;
    }

    ui.header('Development Process');

    ui.step('Staging files...');
    execSync('git add .', { stdio: 'inherit' });

    const defaultMsg = `update: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    const commitMsg = await question(
      `Commit message (e.g. feat: description) [default: ${defaultMsg}]: `,
    );
    const finalMsg = commitMsg.trim() || defaultMsg;

    ui.step(`Committing: "${finalMsg}"`);
    execSync(`git commit -m "${finalMsg}"`, { stdio: 'inherit' });

    const notifyChoice = await question('\nSend a Discord notification? (y/N): ');
    const shouldNotify = notifyChoice.toLowerCase().trim() === 'y';

    const pushChoice = await question('Push to GitHub? (y/N): ');
    if (pushChoice.toLowerCase().trim() === 'y') {
      ui.step('Pushing to remote...');
      execSync('git push', { stdio: 'inherit' });

      if (shouldNotify) {
        const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
        const sha = execSync('git rev-parse --short HEAD').toString().trim();
        await sendDiscordNotification(finalMsg, branch, sha);
      }
    }

    ui.header('Deployment Target');
    console.log('  1. Worker only');
    console.log('  2. Pages only');
    console.log('  3. Both (Worker & Pages)');
    console.log('  4. None');

    const deployChoice = await question('\nChoice (1-4): ');

    if (deployChoice.trim() !== '4') {
      const selected = deployChoice.trim();
      const shouldDeployWorker = selected === '1' || selected === '3';
      const shouldDeployPages = selected === '2' || selected === '3';

      ui.header('Environment');
      console.log('  1. Production (main)');
      console.log('  2. Preview (preview)');
      const envChoice = await question('\nChoice (1-2, default: 1): ');

      const isPreview = envChoice.trim() === '2';
      const branch = isPreview ? 'preview' : 'main';

      if (shouldDeployWorker) {
        ui.step('Deploying Worker...');
        execSync('bun run worker:deploy', { stdio: 'inherit' });
      }

      if (shouldDeployPages) {
        ui.step(`Deploying Pages to branch "${branch}"...`);
        execSync(`bun run pages:deploy -- --branch ${branch}`, { stdio: 'inherit' });
      }
    } else {
      ui.info('Deployment skipped.');
    }

    ui.success('All tasks completed');
  } catch (error) {
    ui.error(error.message);
  } finally {
    rl.close();
  }
}

ship();
