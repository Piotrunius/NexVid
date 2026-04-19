import { execFileSync, execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';

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

      const useAiChoice = await question('\nUse OpenCommit to generate commit message? (y/N): ');

      if (useAiChoice.toLowerCase().trim() === 'y') {
        ui.step('Running OpenCommit via npx...');
        try {
          // Uruchomienie OpenCommit. Przejmuje kontrolę nad konsolą.
          execSync('npx opencommit --yes', { stdio: 'inherit' });

          // Pobranie ostatniej wiadomości commit po zakończeniu działania OpenCommit
          const lastCommitMsg = execSync('git log -1 --pretty=%B').toString().trim();
          summary.commit = lastCommitMsg;
          ui.success('Commit created by OpenCommit.');
        } catch (error) {
          ui.warn('OpenCommit failed or aborted. Falling back to manual commit.');
          const defaultMsg = `update: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
          const commitMsg = await question(`Commit message [default: ${defaultMsg}]: `);
          const finalMsg = commitMsg.trim() || defaultMsg;
          summary.commit = finalMsg;
          if (!runSafeCmd('git', ['commit', '-m', finalMsg], 'Git Commit')) {
            throw new Error('Command failed: git commit.');
          }
        }
      } else {
        const defaultMsg = `update: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
        const commitMsg = await question(`Commit message [default: ${defaultMsg}]: `);
        const finalMsg = commitMsg.trim() || defaultMsg;
        summary.commit = finalMsg;

        ui.step(`Creating commit: "${finalMsg}"`);
        if (!runSafeCmd('git', ['commit', '-m', finalMsg], 'Git Commit')) {
          throw new Error('Command failed: git commit.');
        }
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
    // Skrócenie podsumowania wiadomości commit w logach jeśli jest za długa
    const displayCommit =
      summary.commit.length > 50 ? summary.commit.substring(0, 47) + '...' : summary.commit;
    ui.summary('Commit:', displayCommit);
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
