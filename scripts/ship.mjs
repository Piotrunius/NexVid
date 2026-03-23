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
      execSync('npm run pages:deploy -- --branch nexvid', { stdio: 'inherit' });
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
      const getPagesBranch = async () => {
        console.log('\n🌿 Which branch for Pages?');
        console.log('1. main');
        console.log('2. nexvid (preview)');
        const branchChoice = await question('Choice (1-2, default: 1): ');
        return branchChoice.trim() === '2' ? 'nexvid' : 'main';
      };

      if (deployChoice.trim() === '1' || deployChoice.trim() === '3') {
        console.log('\n⚡ Deploying Worker...');
        execSync('npm run worker:deploy', { stdio: 'inherit' });
      }

      if (deployChoice.trim() === '2' || deployChoice.trim() === '3') {
        const branch = await getPagesBranch();
        console.log(`\n📄 Deploying Pages to branch "${branch}"...`);
        // Force npm usage for consistent environment
        execSync(`npm run pages:build-output && npm run pages:prepare && wrangler pages deploy .vercel/output/static --project-name nexvid --branch ${branch}`, { stdio: 'inherit' });
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
