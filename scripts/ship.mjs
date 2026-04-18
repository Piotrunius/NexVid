import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on('SIGINT', () => {
  console.log('\n\x1b[31m ✖  Process aborted by user (SIGINT).\x1b[0m');
  process.exit(0);
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
};

const question = (query) =>
  new Promise((resolve) => rl.question(`${format.cyan} ❯ ${format.reset} ${query}`, resolve));

const runCmd = (cmd, label) => {
  ui.execBoundary(label);
  execSync(cmd, { stdio: 'inherit' });
  ui.execBoundary('END');
};

async function sendDiscordNotification(message, branch, sha) {
  const webhookUrl = process.env.DISCORD_WEBHOOK;

  if (!webhookUrl) {
    ui.warn('Notification skipped: DISCORD_WEBHOOK environment variable is not set.');
    return false;
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
    ui.info(`Discord webhook sent: [${type.label}]`);
    return true;
  } catch (err) {
    ui.error(`Discord Webhook: ${err.message}`);
    return false;
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

  try {
    ui.header('Deployment Mode');
    console.log('  1. Development (Git + Deploy Options)');
    console.log('  2. Preview (Quick Pages deploy to "Preview")');

    const mode = await question('\nChoice (1-2): ');

    if (mode.trim() === '2') {
      summary.mode = 'Preview';
      summary.deployPages = true;
      ui.step('Deploying Preview');
      runCmd('bun run pages:deploy -- --branch preview', 'Pages Deploy');
      return;
    }

    summary.mode = 'Development';
    ui.header('Development Process');

    const gitStatus = execSync('git status --porcelain').toString().trim();
    if (!gitStatus) {
      ui.warn('No modifications in working tree. Aborting process...');
      return;
    }

    ui.step('Staging files');
    runCmd('git add .', 'Git Add');

    const defaultMsg = `update: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    const commitMsg = await question(`Commit message [default: ${defaultMsg}]: `);
    const finalMsg = commitMsg.trim() || defaultMsg;
    summary.commit = finalMsg;

    ui.step(`Creating commit: "${finalMsg}"`);
    runCmd(`git commit -m "${finalMsg}"`, 'Git Commit');

    const notifyChoice = await question('\nSend Discord notification? (y/N): ');
    const shouldNotify = notifyChoice.toLowerCase().trim() === 'y';

    const pushChoice = await question('Push to remote origin? (y/N): ');
    if (pushChoice.toLowerCase().trim() === 'y') {
      summary.pushed = true;
      ui.step('Pushing to remote repository');
      runCmd('git push', 'Git Push');

      if (shouldNotify) {
        ui.step('Sending Discord notification');
        const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
        const sha = execSync('git rev-parse --short HEAD').toString().trim();
        summary.discord = await sendDiscordNotification(finalMsg, branch, sha);
      }
    }

    ui.header('Deployment Target');
    console.log('  1. Worker only');
    console.log('  2. Pages only');
    console.log('  3. Both (Worker & Pages)');
    console.log('  4. Skip deployment');

    const deployChoice = await question('\nChoice (1-4): ');

    if (deployChoice.trim() !== '4') {
      const selected = deployChoice.trim();
      const shouldDeployWorker = selected === '1' || selected === '3';
      const shouldDeployPages = selected === '2' || selected === '3';

      ui.header('Target Environment');
      console.log('  1. Production (main)');
      console.log('  2. Preview (preview)');
      const envChoice = await question('\nChoice (1-2, default: 1): ');

      const isPreview = envChoice.trim() === '2';
      const targetBranch = isPreview ? 'preview' : 'main';

      if (shouldDeployWorker) {
        summary.deployWorker = true;
        ui.step('Deploying Worker');
        runCmd('bun run worker:deploy', 'Worker Deploy');
      }

      if (shouldDeployPages) {
        summary.deployPages = true;
        ui.step(`Deploying Pages to branch "${targetBranch}"`);
        runCmd(`bun run pages:deploy -- --branch ${targetBranch}`, 'Pages Deploy');
      }
    } else {
      ui.info('Deployment skipped.');
    }
  } catch (error) {
    ui.error(error.message);
  } finally {
    const executionTime = ((performance.now() - startTime) / 1000).toFixed(2);

    ui.header('Execution Summary');
    console.log(`  Mode:        ${summary.mode}`);
    console.log(`  Commit:      ${summary.commit}`);
    console.log(
      `  Git Push:    ${summary.pushed ? format.green + 'YES' : format.dim + 'NO'}${format.reset}`,
    );
    console.log(
      `  Discord:     ${summary.discord ? format.green + 'YES' : format.dim + 'NO'}${format.reset}`,
    );
    console.log(
      `  Worker:      ${summary.deployWorker ? format.green + 'DEPLOYED' : format.dim + 'SKIPPED'}${format.reset}`,
    );
    console.log(
      `  Pages:       ${summary.deployPages ? format.green + 'DEPLOYED' : format.dim + 'SKIPPED'}${format.reset}`,
    );

    ui.success('Process completed');
    rl.close();
  }
}

ship();
