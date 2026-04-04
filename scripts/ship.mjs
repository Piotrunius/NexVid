import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function ship() {
  try {
    console.log('\n🚢 Choose shipment mode:');
    console.log('1. Development (Git + Choice of Deploy)');
    console.log('2. Preview (Quick Pages deploy to "nexvid")');

    const mode = await question('\nMode (1-2): ');

    if (mode.trim() === '2') {
      console.log('\n🚀 Starting Preview Deployment...');
      console.log('📄 Deploying Pages to branch "nexvid"...');
      execSync('bun run pages:deploy -- --branch nexvid', { stdio: 'inherit' });
      console.log('\n✨ Preview deployed successfully!\n');
      return;
    }

    // DEVELOPMENT MODE
    console.log('\n🛠️ Starting Development Process...\n');

    // 1. Git Add & Commit
    console.log('📦 Staging changes...');
    execSync('git add .', { stdio: 'inherit' });

    const defaultMsg = `Update ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    const commitMsg = await question(`📝 Commit message (default: "${defaultMsg}"): `);
    const finalMsg = commitMsg.trim() || defaultMsg;

    console.log(`\n💾 Committing: "${finalMsg}"...`);
    execSync(`git commit -m "${finalMsg}"`, { stdio: 'inherit' });

    // 2. Push to GitHub
    const pushChoice = await question('\n⬆️ Push to GitHub? (y/N): ');
    if (pushChoice.toLowerCase().trim() === 'y') {
      console.log('🚀 Pushing to GitHub...');
      execSync('git push', { stdio: 'inherit' });
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

      console.log('\n🎯 Target environment:');
      console.log('1. Production');
      console.log('2. Preview');
      const envChoice = await question('Choice (1-2, default: 1): ');
      const isPreview = envChoice.trim() === '2';
      const targetLabel = isPreview ? 'preview' : 'production';
      const branch = isPreview ? 'nexvid' : 'main';

      if (shouldDeployWorker) {
        console.log(`\n⚡ Deploying Worker (${targetLabel})...`);
        if (isPreview) {
          console.log('ℹ️ Worker uses current default wrangler config (no separate preview env configured).');
        }
        execSync('bun run worker:deploy', { stdio: 'inherit' });
      }

      if (shouldDeployPages) {
        console.log(`\n📄 Deploying Pages (${targetLabel}) to branch "${branch}"...`);
        execSync(`bun run pages:build-output && bun run pages:prepare && bunx wrangler pages deploy .vercel/output/static --project-name nexvid --branch ${branch}`, { stdio: 'inherit' });
      }
    } else {
      console.log('\n✅ Skipping deploy.');
    }

    console.log('\n✨ All done!\n');
  } catch (error) {
    console.error('\n❌ Error during shipping:', error.message);
  } finally {
    rl.close();
  }
}

ship();
