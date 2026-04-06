import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Funkcja pomocnicza do wysyłania powiadomienia Discord
async function sendDiscordNotification(type, message, branch, sha) {
  const webhookUrl = process.env.DISCORD_WEBHOOK;
  if (!webhookUrl) {
    console.log('⚠️ Warning: DISCORD_WEBHOOK environment variable is not set. Skipping notification.');
    return;
  }

  const timestamp = new Date().toISOString();
  const colors = {
    'update': 2303786,  // Niebieski/Morski
    'hotfix': 15548997, // Czerwony
    'chore': 10197915,  // Szary
    'feat': 5763719     // Zielony
  };

  const payload = {
    username: "NexVid Update",
    embeds: [{
      title: `Site Update [${type.toUpperCase()}]`,
      description: "A new push has been synchronized with the remote server.",
      color: colors[type] || 2303786,
      fields: [
        { name: "Branch Name", value: `\`${branch}\``, inline: true },
        { name: "Commit Hash", value: `\`${sha}\``, inline: true },
        { name: "Commit Message", value: `\`\`\`${message}\`\`\``, inline: false }
      ],
      timestamp: timestamp
    }]
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log('🔔 Discord notification sent.');
  } catch (err) {
    console.error('❌ Failed to send Discord notification:', err.message);
  }
}

async function ship() {
  try {
    console.log('\n🚢 Choose shipment mode:');
    console.log('1. Development (Git + Choice of Deploy)');
    console.log('2. Preview (Quick Pages deploy to "nexvid")');

    const mode = await question('\nMode (1-2): ');

    if (mode.trim() === '2') {
      console.log('\n🚀 Starting Preview Deployment...');
      execSync('bun run pages:deploy -- --branch nexvid', { stdio: 'inherit' });
      return;
    }

    // DEVELOPMENT MODE
    console.log('\n🛠️ Starting Development Process...\n');

    execSync('git add .', { stdio: 'inherit' });

    const defaultMsg = `Update ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    const commitMsg = await question(`📝 Commit message (default: "${defaultMsg}"): `);
    const finalMsg = commitMsg.trim() || defaultMsg;

    execSync(`git commit -m "${finalMsg}"`, { stdio: 'inherit' });

    // NOWE: Pytanie o powiadomienie Discord przed pushem
    let discordType = null;
    const notifyChoice = await question('\n🔔 Send Discord notification? (y/N): ');

    if (notifyChoice.toLowerCase().trim() === 'y') {
      console.log('1. Update');
      console.log('2. Hotfix');
      console.log('3. Chore');
      console.log('4. Feat');
      const typeChoice = await question('Select notification type (1-4, default: 1): ');

      const types = { '1': 'update', '2': 'hotfix', '3': 'chore', '4': 'feat' };
      discordType = types[typeChoice.trim()] || 'update';
    }

    // 2. Push to GitHub
    const pushChoice = await question('\n⬆️ Push to GitHub? (y/N): ');
    if (pushChoice.toLowerCase().trim() === 'y') {
      console.log('🚀 Pushing to GitHub...');
      execSync('git push', { stdio: 'inherit' });

      // Wyślij powiadomienie po udanym pushu, jeśli wybrano
      if (discordType) {
        const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
        const sha = execSync('git rev-parse --short HEAD').toString().trim();
        await sendDiscordNotification(discordType, finalMsg, branch, sha);
      }
    }

    // 3. Deployment Choice
    console.log('\n🌐 Where do you want to deploy?');
    console.log('1. Worker only');
    console.log('2. Pages only');
    console.log('3. Both (Worker & Pages)');
    console.log('4. None');

    const deployChoice = await question('\nChoice (1-4): ');

    if (deployChoice.trim() !== '4') {
      const selected = deployChoice.trim();
      const shouldDeployWorker = selected === '1' || selected === '3';
      const shouldDeployPages = selected === '2' || selected === '3';

      const envChoice = await question('\n🎯 Target (1. Production, 2. Preview): ');
      const isPreview = envChoice.trim() === '2';
      const branch = isPreview ? 'nexvid' : 'main';

      if (shouldDeployWorker) {
        execSync('bun run worker:deploy', { stdio: 'inherit' });
      }

      if (shouldDeployPages) {
        execSync(`bun run pages:deploy -- --branch ${branch}`, { stdio: 'inherit' });
      }
    }

    console.log('\n✨ All done!\n');
  } catch (error) {
    console.error('\n❌ Error during shipping:', error.message);
  } finally {
    rl.close();
  }
}

ship();
