import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function sendDiscordNotification(message, branch, sha) {
  const webhookUrl = process.env.DISCORD_WEBHOOK;

  if (!webhookUrl) {
    console.log('\n⚠️  Notification skipped: DISCORD_WEBHOOK environment variable is not set.');
    return;
  }

  const config = {
    feat: { label: 'Feature', color: 5763719 },
    fix: { label: 'Fix', color: 15548997 },
    chore: { label: 'Chore', color: 10197915 },
    refactor: { label: 'Refactor', color: 3447003 },
    perf: { label: 'Performance', color: 15844367 },
    sec: { label: 'Security', color: 0 },
    default: { label: 'Update', color: 1 }
  };

  const match = message.match(/^(\w+)(?:\(.+?\))?:/);
  const typeKey = match ? match[1].toLowerCase() : null;
  const type = config[typeKey] || config.default;

  const payload = {
    username: "NexVid Update",
    embeds: [{
      title: `Site ${type.label} Pushed`,
      description: "A new push has been synchronized with the remote server.",
      color: type.color,
      fields: [
        { name: "Branch", value: `\`${branch}\``, inline: true },
        { name: "Commit", value: `\`${sha}\``, inline: true },
        { name: "Message", value: `\`\`\`${message}\`\`\``, inline: false }
      ],
      timestamp: new Date().toISOString()
    }]
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log(`\n🔔 Powiadomienie Discord wysłane: [${type.label}]`);
  } catch (err) {
    console.error('\n❌ Błąd wysyłania do Discorda:', err.message);
  }
}

async function ship() {
  try {
    console.log('\n🚢 Tryb wysyłki:');
    console.log('1. Development (Git + Wybór Deployu)');
    console.log('2. Preview (Szybki deploy Pages na "nexvid")');

    const mode = await question('\nWybór (1-2): ');

    if (mode.trim() === '2') {
      console.log('\n🚀 Deploy Preview...');
      execSync('bun run pages:deploy -- --branch nexvid', { stdio: 'inherit' });
      console.log('\n✨ Gotowe!');
      return;
    }

    // --- PROCES GIT ---
    console.log('\n🛠️  Rozpoczynam proces Development...\n');

    console.log('📦 Staging files...');
    execSync('git add .', { stdio: 'inherit' });

    const defaultMsg = `update: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    const commitMsg = await question(`📝 Commit message (np. feat: opis) [default: ${defaultMsg}]: `);
    const finalMsg = commitMsg.trim() || defaultMsg;

    console.log(`\n💾 Commitowanie: "${finalMsg}"...`);
    execSync(`git commit -m "${finalMsg}"`, { stdio: 'inherit' });

    // --- OPCJA DISCORD ---
    const notifyChoice = await question('\n🔔 Czy wysłać powiadomienie na Discord? (y/N): ');
    const shouldNotify = notifyChoice.toLowerCase().trim() === 'y';

    // --- PUSH ---
    const pushChoice = await question('\n⬆️  Push do GitHub? (y/N): ');
    if (pushChoice.toLowerCase().trim() === 'y') {
      console.log('🚀 Pushing...');
      execSync('git push', { stdio: 'inherit' });

      if (shouldNotify) {
        const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
        const sha = execSync('git rev-parse --short HEAD').toString().trim();
        await sendDiscordNotification(finalMsg, branch, sha);
      }
    }

    // --- DEPLOYMENT ---
    console.log('\n🌐 Gdzie chcesz wdrożyć zmiany?');
    console.log('1. Worker only');
    console.log('2. Pages only');
    console.log('3. Both (Worker & Pages)');
    console.log('4. None');

    const deployChoice = await question('\nWybór (1-4): ');

    if (deployChoice.trim() !== '4') {
      const selected = deployChoice.trim();
      const shouldDeployWorker = selected === '1' || selected === '3';
      const shouldDeployPages = selected === '2' || selected === '3';

      console.log('\n🎯 Środowisko:');
      console.log('1. Production (main)');
      console.log('2. Preview (nexvid)');
      const envChoice = await question('Wybór (1-2, default: 1): ');

      const isPreview = envChoice.trim() === '2';
      const branch = isPreview ? 'nexvid' : 'main';

      if (shouldDeployWorker) {
        console.log(`\n⚡ Deploying Worker...`);
        execSync('bun run worker:deploy', { stdio: 'inherit' });
      }

      if (shouldDeployPages) {
        console.log(`\n📄 Deploying Pages do brancha "${branch}"...`);
        execSync(`bun run pages:deploy -- --branch ${branch}`, { stdio: 'inherit' });
      }
    } else {
      console.log('\n✅ Pominięto wdrożenie.');
    }

    console.log('\n✨ Wszystkie zadania zakończone!\n');

  } catch (error) {
    console.error('\n❌ Błąd podczas shipu:', error.message);
  } finally {
    rl.close();
  }
}

ship();
